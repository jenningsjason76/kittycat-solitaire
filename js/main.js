// Starts the app: wires the top bar, banner, overlays and the service worker.
import { settings } from './settings.js';
import { Stats } from './stats.js';
import { SolverClient } from './solver-client.js';
import { GameAudio } from './audio.js';
import { GameController } from './store.js';
import { Board } from './board.js';
import { message } from './text.js';
import { openSettings, openStats, openSummary, closeDialog } from './dialogs.js';
import { requestPersistence } from './storage.js';
import { isWon } from './engine.js';

const $ = (id) => document.getElementById(id);
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

const stats = new Stats();
const fx = new GameAudio();
const solver = new SolverClient();
const ctl = new GameController({ stats, solver, fx });
const ctx = { stats, ctl };
window.kittycat = { ctl, stats, settings, fx };         // handy for debugging and tests

new Board($('board'), ctl);

// ---------- top bar ----------

function statusText() {
  const s = ctl.state;
  if (s.scoring === 'none') return `${s.moves} moves`;
  if (s.scoring === 'vegas') return `${s.score < 0 ? '-$' + Math.abs(s.score) : '$' + s.score} · ${s.moves} moves`;
  return `Score ${s.score} · ${s.moves} moves`;
}

function renderBar() {
  const status = $('status'); status.replaceChildren();
  const line = mk('div'); line.append(mk('span', 'paw', '🐾'), document.createTextNode(statusText())); status.append(line);
  if (ctl.dealNote) status.append(mk('small', '', ctl.dealNote));
  $('undoBtn').disabled = !ctl.canUndo();
  $('finishBtn').hidden = !ctl.canAutoFinish;
  $('finishBtn').disabled = ctl.isAutoFinishing;
}

function renderBanner() {
  const box = $('banner'), entry = ctl.activeEntry;
  if (!entry || !settings.get('feedbackOn') || isWon(ctl.state) || ctl.isDealing) { box.hidden = true; box.replaceChildren(); return; }
  if (box.dataset.entry === String(entry.id) && box.dataset.revealed === String(ctl.revealedEntryId === entry.id) && !box.hidden && box.dataset.undo === String(ctl.canUndo())) return;
  box.dataset.entry = entry.id; box.dataset.revealed = String(ctl.revealedEntryId === entry.id); box.dataset.undo = String(ctl.canUndo());
  const inner = mk('div', 'box'); inner.setAttribute('role', 'status');
  inner.append(mk('p', '', message(entry, settings.get('feedbackTone'))));
  if (ctl.revealedEntryId === entry.id && entry.betterText) inner.append(mk('p', 'better', `Better: ${entry.betterText}.`));
  const row = mk('div', 'row');
  if (entry.betterMove) { const b = mk('button', 'btn', 'Show me'); b.onclick = () => ctl.showBetterMove(entry); row.append(b); }
  if (ctl.canUndo()) { const b = mk('button', 'btn', 'Undo'); b.onclick = () => ctl.undo(); row.append(b); }
  row.append(mk('span', 'spacer'));
  const x = mk('button', 'btn', '✕'); x.setAttribute('aria-label', 'Dismiss'); x.onclick = () => ctl.dismissNote(); row.append(x);
  inner.append(row);
  box.replaceChildren(inner); box.hidden = false;
}

function renderOverlay() {
  const o = $('overlay');
  const won = isWon(ctl.state), stuck = ctl.isStuck;
  if (!ctl.isDealing && !won && !stuck) { o.hidden = true; o.replaceChildren(); o.dataset.kind = ''; return; }
  const kind = ctl.isDealing ? 'dealing' : won ? 'won' : 'stuck';
  const sig = kind + ctl.state.moves + ctl.feedbackLog.length;
  if (o.dataset.sig === sig && !o.hidden) return;
  o.dataset.sig = sig;
  const box = mk('div', 'box');
  if (kind === 'dealing') {
    box.append(mk('div', 'spinner'), mk('strong', '', settings.get('winnableDeals') ? 'Finding a winnable deal…' : 'Dealing…'));
    box.setAttribute('role', 'status');
  } else {
    const n = ctl.feedbackLog.length;
    box.append(mk('h2', '', won ? 'You won!' : 'No more moves'), mk('div', '', statusText()),
      mk('div', 'muted', n === 0 ? 'No lazy moves. Nicely played.' : n === 1 ? '1 lazy move flagged.' : `${n} lazy moves flagged.`));
    const row = mk('div', 'row');
    const d = mk('button', 'btn', 'See details'); d.onclick = () => openSummary(ctx);
    const g = mk('button', 'btn primary', 'New Game'); g.onclick = () => ctl.newGame();
    row.append(d, g); box.append(row);
  }
  o.replaceChildren(box); o.hidden = false;
}

ctl.subscribe(() => { renderBar(); renderBanner(); renderOverlay(); });
stats.onChange(renderBar);
settings.onChange(() => { renderBar(); renderBanner(); });
renderBar();

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
  const items = [['New Game', requestNew], ['Game summary', () => openSummary(ctx)], ['Stats and history', () => openStats(ctx)], ['Settings', () => openSettings(ctx)]];
  for (const [label, fn] of items) {
    const b = mk('button', '', label); b.setAttribute('role', 'menuitem');
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
  const x = mk('button', 'icon-btn', '✕'); x.setAttribute('aria-label', 'Dismiss'); x.style.minWidth = '36px'; x.style.minHeight = '36px'; x.onclick = () => { t.hidden = true; };
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
      // Reload after an update, but not on the very first visit (when the worker first takes control).
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !reloaded) { reloaded = true; location.reload(); }
      });
    } catch { /* offline support is optional */ }
  });
}
