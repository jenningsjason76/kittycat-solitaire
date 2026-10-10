// The board: draws piles, handles drag and tap, and the magnifying-glass zoom.
import {
  K, DRAW, isUp, assetName, cardName, legalMoves, bestMove, canDraw, SUIT_SYMBOL, moveEq,
} from './engine.js';
import { settings, CARD_SCALE, motionScale } from './settings.js';
import { asset } from './assets.js';
import { catHTML } from './cat.js';

const kindOf = (key) => (key === 's' ? K.STOCK : key === 'w' ? K.WASTE : key[0] === 'f' ? K.FOUND : K.TAB);
const indexOf = (key) => (key.length > 1 ? Number(key.slice(1)) : 0);
const keyOf = (kind, i) => (kind === K.STOCK ? 's' : kind === K.WASTE ? 'w' : (kind === K.FOUND ? 'f' : 't') + i);

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

export class Board {
  constructor(root, ctl) {
    this.root = root; this.ctl = ctl;
    this.piles = {};
    this.press = null;
    this.drag = null;
    this.L = null;
    this.noAnim = true;
    this.seenDeal = ctl.dealId;
    this.build();
    this.relayout();
    new ResizeObserver(() => this.relayout()).observe(root.parentElement);
    ctl.subscribe(() => this.render());
    root.addEventListener('pointerdown', (e) => { this.skipMotion(); this.onDown(e); }, true);
    root.addEventListener('pointermove', (e) => this.onMove(e));
    root.addEventListener('pointerup', (e) => this.onUp(e, false));
    root.addEventListener('pointercancel', (e) => this.onUp(e, true));   // interrupted drags snap back
    root.addEventListener('keydown', (e) => this.onKey(e));
    settings.onChange((k) => { if (k === 'cardSize' || k === '*') this.relayout(); if (k === 'catMode' || k === 'tableStyle' || k === '*') this.mountCat(); });
    this.mountCat();
  }

  build() {
    const top = el('div', 'toprow', this.root), tab = el('div', 'tabrow', this.root);
    const make = (key, cls, parent) => { const p = el('div', 'pile ' + cls, parent); p.dataset.pile = key; this.piles[key] = p; return p; };
    make('s', 'stock', top); make('w', 'waste', top);
    this.spacer = el('div', 'pile spacer', top);
    for (let i = 0; i < 4; i++) make('f' + i, 'found', top);
    for (let i = 0; i < 7; i++) make('t' + i, 'tab', tab);
  }

  /** The cat sits in the empty slot of the top row (companion mode, or the cat-paw table in "cat theme only"). */
  mountCat() {
    this.spacer.querySelectorAll('.cat-perch').forEach((n) => n.remove());
    const mode = settings.get('catMode'), paws = settings.get('tableStyle') === 'paws';
    if (mode === 'companion' || (mode === 'themeOnly' && paws)) {
      const perch = el('div', 'cat-perch', this.spacer);
      perch.innerHTML = catHTML();
      document.dispatchEvent(new CustomEvent('kc:cat'));
    }
  }

  // ---------- layout ----------

  relayout() {
    const wrap = this.root.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    const margin = 8, gap = 6, aspect = 1.5;
    let cw = (w - margin * 2 - gap * 6) / 7;
    let ch = cw * aspect;
    const maxH = h / 3.8;                       // keeps landscape phones usable
    if (ch > maxH) { ch = maxH; cw = ch / aspect; }
    cw = Math.min(cw, 140) * (CARD_SCALE[settings.get('cardSize')] || 1);
    ch = cw * aspect;
    const tabh = Math.max(h - margin * 2 - gap - ch, ch);
    this.L = { cw, ch, gap, margin, tabh };
    const s = this.root.style;
    s.setProperty('--cw', cw + 'px'); s.setProperty('--ch', ch + 'px');
    s.setProperty('--gap', gap + 'px'); s.setProperty('--margin', margin + 'px'); s.setProperty('--tabh', tabh + 'px');
    this.noAnim = true;                      // a resize is not a move
    this.render();
    this.noAnim = false;
  }

  offsets(cards) {
    const { ch, tabh } = this.L;
    if (cards.length < 2) return cards.map(() => 0);
    const gaps = cards.slice(0, -1).map((c) => (isUp(c) ? ch * 0.42 : ch * 0.12));
    const total = gaps.reduce((a, b) => a + b, 0);
    const room = tabh - ch;
    const shrink = total > room ? Math.max(room / total, 0.2) : 1;
    const ys = [0];
    for (const g of gaps) ys.push(ys[ys.length - 1] + g * shrink);
    return ys;
  }

  // ---------- drawing ----------

  makeCard(c, pileKey, count, y, interactive = true) {
    const e = el('div', 'card ' + (isUp(c) ? 'up' : 'down'));
    e.dataset.pile = pileKey; e.dataset.count = String(count); e.dataset.id = String(c & 63);
    e.style.transform = `translateY(${y}px)`;
    if (isUp(c)) {
      e.style.backgroundImage = `url("${asset(`cards/${assetName(c)}.webp`)}")`;
      e.setAttribute('aria-label', cardName(c));
      if (interactive) { e.setAttribute('role', 'button'); e.tabIndex = 0; } else e.classList.add('static');
    } else {
      e.setAttribute('aria-hidden', 'true');
      e.classList.add('static');
    }
    return e;
  }

  slot(parent, text, small) {
    const s = el('div', 'slot' + (small ? ' small' : ''), parent);
    if (text) s.textContent = text;
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  /** Where every card is right now (including cards being dragged), so moves can glide from there. */
  captureRects() {
    const cards = new Map();
    document.querySelectorAll('.card[data-id]').forEach((c) => {
      const r = c.getBoundingClientRect();
      cards.set(c.dataset.id, { x: r.left, y: r.top, up: c.classList.contains('up') });
    });
    return { cards, stock: this.piles.s.getBoundingClientRect(), waste: this.piles.w.getBoundingClientRect() };
  }

  render() {
    if (!this.L) return;
    const prev = this.captureRects();
    if (this.drag) this.endDragVisuals();
    const st = this.ctl.state;
    const { ch } = this.L;
    document.getElementById('dragLayer')?.remove();

    // stock
    const stock = this.piles.s; stock.replaceChildren();
    if (st.stock.length) {
      const b = this.makeCard(st.stock[st.stock.length - 1], 's', 1, 0);
      b.classList.remove('static'); b.classList.add('stock'); b.removeAttribute('aria-hidden');
      b.setAttribute('role', 'button'); b.tabIndex = 0; b.setAttribute('aria-label', 'Stock, activate to draw');
      stock.appendChild(b);
    } else {
      this.slot(stock, canDraw(st) ? '↻' : '', true);
      if (canDraw(st)) {
        const hit = el('div', 'card stock', stock);
        hit.dataset.pile = 's'; hit.dataset.count = '1'; hit.style.background = 'transparent'; hit.style.filter = 'none';
        hit.setAttribute('role', 'button'); hit.tabIndex = 0; hit.setAttribute('aria-label', 'Reset stock');
      }
    }

    // waste
    const waste = this.piles.w; waste.replaceChildren(); this.slot(waste);
    const shown = st.waste.slice(-(st.draw === 3 ? 3 : 1));
    shown.forEach((c, i) => {
      const top = i === shown.length - 1;
      const e = this.makeCard(c, 'w', 1, 0, top);
      e.style.transform = `translate(${i * this.L.cw * 0.28}px, 0)`;
      waste.appendChild(e);
    });

    // foundations
    for (let i = 0; i < 4; i++) {
      const p = this.piles['f' + i]; p.replaceChildren();
      this.slot(p, SUIT_SYMBOL[i]);
      if (st.found[i] > 0) p.appendChild(this.makeCard((i * 13 + st.found[i] - 1) | 64, 'f' + i, 1, 0));
    }

    // tableau
    const hl = this.ctl.highlight;
    for (let i = 0; i < 7; i++) {
      const p = this.piles['t' + i]; p.replaceChildren(); this.slot(p);
      const cards = st.tab[i], ys = this.offsets(cards);
      cards.forEach((c, k) => p.appendChild(this.makeCard(c, 't' + i, cards.length - k, ys[k])));
    }

    const perch = this.spacer.querySelector('.cat-perch');
    if (perch) perch.dataset.draw = String(st.draw);

    // "Show me" highlight
    if (hl) {
      const src = this.piles[keyOf(hl[0], hl[1])];
      if (src) src.querySelectorAll('.card').forEach((c) => { if (Number(c.dataset.count) <= hl[4] && !c.classList.contains('down')) c.classList.add('hl'); });
      const dst = this.piles[keyOf(hl[2], hl[3])];
      if (dst && hl[2] !== K.STOCK && hl[2] !== K.WASTE) {
        const marker = el('div', 'hl-dst', dst);
        if (hl[2] === K.TAB) { const ys = this.offsets(st.tab[hl[3]]); marker.style.top = (ys[ys.length - 1] || 0) + 'px'; }
      }
    }
    this.root.classList.add('no-trans');                       // measure without the zoom easing back
    this.root.classList.remove('dragging', 'from-top');
    this.root.querySelectorAll('.focus, .lens').forEach((p) => p.classList.remove('focus', 'lens'));
    this.afterRender(prev);
    requestAnimationFrame(() => this.root.classList.remove('no-trans'));
  }

  // ---------- motion ----------

  afterRender(prev) {
    const last = this.ctl.lastMove; this.ctl.lastMove = null;
    const scale = motionScale();
    if (this.ctl.dealId !== this.seenDeal) {
      this.seenDeal = this.ctl.dealId;
      if (!this.noAnim && scale) this.dealAnimation(scale);
      return;
    }
    if (last && last[2] === K.FOUND) this.pulse('f' + last[3]);
    if (!this.noAnim && scale) this.flight(prev, last, scale);
  }

  /** Keeps a moving card above its neighbours while it travels. */
  lift(card, anim) {
    const pile = card.parentElement, top = pile && pile.parentElement && pile.parentElement.classList.contains('toprow');
    if (pile) pile.style.zIndex = '20';
    if (top) this.root.classList.add('animating-top');
    const done = () => { if (pile) pile.style.zIndex = ''; if (top) this.root.classList.remove('animating-top'); };
    anim.finished.then(done, done);
  }

  turnOver(card, base, delay, scale) {
    const f = (deg) => `${base === 'none' ? '' : base} perspective(520px) rotateY(${deg}deg)`;
    card.animate([{ transform: f(88) }, { transform: f(0) }], { duration: 170 * scale, delay, easing: 'ease-out', fill: 'backwards' });
  }

  flight(prev, last, scale) {
    const dur = 180 * scale;
    const easing = scale > 1 ? 'cubic-bezier(.3,1.35,.5,1)' : 'cubic-bezier(.2,.9,.3,1.03)';
    let n = 0;
    this.root.querySelectorAll('.card[data-id]').forEach((c) => {
      const r = c.getBoundingClientRect();
      let p = prev.cards.get(c.dataset.id);
      if (!p && last && last[0] === K.STOCK && c.dataset.pile === 'w') p = { x: prev.stock.left, y: prev.stock.top, up: false };   // drawn from the stock
      if (!p && last && last[0] === K.STOCK && c.dataset.pile === 's') p = { x: prev.waste.left, y: prev.waste.top, up: true };    // stock turned over
      if (!p) return;
      const dx = p.x - r.left, dy = p.y - r.top;
      const base = c.style.transform || 'none';
      const delay = (n++ % 8) * 14 * scale;
      if (Math.abs(dx) + Math.abs(dy) > 1.5) {
        const a = c.animate([{ transform: `translate(${dx}px, ${dy}px) ${base === 'none' ? '' : base}` }, { transform: base }], { duration: dur, delay, easing, fill: 'backwards' });
        this.lift(c, a);
      }
      if (!p.up && c.classList.contains('up')) this.turnOver(c, base, dur * 0.55, scale);
    });
  }

  dealAnimation(scale) {
    const from = this.piles.s.getBoundingClientRect();
    let k = 0;
    for (let row = 0; row < 7; row++) {
      for (let col = row; col < 7; col++) {
        const card = this.piles['t' + col].querySelectorAll('.card')[row];
        if (!card) continue;
        const r = card.getBoundingClientRect();
        const base = card.style.transform || 'none';
        const delay = k++ * 24 * scale, dur = 300 * scale;
        const a = card.animate([{ transform: `translate(${from.left - r.left}px, ${from.top - r.top}px) ${base === 'none' ? '' : base}` }, { transform: base }],
          { duration: dur, delay, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'backwards' });
        this.lift(card, a);
        if (card.classList.contains('up')) this.turnOver(card, base, delay + dur * 0.8, scale);
      }
    }
  }

  pulse(key) {
    const p = this.piles[key]; if (!p) return;
    p.classList.remove('land'); void p.offsetWidth; p.classList.add('land');
    setTimeout(() => p.classList.remove('land'), 420);
  }

  /** Any touch while cards are gliding lets them arrive at once. */
  skipMotion() {
    document.getAnimations().forEach((a) => { const t = a.effect && a.effect.target; if (t && t.classList && t.classList.contains('card')) a.finish(); });
  }

  // ---------- gestures ----------

  onDown(e) {
    if (this.ctl.isDealing || e.button > 0) return;
    const card = e.target.closest('.card');
    if (!card || card.classList.contains('static')) return;
    this.press = {
      pile: card.dataset.pile, count: Number(card.dataset.count), el: card,
      x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false,
    };
    try { this.root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  onMove(e) {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.dragging) {
      if (Math.hypot(dx, dy) < (settings.get('tapToMove') ? 6 : 3) || p.pile === 's') return;
      this.startDrag(e);
    }
    this.moveDrag(e, dx, dy);
  }

  startDrag() {
    const p = this.press, st = this.ctl.state;
    p.dragging = true;
    document.dispatchEvent(new CustomEvent('kc:drag', { detail: true }));
    const pileEl = this.piles[p.pile];
    const els = [...pileEl.querySelectorAll('.card')].filter((c) => Number(c.dataset.count) <= p.count && !c.classList.contains('static'));
    const fk = kindOf(p.pile), fi = indexOf(p.pile);
    const candidates = legalMoves(st).filter((m) => m[0] === fk && m[1] === fi && m[4] === p.count && m[0] !== K.STOCK);
    const rects = {};
    for (const [k, v] of Object.entries(this.piles)) rects[k] = v.getBoundingClientRect();   // measured before any zoom
    const layer = el('div', '', document.body); layer.id = 'dragLayer';
    const items = els.map((c) => {
      const r = c.getBoundingClientRect();
      layer.appendChild(c);
      c.classList.add('dragging');
      c.style.left = r.left + 'px'; c.style.top = r.top + 'px'; c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
      c.style.transform = 'none';
      return c;
    });
    this.drag = { items, candidates, rects, target: null, layer };
    this.root.classList.add('dragging');
    if (p.pile[0] === 'w' || p.pile[0] === 'f') this.root.classList.add('from-top');
    this.pileEl(p.pile)?.classList.add('focus', 'lens');
    this.lensOn = settings.get('zoomEffect');
    if (!this.lensOn) this.root.classList.remove('dragging');   // no dimming or zoom when the effect is off
  }

  pileEl(key) { return this.piles[key]; }

  moveDrag(e, dx, dy) {
    const d = this.drag; if (!d) return;
    const lift = this.lensOn && document.documentElement.dataset.zoom === 'on' ? 1.12 : 1;
    const vx = dx - (d.lastDx === undefined ? dx : d.lastDx); d.lastDx = dx;
    d.tilt = (d.tilt || 0) * 0.8 + Math.max(-7, Math.min(7, vx * 0.7)) * 0.2;          // cards lean a little as you sweep them
    const tilt = lift > 1 && motionScale() ? d.tilt : 0;
    d.items.forEach((c) => { c.style.transform = `translate(${dx}px, ${dy}px) scale(${lift}) rotate(${tilt}deg)`; });
    const target = d.candidates.find((m) => {
      const r = d.rects[keyOf(m[2], m[3])];
      return r && e.clientX >= r.left - 12 && e.clientX <= r.right + 12 && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12;
    }) || null;
    if (!d.target || !target || !moveEq(d.target, target)) {
      if (d.target) this.piles[keyOf(d.target[2], d.target[3])]?.classList.remove('focus', 'lens');
      if (target) this.piles[keyOf(target[2], target[3])]?.classList.add('focus', 'lens');
      d.target = target;
    }
  }

  onUp(e, cancelled) {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    this.press = null;
    try { this.root.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!p.dragging) { if (!cancelled) this.tap(p); return; }
    document.dispatchEvent(new CustomEvent('kc:drag', { detail: false }));
    const d = this.drag;
    const move = cancelled ? null : d.target;
    if (move) { this.ctl.perform(move); return; }              // controller emits -> render()
    // no legal drop: glide the cards back, then redraw
    const slow = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (slow) d.items.forEach((c) => { c.classList.add('snap'); c.style.transform = 'translate(0,0) scale(1)'; });
    setTimeout(() => { this.render(); }, slow ? 230 : 0);
  }

  endDragVisuals() {
    if (!this.drag) return;
    this.drag.layer.remove();
    this.drag = null;
    this.root.classList.remove('dragging', 'from-top');
  }

  /** A tap on the stock always draws. A tap on any other card only moves it if "Tap a card to move it" is on
   *  (or the move comes from the keyboard). */
  tap(p, fromKeyboard = false) {
    if (p.pile === 's') {
      if (!this.ctl.perform(DRAW)) this.ctl.denied();
      return;
    }
    if (!fromKeyboard && !settings.get('tapToMove')) return;
    const m = bestMove(this.ctl.state, kindOf(p.pile), indexOf(p.pile), p.count);
    if (m) { this.ctl.perform(m); return; }
    this.ctl.denied();
    p.el.classList.remove('shake'); void p.el.offsetWidth; p.el.classList.add('shake');
  }

  onKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest && e.target.closest('.card');
    if (!card || card.classList.contains('static') || this.ctl.isDealing) return;
    e.preventDefault();
    this.tap({ pile: card.dataset.pile, count: Number(card.dataset.count), el: card }, true);
  }
}
