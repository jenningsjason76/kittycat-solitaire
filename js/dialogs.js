// Settings, stats, summary and credits dialogs.
import { settings, DEFAULTS } from './settings.js';
import { TITLES } from './text.js';
import { kvGet, kvSet, deviceId } from './storage.js';
import { asset } from './assets.js';

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function open(title, build) {
  const d = document.getElementById('dlg');
  const prev = d.querySelector('.body');
  const scroll = prev ? prev.scrollTop : 0;
  d.replaceChildren();
  const head = h('div', 'head');
  const t = h('h2', '', title); t.id = 'dlgTitle';
  const close = h('button', 'icon-btn', '✕'); close.setAttribute('aria-label', 'Close'); close.onclick = () => d.close();
  head.append(t, close);
  const body = h('div', 'body');
  build(body);
  d.append(head, body);
  if (!d.open) d.showModal();
  body.scrollTop = scroll;
}

export function closeDialog() { const d = document.getElementById('dlg'); if (d.open) d.close(); }

// ---------- settings ----------

function section(body, title) { const s = h('section'); s.append(h('h3', '', title)); body.append(s); return s; }

function selectRow(sec, label, key, options, rebuild) {
  const row = h('label', 'row-item'); row.append(h('span', '', label));
  const sel = h('select');
  for (const [value, text] of options) {
    const o = h('option', '', text); o.value = String(value); sel.append(o);
  }
  sel.value = String(settings.get(key));
  sel.onchange = () => {
    settings.set(key, typeof DEFAULTS[key] === 'number' ? Number(sel.value) : sel.value);
    if (rebuild) rebuild();
  };
  row.append(sel); sec.append(row);
}

function toggleRow(sec, label, key, rebuild, disabled = false) {
  const row = h('label', 'row-item'); row.append(h('span', '', label));
  const box = h('input'); box.type = 'checkbox'; box.checked = !!settings.get(key); box.disabled = disabled;
  box.onchange = () => { settings.set(key, box.checked); if (rebuild) rebuild(); };
  row.append(box); sec.append(row);
}

export function openSettings(ctx) {
  const rebuild = () => openSettings(ctx);
  open('Settings', (body) => {
    let s = section(body, 'Game');
    selectRow(s, 'Draw', 'drawMode', [[1, 'Draw 1'], [3, 'Draw 3']]);
    selectRow(s, 'Scoring', 'scoringMode', [['standard', 'Standard'], ['vegas', 'Vegas'], ['none', 'No scoring']]);
    toggleRow(s, 'Winnable deals', 'winnableDeals');
    s.append(h('p', 'note', 'Changes apply to your next game. A winnable deal has a winning line when every card is visible to the solver.'));

    s = section(body, 'Controls');
    toggleRow(s, 'Tap a card to move it', 'tapToMove');
    s.append(h('p', 'note', 'Cards can always be dragged. Tapping the stock always draws a card. Turn this on to also send a tapped card to its best spot.'));

    s = section(body, 'Feedback');
    toggleRow(s, 'Feedback on', 'feedbackOn');
    selectRow(s, 'Tone', 'feedbackTone', [['direct', 'Direct'], ['gentle', 'Gentle']]);
    selectRow(s, 'Undo', 'undoPolicy', [['flaggedOnly', 'Flagged moves only'], ['unlimited', 'Unlimited']]);

    s = section(body, 'Appearance');
    selectRow(s, 'Mode', 'appearance', [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']]);
    selectRow(s, 'Card size', 'cardSize', [['large', 'Large'], ['medium', 'Medium'], ['small', 'Small']]);
    selectRow(s, 'Table', 'tableStyle', [['calm', 'Calm'], ['paws', 'Cat paws']]);
    selectRow(s, 'Card back', 'cardBack', [['blue', 'Blue'], ['red', 'Red'], ['purple', 'Purple'], ['yellow', 'Gold'], ['paws', 'Cat paws']]);
    toggleRow(s, 'Zoom effect', 'zoomEffect');
    s.append(h('p', 'note', 'The zoom effect is turned off automatically when Reduce Motion is on.'));

    s = section(body, 'Sound and haptics');
    const on = settings.get('soundsOn');
    toggleRow(s, 'All sounds', 'soundsOn', rebuild);
    toggleRow(s, 'Sound effects', 'effectsOn', rebuild, !on);
    if (on && settings.get('effectsOn')) selectRow(s, 'Effects volume', 'effectsLevel', [['subtle', 'Subtle'], ['full', 'Full']]);
    toggleRow(s, 'Music', 'musicOn', rebuild, !on);
    if (on && settings.get('musicOn')) selectRow(s, 'Music volume', 'musicLevel', [['subtle', 'Subtle'], ['full', 'Full']]);
    selectRow(s, 'Haptics', 'hapticLevel', [['off', 'Off'], ['subtle', 'Subtle'], ['full', 'Full']]);
    s.append(h('p', 'note', 'Music is off until you turn it on. On the web, the app cannot tell when you are playing your own music, so turn music off if you are. Haptics only work on devices that support vibration, and many iPhones do not.'));
    const credits = h('button', 'btn', 'Sound credits'); credits.onclick = () => openCredits();
    const row = h('div', 'actions'); row.append(credits); s.append(row);

    s = section(body, 'Your data');
    const status = h('p', 'note', 'Everything stays on this device. Checking storage…');
    s.append(status);
    (async () => {
      const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
      status.textContent = persisted
        ? 'Everything stays on this device, and the browser has agreed not to clear it.'
        : 'Everything stays on this device. Your browser may clear it if the app is not used for a while, so install the app to your Home Screen and keep a backup.';
    })();
    const exp = h('button', 'btn', 'Export backup'); exp.onclick = () => exportBackup(ctx);
    const imp = h('button', 'btn', 'Import backup'); imp.onclick = () => importBackup(ctx);
    const acts = h('div', 'actions'); acts.append(exp, imp); s.append(acts);

    s = section(body, 'About');
    s.append(h('p', 'note', 'Card artwork: English pattern playing cards deck (Wikimedia Commons), public domain (CC0).'));
  });
}

async function exportBackup(ctx) {
  const data = {
    app: 'kittycat-solitaire', version: 1, exportedAt: Date.now(), deviceId: await deviceId(),
    settings: settings.all(), stats: ctx.stats.records, currentGame: (await kvGet('currentGame')) || null,
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kittycat-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function importBackup(ctx) {
  const input = h('input'); input.type = 'file'; input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'kittycat-solitaire') throw new Error('not a KittyCat backup');
      if (!confirm('Replace the settings, stats and saved game on this device with the backup?')) return;
      settings.replaceAll(data.settings || {});
      await ctx.stats.replaceAll(data.stats || []);
      if (data.currentGame) await kvSet('currentGame', data.currentGame);
      location.reload();
    } catch (err) {
      alert('That file could not be imported: ' + err.message);
    }
  };
  input.click();
}

export async function openCredits() {
  let text = 'No third-party sounds are installed.';
  try {
    const res = await fetch(asset('sounds/SoundCredits.txt'));
    if (res.ok) text = await res.text();
  } catch { /* offline or missing */ }
  open('Sound credits', (body) => { const pre = h('pre', 'credits'); pre.textContent = text; body.append(pre); });
}

// ---------- stats ----------

const pct = (v) => (v === null ? '-' : Math.round(v * 100) + '%');
const dec = (v) => (v === null ? '-' : v.toFixed(1));

function kv(sec, label, value) { const r = h('div', 'kv'); r.append(h('span', '', label), h('strong', '', String(value))); sec.append(r); }

function chart(records) {
  const W = 300, H = 140, n = records.length, max = Math.max(1, ...records.map((r) => r.lazyMoves));
  const bw = W / n;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Lazy moves in your last games');
  records.forEach((r, i) => {
    const bh = (r.lazyMoves / max) * (H - 8);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(i * bw + 2)); rect.setAttribute('y', String(H - bh));
    rect.setAttribute('width', String(Math.max(bw - 4, 1))); rect.setAttribute('height', String(Math.max(bh, 1)));
    rect.setAttribute('rx', '2');
    svg.append(rect);
  });
  return svg;
}

export function openStats(ctx) {
  const st = ctx.stats;
  open('Stats', (body) => {
    if (!st.records.length) { body.append(h('p', '', 'Play a game to see your stats.')); return; }
    let s = section(body, 'Overview');
    kv(s, 'Games played', st.gamesPlayed); kv(s, 'Games won', st.wins); kv(s, 'Win rate', pct(st.winRate));
    if (st.bestStandardScore !== null) kv(s, 'Best standard score', st.bestStandardScore);

    s = section(body, 'Streaks');
    kv(s, 'Days in a row', st.currentDayStreak); kv(s, 'Best days in a row', st.bestDayStreak);
    kv(s, 'Wins in a row', st.currentWinStreak); kv(s, 'Best wins in a row', st.bestWinStreak);

    s = section(body, 'Lazy moves per game');
    if (!st.lazyChartRecords.length) s.append(h('p', 'note', 'Play with feedback on to track lazy moves.'));
    else {
      kv(s, 'Last 10 games (average)', dec(st.recentLazyAverage));
      if (st.earlierLazyAverage !== null) kv(s, '10 games before that', dec(st.earlierLazyAverage));
      s.append(chart(st.lazyChartRecords));
      s.append(h('p', 'note', 'Fewer is better. Only games played with feedback on are counted.'));
    }

    s = section(body, 'Recent games');
    for (const r of st.records.slice(-100).reverse()) {
      const row = h('div', 'hist'), top = h('div', 't');
      top.append(h('span', '', r.won ? 'Won' : 'Not finished'), h('span', 'd', new Date(r.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })));
      const parts = [`Draw ${r.drawMode}`, r.scoring === 'none' ? 'No scoring' : r.scoring[0].toUpperCase() + r.scoring.slice(1), `${r.moves} moves`];
      if (r.feedbackWasOn) parts.push(`${r.lazyMoves} lazy`);
      row.append(top, h('div', 'd', parts.join(' · ')));
      s.append(row);
    }
    const reset = h('button', 'btn danger', 'Reset all stats');
    reset.onclick = async () => { if (confirm('Reset all stats and history?')) { await st.reset(); openStats(ctx); } };
    const acts = h('div', 'actions'); acts.append(reset); body.append(acts);
  });
}

// ---------- summary ----------

export function openSummary(ctx) {
  const ctl = ctx.ctl;
  open(ctl.state.found.every((f) => f === 13) ? 'You won' : 'Game summary', (body) => {
    const log = ctl.feedbackLog;
    let s = section(body, 'This game');
    kv(s, 'Moves', ctl.state.moves); kv(s, 'Lazy moves flagged', log.length);
    kv(s, 'Flagged moves you undid', log.filter((e) => e.undone).length);
    kv(s, 'Moves that cost the game', log.filter((e) => e.costGame).length);
    if (!log.length) { body.append(h('p', '', 'No lazy moves. Nicely played.')); return; }
    const toggle = h('button', 'btn', 'See details');
    const list = h('div'); list.hidden = true;
    toggle.onclick = () => { list.hidden = !list.hidden; toggle.textContent = list.hidden ? 'See details' : 'Hide details'; };
    for (const e of log) {
      const row = h('div', 'hist'), t = h('div', 't'); t.append(h('span', '', `Move ${e.moveNumber}: ${TITLES[e.kind]}`));
      row.append(t);
      if (e.betterText) row.append(h('div', 'd', `Better: ${e.betterText}.`));
      if (e.costGame && e.kind !== 'costGame') row.append(h('div', 'd', 'It also made the deal unwinnable.'));
      if (e.undone) row.append(h('div', 'd', 'You undid this move.'));
      list.append(row);
    }
    const acts = h('div', 'actions'); acts.append(toggle); body.append(acts, list);
  });
}
