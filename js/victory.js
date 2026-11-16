// Four short victory sequences, picked at random (never the same twice in a row).
// Each runs 4.5 seconds at most, a tap skips it, and it does nothing when Motion is Off or Reduce Motion is on.
import { settings, motionScale } from './settings.js';
import { faceURL } from './decks.js';
import { catHTML } from './cat.js';

export const STYLES = ['fan', 'cascade', 'cat', 'riffle'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function pickStyle(rand = Math.random) {
  const want = settings.get('victory');
  if (STYLES.includes(want)) return want;
  let last = null;
  try { last = localStorage.getItem('kittycat.lastVictory'); } catch { /* ignore */ }
  const pool = STYLES.filter((s) => s !== last);
  const style = pool[Math.floor(rand() * pool.length)];
  try { localStorage.setItem('kittycat.lastVictory', style); } catch { /* ignore */ }
  return style;
}

function makeCards(board, layer) {
  const { cw, ch } = board.L, cards = [];
  for (let s = 0; s < 4; s++) {
    const r = board.piles['f' + s].getBoundingClientRect();
    for (let rank = 1; rank <= 13; rank++) {
      const c = document.createElement('div');
      c.className = 'card up vcard';
      c.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${cw}px;height:${ch}px;z-index:${rank};`;
      c.style.backgroundImage = `url("${faceURL(s * 13 + rank - 1, settings.get('deck'))}")`;
      layer.appendChild(c);
      cards.push({ el: c, s, rank, x0: r.left, y0: r.top });
    }
  }
  return cards;
}

const go = (el, frames, opts) => el.animate(frames, { fill: 'forwards', ...opts });
const pose = (dx, dy, rot = 0, sc = 1) => ({ transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${sc})` });

// 1. Fan and bow: the four suits fan into hands, hold, then gather into one glowing deck.
function fan(board, layer, k) {
  const W = innerWidth, H = innerHeight, { cw, ch } = board.L;
  const cards = makeCards(board, layer);
  const R = Math.min(W * 0.2, H * 0.17);                // small enough that the outer fans stay on screen
  const centers = [[W * 0.27, H * 0.30], [W * 0.73, H * 0.30], [W * 0.27, H * 0.62], [W * 0.73, H * 0.62]];
  cards.forEach((c, i) => {
    const [cx, cy] = centers[c.s], a = (-52 + 104 * (c.rank - 1) / 12) * Math.PI / 180;
    const tx = cx + R * Math.sin(a) - cw / 2, ty = cy + R - R * Math.cos(a) - ch / 2;
    go(c.el, [pose(0, 0), pose(tx - c.x0, ty - c.y0, a * 180 / Math.PI)], { duration: 520 * k, delay: i * 18 * k, easing: 'cubic-bezier(.2,.8,.25,1)' });
    const mx = W / 2 - cw / 2 + (c.s - 1.5) * 1.2, my = H * 0.46 - ch / 2 - c.rank * 0.5;
    go(c.el, [pose(tx - c.x0, ty - c.y0, a * 180 / Math.PI), pose(mx - c.x0, my - c.y0, 0)], { duration: 600 * k, delay: (1500 + c.s * 60 + c.rank * 8) * k, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
  });
  const top = cards[cards.length - 1].el;
  go(top, [{ boxShadow: '0 0 0 0 color-mix(in srgb, var(--hl) 0%, transparent)' }, { boxShadow: '0 0 0 18px color-mix(in srgb, var(--hl) 55%, transparent)' }, { boxShadow: '0 0 28px 6px color-mix(in srgb, var(--hl) 0%, transparent)' }], { duration: 800 * k, delay: 2650 * k, easing: 'ease-out' });
  return 3500 * k;
}

// 2. Soft cascade: the cards leave the foundations one by one, floating down in slow arcs.
function cascade(board, layer, k) {
  const W = innerWidth, H = innerHeight, { ch } = board.L;
  const cards = makeCards(board, layer);
  const order = [...cards].sort((a, b) => b.rank - a.rank || a.s - b.s);
  order.forEach((c, i) => {
    const vx = ((i * 37) % 11 - 5) / 5 * W * 0.55, up = H * (0.10 + ((i * 17) % 7) / 7 * 0.16), end = H - c.y0 + ch, spin = (((i * 53) % 9) - 4) * 55;
    const frames = [];
    for (let t = 0; t <= 1.0001; t += 0.1) frames.push({ transform: `translate(${vx * t}px, ${-4 * up * t * (1 - t) + end * t * t}px) rotate(${spin * t}deg)`, opacity: t > 0.75 ? 1 - (t - 0.75) * 3.4 : 1, offset: Math.min(t, 1) });
    go(c.el, frames, { duration: 1700 * k, delay: i * 50 * k, easing: 'linear' });
  });
  return (51 * 50 + 1700) * k;
}

// 3. The cat swats the kings off the table.
function cat(board, layer, k) {
  const W = innerWidth, H = innerHeight;
  const cards = makeCards(board, layer);                  // the foundations stay as they were; only the kings leave
  const kings = [0, 1, 2, 3].map((s) => cards.find((c) => c.s === s && c.rank === 13).el);
  const row = board.piles.f0.getBoundingClientRect();
  const holder = document.createElement('div');
  const size = Math.min(W * 0.34, 170);
  holder.style.cssText = `position:fixed;width:${size}px;height:${size * 1.5}px;left:${W * 0.60}px;top:${row.bottom + 14}px;`;
  holder.innerHTML = catHTML('vcat');
  layer.appendChild(holder);
  const c = holder.querySelector('.cat');
  go(holder, [{ opacity: 0, transform: 'translateX(60px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 380 * k, easing: 'ease-out' });
  kings.forEach((el, i) => {
    const t = (500 + i * 700) * k;
    setTimeout(() => { c.dataset.state = 'swat'; setTimeout(() => { c.dataset.state = 'idle'; }, 360 * k); }, t);
    const dir = i % 2 ? 1 : -1, r = el.getBoundingClientRect();
    go(el, [pose(0, 0), pose(dir * W * 0.5 - (r.left - W / 2) * 0.2, H - r.top + 120, dir * 320)], { duration: 900 * k, delay: t + 160 * k, easing: 'cubic-bezier(.4,0,.9,.6)' });
  });
  setTimeout(() => { c.dataset.state = 'cheer'; }, 3500 * k);
  return 4300 * k;
}

// 4. Riffle: all 52 cards ripple out in a ring, then gather into one deck.
function riffle(board, layer, k) {
  const W = innerWidth, H = innerHeight, { cw, ch } = board.L;
  const cards = makeCards(board, layer), n = cards.length;
  const order = [...cards].sort((a, b) => a.s - b.s || a.rank - b.rank);
  order.forEach((c, i) => {
    const th = i / n * Math.PI * 2 - Math.PI / 2, rx = W * 0.34, ry = H * 0.2;
    const tx = W / 2 + rx * Math.cos(th) - cw / 2, ty = H * 0.46 + ry * Math.sin(th) - ch / 2;
    go(c.el, [pose(0, 0), pose(tx - c.x0, ty - c.y0, th * 180 / Math.PI + 90)], { duration: 650 * k, delay: i * 16 * k, easing: 'cubic-bezier(.2,.8,.25,1)' });
    const mx = W / 2 - cw / 2, my = H * 0.46 - ch / 2 - i * 0.4;
    go(c.el, [pose(tx - c.x0, ty - c.y0, th * 180 / Math.PI + 90), pose(mx - c.x0, my - c.y0, 0)], { duration: 560 * k, delay: (1500 + (n - i) * 9) * k, easing: 'cubic-bezier(.5,0,.2,1)' });
  });
  go(order[n - 1].el, [{ boxShadow: '0 0 0 0 color-mix(in srgb, var(--hl) 0%, transparent)' }, { boxShadow: '0 0 0 20px color-mix(in srgb, var(--hl) 50%, transparent)' }, { boxShadow: '0 0 30px 8px color-mix(in srgb, var(--hl) 0%, transparent)' }], { duration: 800 * k, delay: 2500 * k, easing: 'ease-out' });
  return 3400 * k;
}

const RUN = { fan, cascade, cat, riffle };

// The deck's world behind the cards: a moon over the night court, arena lights and the goal light, the lamp and its dust.
// Drawn first so the cards fly over it; it fades in and out with the sequence. Classic keeps the plain felt.
function backdrop(layer, deck, k, ms) {
  if (deck === 'classic') return;
  const W = innerWidth, H = innerHeight, d = document.createElement('div');
  d.className = 'v-backdrop v-' + deck;
  layer.appendChild(d);
  go(d, [{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: ms, easing: 'ease-in-out' });
  const rnd = ((seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; })(11);
  if (deck === 'thorn') {
    const moon = document.createElement('div'); moon.className = 'v-moon'; d.appendChild(moon);
    go(moon, [{ transform: `translate(${W * 0.18}px, ${H * 0.55}px) scale(.8)` }, { transform: `translate(${W * 0.05}px, ${H * 0.04}px) scale(1)` }], { duration: ms * 0.9, easing: 'cubic-bezier(.2,.7,.3,1)' });
    for (let i = 0; i < 34; i++) {
      const st = document.createElement('i'); st.className = 'v-star';
      st.style.left = (rnd() * 100) + '%'; st.style.top = (rnd() * 70) + '%'; st.style.transform = `scale(${0.5 + rnd()})`;
      d.appendChild(st);
      go(st, [{ opacity: 0 }, { opacity: 0.9 }, { opacity: 0.25 }, { opacity: 0.9 }, { opacity: 0 }], { duration: 1600 * k, delay: rnd() * ms * 0.7, iterations: 2, easing: 'ease-in-out', fill: 'none' });
    }
  } else if (deck === 'ice') {
    for (const [x, dir] of [[0.15, 1], [0.85, -1]]) {
      const beam = document.createElement('div'); beam.className = 'v-beam'; beam.style.left = (x * 100) + '%'; d.appendChild(beam);
      go(beam, [{ transform: `rotate(${-24 * dir}deg)` }, { transform: `rotate(${24 * dir}deg)` }, { transform: `rotate(${-10 * dir}deg)` }], { duration: ms, easing: 'ease-in-out' });
    }
    const goal = document.createElement('div'); goal.className = 'v-goal'; d.appendChild(goal);
    go(goal, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }, { opacity: 0 }], { duration: Math.min(ms, 2600 * k), delay: 300 * k, easing: 'ease-in-out' });
  } else if (deck === 'room') {
    const lamp = document.createElement('div'); lamp.className = 'v-lamp'; d.appendChild(lamp);
    go(lamp, [{ opacity: 0.4, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1.05)' }, { opacity: 0.8, transform: 'scale(1)' }], { duration: ms, easing: 'ease-out' });
    for (let i = 0; i < 26; i++) {
      const m = document.createElement('i'); m.className = 'v-mote'; d.appendChild(m);
      const x = W * (0.1 + rnd() * 0.5), y = H * (0.3 + rnd() * 0.6);
      go(m, [{ transform: `translate(${x}px, ${y}px)`, opacity: 0 }, { opacity: 0.8, offset: 0.3 }, { transform: `translate(${x + (rnd() - 0.3) * 80}px, ${y - 60 - rnd() * 120}px)`, opacity: 0 }],
        { duration: ms * (0.6 + rnd() * 0.4), delay: rnd() * ms * 0.3, easing: 'ease-out' });
    }
  }
}

/** Plays one victory sequence. Resolves when it ends or is skipped. Use style to force one (tests). */
export async function playVictory(board, style) {
  const k = motionScale();
  if (!k || settings.get('victory') === 'off') return null;
  style = style || pickStyle();
  const layer = document.createElement('div');
  layer.id = 'victory';
  document.body.appendChild(layer);
  board.root.classList.add('victory');
  window.__victoryStyle = style;
  let finish;
  const done = new Promise((r) => { finish = r; });
  let ended = false;
  const end = () => {
    if (ended) return; ended = true;
    layer.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    document.getAnimations().forEach((a) => { const t = a.effect && a.effect.target; if (t && t.classList && t.classList.contains('card') && !layer.contains(t)) a.cancel(); });
    layer.remove();
    board.root.classList.remove('victory');
    board.render();                       // puts the real cards back
    finish();
  };
  layer.addEventListener('pointerdown', end);
  const deck = document.documentElement.dataset.deck || 'classic';
  const est = { fan: 3500, cascade: 4250, cat: 4300, riffle: 3400 }[style] * k;
  backdrop(layer, deck, k, Math.min(est, 4500 * k));
  const ms = Math.min(RUN[style](board, layer, k), 4500 * k);
  await Promise.race([sleep(ms + 250), done]);
  end();
  return style;
}
