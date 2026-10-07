// Game controller: current game, undo history, feedback log, autosave and solver bookkeeping.
import {
  K, DRAW, apply, isWon, newGame, randomSeed, legalMoves, describe, moveEq, canAutoFinish, nextFoundationMove,
} from './engine.js';
import { critique } from './critic.js';
import { kvGet, kvSet, kvDel } from './storage.js';
import { settings } from './settings.js';

const SAVE_KEY = 'currentGame';
const KEEP_UNDO = 60;
const ANALYSIS_LIMIT = { 1: 40000, 3: 15000 };   // draw 3 gets fewer nodes so it stays responsive

export class GameController {
  constructor({ stats, solver, fx }) {
    this.stats = stats; this.solver = solver; this.fx = fx;
    this.listeners = new Set();
    this.state = newGame(randomSeed(), 1, 'standard');
    this.history = [];            // snapshots of the state before each move
    this.serials = [];            // one id per move, parallel to history
    this.nextSerial = 1;
    this.nextEntryId = 1;
    this.feedbackLog = [];
    this.activeEntryId = null;
    this.revealedEntryId = null;
    this.highlight = null;
    this.winnability = 'unknown';  // 'winnable' | 'unwinnable' | 'unknown'
    this.winningLine = [];
    this.dealNote = null;
    this.isDealing = false;
    this.isAutoFinishing = false;
    this.resultRecorded = false;
    this.dealToken = 0;
    this.highlightToken = 0;
    this.saveTimer = null;
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn()); this.scheduleSave(); }

  get activeEntry() { return this.feedbackLog.find((e) => e.id === this.activeEntryId) || null; }
  get isStuck() { return !this.isDealing && !isWon(this.state) && legalMoves(this.state).length === 0; }
  get canAutoFinish() { return !this.isDealing && canAutoFinish(this.state); }

  canUndo() {
    if (!this.history.length || this.isAutoFinishing || this.isDealing) return false;
    if (settings.get('undoPolicy') === 'unlimited') return true;
    const serial = this.serials[this.serials.length - 1];
    return this.feedbackLog.some((e) => e.serial === serial && !e.undone);
  }

  // ---------- autosave ----------

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 400);
  }

  async save() {
    clearTimeout(this.saveTimer);
    if (this.isDealing) return;
    if (isWon(this.state)) { await kvDel(SAVE_KEY); return; }
    await kvSet(SAVE_KEY, {
      state: this.state,
      history: this.history.slice(-KEEP_UNDO),
      serials: this.serials.slice(-KEEP_UNDO),
      nextSerial: this.nextSerial, nextEntryId: this.nextEntryId,
      feedbackLog: this.feedbackLog, winnability: this.winnability, winningLine: this.winningLine,
      resultRecorded: this.resultRecorded, dealNote: this.dealNote, savedAt: Date.now(),
    });
  }

  /** Returns true if an unfinished game was restored. */
  async restore() {
    const s = await kvGet(SAVE_KEY);
    if (!s || !s.state || isWon(s.state)) return false;
    Object.assign(this, {
      state: s.state, history: s.history || [], serials: s.serials || [],
      nextSerial: s.nextSerial || 1, nextEntryId: s.nextEntryId || 1,
      feedbackLog: s.feedbackLog || [], winnability: s.winnability || 'unknown',
      winningLine: s.winningLine || [], resultRecorded: !!s.resultRecorded, dealNote: s.dealNote || null,
      activeEntryId: null, revealedEntryId: null, highlight: null, isDealing: false,
    });
    this.emit();
    return true;
  }

  // ---------- results ----------

  async recordResult(won) {
    if (this.resultRecorded || this.state.moves === 0) return;
    this.resultRecorded = true;
    await this.stats.add({
      drawMode: this.state.draw, scoring: this.state.scoring, won,
      moves: this.state.moves, score: this.state.score,
      lazyMoves: this.feedbackLog.length,
      costMoves: this.feedbackLog.filter((e) => e.costGame).length,
      undone: this.feedbackLog.filter((e) => e.undone).length,
      feedbackWasOn: settings.get('feedbackOn'),
    });
    if (won) await kvDel(SAVE_KEY);
  }

  // ---------- new game ----------

  async newGame() {
    await this.recordResult(false);          // an unfinished game counts as played, not won
    this.resultRecorded = false;
    const draw = settings.get('drawMode'), scoring = settings.get('scoringMode');
    this.history = []; this.serials = []; this.feedbackLog = [];
    this.activeEntryId = null; this.revealedEntryId = null; this.highlight = null;
    this.winningLine = []; this.winnability = 'unknown'; this.dealNote = null; this.isAutoFinishing = false;
    const token = ++this.dealToken;

    if (settings.get('winnableDeals')) {
      this.isDealing = true;
      this.emit();
      let found;
      try { found = await this.solver.deal(draw, scoring); }
      catch { found = { game: newGame(randomSeed(), draw, scoring), line: null }; }
      if (token !== this.dealToken) return;
      this.isDealing = false;
      this.state = found.game;
      if (found.line) { this.winnability = 'winnable'; this.winningLine = found.line; }
      else { this.dealNote = 'Deal not verified'; }
      this.emit();
      this.save();
    } else {
      this.isDealing = false;
      this.state = newGame(randomSeed(), draw, scoring);
      this.emit();
      this.analyzeStart(this.state, token);
    }
  }

  // ---------- moves ----------

  perform(move, { critique: judge = true } = {}) {
    if (this.isDealing) return false;
    const before = this.state;
    const next = apply(before, move);
    if (!next) return false;

    const serial = this.nextSerial++;
    const priorWin = this.winnability, priorLine = this.winningLine;
    const tracking = judge && settings.get('feedbackOn');

    this.history.push({ state: before, winnability: priorWin, line: priorLine });
    this.serials.push(serial);
    this.state = next;
    this.activeEntryId = null; this.revealedEntryId = null; this.highlight = null;

    if (judge) this.fx.play(move[0] === K.STOCK ? 'draw' : move[2] === K.FOUND ? 'foundation' : 'place');

    if (tracking) {
      const found = critique(before, move);
      if (found) {
        this.addEntry(serial, next.moves, found.kind, found.better,
          found.better ? describe(before, found.better) : null, false);
      }
    }

    if (priorWin === 'winnable' && priorLine.length && moveEq(priorLine[0], move)) {
      this.winningLine = priorLine.slice(1);            // still on a known winning line
    } else if (priorWin === 'unwinnable') {
      // already lost; nothing more to learn
    } else {
      this.winnability = 'unknown';
      this.winningLine = [];
      if (tracking) this.analyze(before, next, serial, priorWin === 'winnable', priorLine);
    }

    if (isWon(next)) { this.recordResult(true); this.fx.play('win'); }
    this.emit();
    return true;
  }

  denied() { this.fx.play('denied'); }

  undo() {
    if (!this.canUndo()) return;
    const snap = this.history.pop();
    const serial = this.serials.pop();
    this.feedbackLog.forEach((e) => { if (e.serial === serial) e.undone = true; });
    this.state = snap.state; this.winnability = snap.winnability; this.winningLine = snap.line;
    this.activeEntryId = null; this.revealedEntryId = null; this.highlight = null;
    this.emit();
  }

  async autoFinish() {
    if (!this.canAutoFinish || this.isAutoFinishing) return;
    this.isAutoFinishing = true; this.emit();
    while (this.isAutoFinishing) {
      const m = nextFoundationMove(this.state);
      if (!m) break;
      this.perform(m, { critique: false });
      await new Promise((r) => setTimeout(r, 90));
    }
    this.isAutoFinishing = false; this.emit();
  }

  // ---------- feedback ----------

  dismissNote() { this.activeEntryId = null; this.emit(); }

  showBetterMove(entry) {
    if (!entry.betterMove) return;
    this.highlight = entry.betterMove;
    this.revealedEntryId = entry.id;
    const token = ++this.highlightToken;
    this.emit();
    setTimeout(() => { if (this.highlightToken === token) { this.highlight = null; this.emit(); } }, 5000);
  }

  addEntry(serial, moveNumber, kind, better, betterText, costGame) {
    const entry = { id: this.nextEntryId++, serial, moveNumber, kind, betterMove: better || null,
      betterText, costGame, undone: false };
    this.feedbackLog.push(entry);
    if (this.serials[this.serials.length - 1] === serial) this.activeEntryId = entry.id;
    this.fx.play('flagged');
  }

  // ---------- background analysis ----------

  async analyzeStart(start, token) {
    const out = await this.solver.solve(start, ANALYSIS_LIMIT[start.draw]).catch(() => null);
    if (!out || token !== this.dealToken || this.serials.length) return;
    if (out.result === 'win') { this.winnability = 'winnable'; this.winningLine = out.line; }
    else if (out.result === 'lost') { this.winnability = 'unwinnable'; this.dealNote = "This deal can't be won"; }
    this.emit();
  }

  async analyze(before, after, serial, wasWinnable, oldLine) {
    const limit = ANALYSIS_LIMIT[after.draw];
    const out = await this.solver.solve(after, limit).catch(() => null);
    if (!out) return;
    let rescue = null;
    if (wasWinnable && out.result === 'lost') {
      if (oldLine.length) rescue = oldLine[0];
      else {
        const prev = await this.solver.solve(before, limit).catch(() => null);
        if (prev && prev.result === 'win' && prev.line.length) rescue = prev.line[0];
      }
    }
    const isLatest = this.serials[this.serials.length - 1] === serial;
    const stillPlayed = this.serials.includes(serial);
    if (out.result === 'win') {
      if (isLatest) { this.winnability = 'winnable'; this.winningLine = out.line; }
    } else if (out.result === 'lost') {
      if (isLatest) { this.winnability = 'unwinnable'; this.winningLine = []; }
      if (wasWinnable && stillPlayed) this.markCostGame(serial, before, rescue);
    }
    this.emit();
  }

  markCostGame(serial, before, rescue) {
    const entry = this.feedbackLog.find((e) => e.serial === serial);
    if (entry) {
      entry.costGame = true;
      if (!entry.betterMove && rescue) { entry.betterMove = rescue; entry.betterText = describe(before, rescue); }
      if (this.serials[this.serials.length - 1] === serial) this.activeEntryId = entry.id;
      this.fx.play('flagged');
    } else {
      const index = this.serials.indexOf(serial);
      if (index < 0) return;
      const number = this.state.moves - (this.serials.length - 1 - index);
      this.addEntry(serial, number, 'costGame', rescue, rescue ? describe(before, rescue) : null, true);
    }
  }
}

