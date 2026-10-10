// Starts the app: wires the top bar, banner, overlays and the service worker.
import { settings } from './settings.js';
import { Stats } from './stats.js';
import { SolverClient } from './solver-client.js';
import { GameAudio } from './audio.js';
import { GameController } from './store.js';
import { Board } from './board.js';
import { message } from './text.js';
import { openMovesCheck, openSettings, openStats, openSummary, closeDialog } from './dialogs.js';
import { requestPersistence } from './storage.js';
import { isWon } from './engine.js';
import { catHTML, setCatState } from './cat.js';
import { icon } from './icons.js';
import { playVictory } from './victory.js';

const $ = (id) => document.getElementById(id);
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

const stats = new Stats();
const fx = new GameAudio();
const solver = new SolverClient();
const ctl = new GameController({ stats, solver, fx });
const ctx = { stats, ctl };
window.kittycat = { ctl, stats, settings, fx };         // handy for debugging and tests

const board = new Board($('board'), ctl);

// ---------- top bar ----------

function statusText() {
  const s = ctl.state;
  if (s.scoring === 'none') return `${s.moves} moves`;
  if (s.scoring === 'vegas') return `${s.score < 0 ? '-$' + Math.abs(s.score) : '$' + s.score} · ${s.moves} moves`;
  return `Score ${s.score} · ${s.moves} moves`;
}

function renderBar() {
  const status = $('status'); status.replaceChildren();
  const pill = mk('span', 'pill'); const paw = mk('span', 'paw'); paw.innerHTML = icon('paw', 15);
  pill.append(paw, document.createTextNode(statusText())); status.append(pill);
  if (ctl.dealNote) status.append(mk('small', '', ctl.dealNote));
  $('finishBtn').innerHTML = icon('check', 18) + '<span>Finish</span>';
  $('undoBtn').disabled = !ctl.canUndo();
  $('finishBtn').hidden = !ctl.canAutoFinish;
  $('finishBtn').disabled = ctl.isAutoFinishing;
}

function renderBanner() {
  const box = $('banner'), entry = ctl.activeEntry;
  if (!entry || !settings.get('feedbackOn') || isWon(ctl.state) || ctl.isDealing) { box.hidden = true; box.replaceChildren(); return; }
  const tone = settings.get('feedbackTone');
  if (box.dataset.entry === String(entry.id) && box.dataset.revealed === String(ctl.revealedEntryId === entry.id) && !box.hidden && box.dataset.undo === String(ctl.canUndo()) && box.dataset.tone === tone) return;
  box.dataset.entry = entry.id; box.dataset.revealed = String(ctl.revealedEntryId === entry.id); box.dataset.undo = String(ctl.canUndo()); box.dataset.tone = tone;
  const inner = mk('div', 'box'); inner.setAttribute('role', 'status');
  inner.append(mk('p', '', message(entry, settings.get('feedbackTone'))));
  if (ctl.revealedEntryId === entry.id && entry.betterText) inner.append(mk('p', 'better', `Better: ${entry.betterText}.`));
  const row = mk('div', 'row');
  if (entry.betterMove) { const b = mk('button', 'btn', 'Show me'); b.onclick = () => ctl.showBetterMove(entry); row.append(b); }
  if (ctl.canUndo()) { const b = mk('button', 'btn', 'Undo'); b.onclick = () => ctl.undo(); row.append(b); }
  row.append(mk('span', 'spacer'));
  const x = mk('button', 'btn'); x.innerHTML = icon('close', 18); x.setAttribute('aria-label', 'Dismiss'); x.onclick = () => ctl.dismissNote(); row.append(x);
  inner.append(row);
  box.replaceChildren(inner); box.hidden = false;
}

// ---------- the cat ----------

let dragging = false, lastEntryId = null;
const heroCat = () => {
  const mode = settings.get('catMode');
  return mode === 'companion' || mode === 'endScreens' || (mode === 'themeOnly' && settings.get('tableStyle') === 'paws');
};
function updateCat() {
  const entry = ctl.activeEntry;
  const flick = !!entry && entry.id !== lastEntryId;
  lastEntryId = entry ? entry.id : lastEntryId;
  const state = isWon(ctl.state) ? 'cheer' : (ctl.deadEnd || ctl.isStuck) ? 'sleep' : dragging ? 'perk' : 'idle';
  setCatState(state, flick);
}
document.addEventListener('kc:drag', (e) => { dragging = !!e.detail; updateCat(); });
document.addEventListener('kc:cat', updateCat);

let victory = 'idle';       // idle -> playing -> done, once per win

function catHero() {
  if (!heroCat()) return null;
  const h = mk('div', 'cat-hero'); h.innerHTML = catHTML(); return h;
}

function ring(home) {
  const r = 46, c = 2 * Math.PI * r;
  const w = mk('div', 'ring');
  w.innerHTML = `<svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--line)" stroke-width="9"/>` +
    `<circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--lamp)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(c * home / 52).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/></svg>` +
    `<div class="ring-n"><strong>${home}</strong><span>of 52 home</span></div>`;
  return w;
}

function winCard(box) {
  const n = ctl.lazyCount, tips = ctl.tipCount, avg = stats.recentLazyAverage;
  box.append(mk('h2', '', 'Well played.'), mk('div', 'big', statusText()));
  if (settings.get('feedbackOn')) {
    const line = (n === 0 ? 'No lazy moves' : n === 1 ? '1 lazy move' : `${n} lazy moves`) + (tips ? ` · ${tips} tip${tips === 1 ? '' : 's'}` : '') + (avg != null ? ` · recent average ${avg.toFixed(1)}` : '');
    box.append(mk('div', 'muted', line));
  }
  const days = Math.max(stats.currentDayStreak, 1), trail = mk('div', 'trail');
  for (let i = 0; i < Math.min(days, 7); i++) { const p = mk('span'); p.innerHTML = icon('paw', 16); trail.append(p); }
  trail.append(mk('small', '', `${days} day${days === 1 ? '' : 's'} in a row`));
  box.append(trail);
  const row = mk('div', 'row');
  const d = mk('button', 'btn', 'See the game'); d.onclick = () => openSummary(ctx);
  const g = mk('button', 'btn primary', 'Play again'); g.onclick = () => ctl.newGame();
  row.append(d, g); box.append(row);
}

function defeatCard(box, dead) {
  box.append(mk('h2', '', dead ? 'No win from here.' : 'No more moves.'), ring(ctl.cardsHome));
  const turn = ctl.feedbackLog.find((e) => e.costGame && !e.undone && ctl.serials.includes(e.serial));
  if (turn) {
    const t = mk('div', 'turn', `The deal turned at move ${turn.moveNumber}. `);
    const back = mk('button', 'linkbtn', 'Go back to it'); back.onclick = () => ctl.goBackTo(turn.serial);
    t.append(back); box.append(t);
  }
  if (dead) box.append(mk('div', 'muted', 'A check of every remaining move found no way to win.'));
  else if (ctl.outOfMoves) box.append(mk('div', 'muted', 'A check of every possible move found nothing left to play.'));
  const row = mk('div', 'row');
  if (dead) { const keep = mk('button', 'btn', 'Keep playing'); keep.onclick = () => ctl.dismissDeadEnd(); row.append(keep); }
  else if (ctl.outOfMoves) { const keep = mk('button', 'btn', 'Keep playing'); keep.onclick = () => ctl.dismissOutOfMoves(); row.append(keep); }
  else { const d = mk('button', 'btn', 'See the game'); d.onclick = () => openSummary(ctx); row.append(d); }
  const again = mk('button', 'btn', 'Try this deal again'); again.onclick = () => ctl.replayDeal();
  const g = mk('button', 'btn primary', 'New game'); g.onclick = () => ctl.newGame();
  row.append(again, g); box.append(row);
}

function renderOverlay() {
  const o = $('overlay');
  const won = isWon(ctl.state), stuck = ctl.isStuck || ctl.outOfMoves, dead = !!ctl.deadEnd;
  if (!won) victory = 'idle';
  if (won && victory === 'idle') {
    victory = 'playing';
    playVictory(board).then(() => { victory = 'done'; renderOverlay(); });
  }
  const show = ctl.isDealing || stuck || dead || (won && victory === 'done');
  if (!show) { o.hidden = true; o.replaceChildren(); o.dataset.sig = ''; document.body.classList.remove('overlay-open'); return; }
  const kind = ctl.isDealing ? 'dealing' : won ? 'won' : stuck ? 'stuck' : 'dead';
  const sig = kind + ctl.state.moves + ctl.feedbackLog.length + String(ctl.canUndo()) + settings.get('catMode') + settings.get('tableStyle') + stats.recentLazyAverage;
  if (o.dataset.sig === sig && !o.hidden) return;
  o.dataset.sig = sig;
  const box = mk('div', 'box');
  if (kind === 'dealing') {
    box.append(mk('div', 'spinner'), mk('strong', '', settings.get('winnableDeals') ? 'Finding a winnable deal…' : 'Dealing…'));
    box.setAttribute('role', 'status');
  } else {
    const hero = catHero(); if (hero) box.append(hero);
    box.setAttribute('role', kind === 'won' ? 'status' : 'alertdialog');
    if (kind === 'won') winCard(box); else defeatCard(box, kind === 'dead');
  }
  o.replaceChildren(box); o.hidden = false;
  document.body.classList.add('overlay-open');
  updateCat();
}

ctl.subscribe(() => { renderBar(); renderBanner(); renderOverlay(); updateCat(); });
stats.onChange(renderBar);
settings.onChange(() => { renderBar(); renderBanner(); });
renderBar();

$('menuBtn').innerHTML = icon('menu', 24);
$('undoBtn').innerHTML = icon('undo', 24);
$('undoBtn').onclick = () => ctl.undo();
$('finishBtn').onclick = () => ctl.autoFinish();

// ---------- menu ----------

function requestNew() {
  if (ctl.state.moves > 0 && !isWon(ctl.state) && !ctl.isStuck) {
    if (!confirm('Start a new game? Your current game will be lost.')) return;
  }
  ctl.newGame();
}

function toggleMenu() {
  const m = $('menu');
  if (!m.hidden) { m.hidden = true; return; }
  m.replaceChildren();
  const items = [['plus', 'New game', requestNew], ['moves', 'Any moves left?', () => openMovesCheck(ctx)], ['list', 'Game summary', () => openSummary(ctx)], ['bars', 'Stats and history', () => openStats(ctx)], ['sliders', 'Settings', () => openSettings(ctx)]];
  for (const [ic, label, fn] of items) {
    const b = mk('button', ''); b.innerHTML = icon(ic, 20) + '<span>' + label + '</span>'; b.setAttribute('role', 'menuitem');
    b.onclick = () => { m.hidden = true; fn(); };
    m.append(b);
  }
  const r = $('menuBtn').getBoundingClientRect();
  m.style.left = Math.max(8, r.left) + 'px'; m.style.top = r.bottom + 4 + 'px';
  m.hidden = false;
  m.querySelector('button').focus();
}
$('menuBtn').onclick = (e) => { e.stopPropagation(); toggleMenu(); };
document.addEventListener('click', (e) => { if (!$('menu').hidden && !$('menu').contains(e.target)) $('menu').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('menu').hidden = true; });

// ---------- toast ----------

export function toast(text, actionLabel, action) {
  const t = $('toast'); t.replaceChildren(mk('span', '', text));
  if (actionLabel) { const b = mk('button', 'btn', actionLabel); b.onclick = () => { t.hidden = true; action(); }; t.append(b); }
  const x = mk('button', 'icon-btn'); x.innerHTML = icon('close', 18); x.setAttribute('aria-label', 'Dismiss'); x.style.minWidth = '36px'; x.style.minHeight = '36px'; x.onclick = () => { t.hidden = true; };
  t.append(x); t.hidden = false;
}

// ---------- start ----------

document.addEventListener('pointerdown', () => fx.unlock(), { once: false, passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) ctl.save(); });
window.addEventListener('pagehide', () => ctl.save());

(async () => {
  await stats.load();
  requestPersistence();
  if (!(await ctl.restore())) await ctl.newGame();
  document.documentElement.dataset.ready = 'true';
  installHint();
})();

function installHint() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (standalone || !ios || localStorage.getItem('kittycat.installHint')) return;
  localStorage.setItem('kittycat.installHint', '1');
  toast('Tip: tap Share, then Add to Home Screen. The installed app keeps your games longer.');
}

// ---------- service worker (offline) ----------

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const ready = (worker) => toast('A new version is ready.', 'Reload', () => { worker.postMessage('skipWaiting'); });
      if (reg.waiting && navigator.serviceWorker.controller) ready(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ready(w); });
      });
      // An iPhone keeps a home-screen app frozen and resumes it, so the browser may not look for a new version by itself.
      // Ask on every return to the app, when the connection comes back, and every hour while it is open.
      const check = () => { reg.update().catch(() => {}); };
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
      window.addEventListener('online', check);
      setInterval(check, 60 * 60 * 1000);
      // Reload after an update, but not on the very first visit (when the worker first takes control).
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !reloaded) { reloaded = true; location.reload(); }
      });
    } catch { /* offline support is optional */ }
  });
}
