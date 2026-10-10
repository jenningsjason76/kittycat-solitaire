// Game controller: current game, undo history, feedback log, autosave and solver bookkeeping.
import {
  K, DRAW, apply, isWon, newGame, randomSeed, legalMoves, describe, moveEq, canAutoFinish, nextFoundationMove, boardKey,
} from './engine.js';
import { critique } from './critic.js';
import { kvGet, kvSet, kvDel } from './storage.js';
import { settings } from './settings.js';

const SAVE_KEY = 'currentGame';
const KEEP_UNDO = 60;
const UNDO_GRACE_MS = 6000;                        // any move can be taken back for this long (fixes misdrops)
const NOTE_COOLDOWN = 6;                          // the same kind of note is not shown again for this many moves
const ANALYSIS_LIMIT = { 1: 40000, 3: 15000 };
const DEAD_END_LIMIT = { 1: 120000, 3: 50000 };   // a bigger budget for the rare, explicit "can this still be won?" check   // draw 3 gets fewer nodes so it stays responsive

export class GameController {
  constructor({ stats, solver, fx }) {
    this.stats = stats; this.solver = solver; this.fx = fx;
    this.listeners = new Set();
    this.state = newGame(randomSeed(), 1, 'standard');
    this.history = [];            // snapshots of the state before each move
    this.serials = [];            // one id per move, parallel to history
    this.moveTimes = [];          // when each move was made, parallel to history
    this.graceTimer = null;
    this.nextSerial = 1;
    this.nextEntryId = 1;
    this.feedbackLog = [];
    this.lastShown = {};          // note kind -> move number it was last shown at
    this.lastMove = null;         // read once by the board, to animate it
    this.dealId = 0;              // changes whenever a new game is dealt
    this.deadEnd = null;          // { key } while the "can't be won from here" prompt is showing
    this.deadEndAck = null;       // board she chose to keep playing from
    this.lastRecycleBoard = null; // board at the previous time the stock was turned over
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

  /** Moves with a concrete cost. Tips (a skipped free move) are counted separately. */
  get lazyCount() { return this.feedbackLog.filter((e) => e.severity !== 'tip').length; }
  get tipCount() { return this.feedbackLog.filter((e) => e.severity === 'tip').length; }

  get activeEntry() { return this.feedbackLog.find((e) => e.id === this.activeEntryId) || null; }
  get isStuck() { return !this.isDealing && !isWon(this.state) && legalMoves(this.state).length === 0; }
  get canAutoFinish() { return !this.isDealing && canAutoFinish(this.state); }

  canUndo() {
    if (!this.history.length || this.isAutoFinishing || this.isDealing) return false;
    if (settings.get('undoPolicy') === 'unlimited') return true;
    // The move she just made can always be taken back for a few seconds (a misdrop is not a "mistake").
    if (Date.now() - (this.moveTimes[this.moveTimes.length - 1] || 0) < UNDO_GRACE_MS) return true;
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
      state: s.state, history: s.history || [], serials: s.serials || [], moveTimes: (s.history || []).map(() => 0),
      nextSerial: s.nextSerial || 1, nextEntryId: s.nextEntryId || 1,
      feedbackLog: s.feedbackLog || [], lastShown: {}, winnability: s.winnability || 'unknown',
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
      lazyMoves: this.lazyCount,
      costMoves: this.feedbackLog.filter((e) => e.costGame).length,
      undone: this.feedbackLog.filter((e) => e.undone).length,
      feedbackWasOn: settings.get('feedbackOn'),
    });
    if (won) await kvDel(SAVE_KEY);
  }

  // ---------- new game ----------

  /** Clears everything that belongs to the game that just ended. */
  resetForNewDeal() {
    this.history = []; this.serials = []; this.moveTimes = []; this.feedbackLog = []; this.lastShown = {};
    this.deadEnd = null; this.deadEndAck = null; this.lastRecycleBoard = null;
    this.activeEntryId = null; this.revealedEntryId = null; this.highlight = null;
    this.winningLine = []; this.winnability = 'unknown'; this.dealNote = null; this.isAutoFinishing = false;
    this.dealToken++;
  }

  /** The same cards again, dealt fresh. */
  async replayDeal() {
    const { seed, draw, scoring } = this.state;
    await this.recordResult(false);
    this.resultRecorded = false;
    this.resetForNewDeal();
    this.isDealing = false;
    this.state = newGame(seed, draw, scoring);
    this.dealId++;
    this.emit();
    this.analyzeStart(this.state, this.dealToken);
  }

  /** Takes back the move with this id and every move after it (used by the dead-end screen). */
  goBackTo(serial) {
    const i = this.serials.indexOf(serial);
    if (i < 0) return false;
    while (this.serials.length > i) {
      const snap = this.history.pop(), s = this.serials.pop();
      this.moveTimes.pop();
      this.feedbackLog.forEach((e) => { if (e.serial === s) e.undone = true; });
      this.state = snap.state; this.winnability = snap.winnability; this.winningLine = snap.line;
    }
    this.deadEnd = null; this.deadEndAck = null; this.lastRecycleBoard = null; this.lastMove = null;
    this.activeEntryId = null; this.revealedEntryId = null; this.highlight = null;
    this.emit();
    return true;
  }

  /** Cards on the foundations. */
  get cardsHome() { return this.state.found.reduce((a, b) => a + b, 0); }

  async newGame() {
    await this.recordResult(false);          // an unfinished game counts as played, not won
    this.resultRecorded = false;
    const draw = settings.get('drawMode'), scoring = settings.get('scoringMode');
    this.resetForNewDeal();
    const token = this.dealToken;

    if (settings.get('winnableDeals')) {
      this.isDealing = true;
      this.emit();
      let found;
      try { found = await this.solver.deal(draw, scoring); }
      catch { found = { game: newGame(randomSeed(), draw, scoring), line: null }; }
      if (token !== this.dealToken) return;
      this.isDealing = false;
      this.state = found.game;
      this.dealId++;
      this.deadEnd = null;
      if (found.line) { this.winnability = 'winnable'; this.winningLine = found.line; }
      else { this.dealNote = 'Deal not verified'; }
      this.emit();
      this.save();
    } else {
      this.isDealing = false;
      this.state = newGame(randomSeed(), draw, scoring);
      this.dealId++;
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
    this.lastMove = move;
    this.serials.push(serial);
    this.moveTimes.push(Date.now());
    clearTimeout(this.graceTimer);                       // redraw the Undo button when the grace period ends
    this.graceTimer = setTimeout(() => this.emit(), UNDO_GRACE_MS + 60);
    this.state = next;
    this.activeEntryId = null; this.revealedEntryId = null; this.highlight = null;
    this.deadEnd = null;

    if (judge) this.fx.play(move[0] === K.STOCK ? 'draw' : move[2] === K.FOUND ? 'foundation' : 'place');

    if (tracking) {
      const found = critique(before, move);
      if (found) {
        this.addEntry(serial, next.moves, found.kind, found.better,
          found.better ? describe(before, found.better) : null, false, found.severity || 'lazy');
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

    // Turning the stock over again with no change to the board means a whole pass found nothing to play.
    if (move[0] === K.STOCK && before.stock.length === 0 && next.stock.length > 0) this.noteRecycle(next, serial);

    if (isWon(next)) { this.recordResult(true); this.fx.play('win'); }
    this.emit();
    return true;
  }

  denied() { this.fx.play('denied'); }

  undo() {
    if (!this.canUndo()) return;
    const snap = this.history.pop();
    const serial = this.serials.pop();
    this.moveTimes.pop();
    this.feedbackLog.forEach((e) => {
      if (e.serial !== serial) return;
      e.undone = true;
      const key = `${e.kind}:${e.severity || 'lazy'}`;
      if (this.lastShown[key] === e.moveNumber) delete this.lastShown[key];   // a note after an undo is not "repeated"
    });
    this.state = snap.state; this.winnability = snap.winnability; this.winningLine = snap.line;
    this.activeEntryId = null; this.revealedEntryId = null; this.highlight = null;
    this.deadEnd = null; this.lastRecycleBoard = null; this.lastMove = null;
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

  // ---------- dead ends ----------

  noteRecycle(s, serial) {
    const key = boardKey(s);
    const stalled = this.lastRecycleBoard === key;
    this.lastRecycleBoard = key;
    if (!stalled || this.deadEndAck === key) return;
    if (this.winnability === 'unwinnable') { this.deadEnd = { key }; return; }   // already proven earlier
    this.checkDeadEnd(s, serial, key);
  }

  /** Asks the solver in the background. The prompt appears ONLY if it proves no win exists. */
  async checkDeadEnd(s, serial, key) {
    const token = this.dealToken;
    const out = await this.solver.solve(s, DEAD_END_LIMIT[s.draw]).catch(() => null);
    // Drawing cards does not change the board, so a proof still holds if she kept drawing while the solver worked.
    // If she has played a card (or undone), or started a new game, the answer is stale.
    if (!out || token !== this.dealToken || this.isDealing || boardKey(this.state) !== key) return;
    if (out.result === 'lost') {
      this.winnability = 'unwinnable'; this.winningLine = [];
      this.deadEnd = { key };
    } else if (out.result === 'win') {
      this.winnability = 'winnable'; this.winningLine = out.line;
    }                                                                           // 'unknown' = say nothing
    this.emit();
  }

  dismissDeadEnd() {
    if (this.deadEnd) this.deadEndAck = this.deadEnd.key;
    this.deadEnd = null;
    this.emit();
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

  addEntry(serial, moveNumber, kind, better, betterText, costGame, severity = 'lazy') {
    const entry = { id: this.nextEntryId++, serial, moveNumber, kind, severity, betterMove: better || null,
      betterText, costGame, undone: false };
    this.feedbackLog.push(entry);                       // always counted in the summary and stats
    const key = `${kind}:${severity}`;
    const last = this.lastShown[key];
    const repeat = !costGame && last !== undefined && moveNumber >= last && moveNumber - last < NOTE_COOLDOWN;
    if (repeat) { entry.quiet = true; return; }         // logged, but no banner and no sound
    this.lastShown[key] = moveNumber;
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

