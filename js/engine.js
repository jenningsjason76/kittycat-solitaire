// Klondike rules. Pure functions, no DOM. A card is an int: id (0-51) plus 64 if face up.
// id = suit * 13 + (rank - 1); suits: 0 clubs, 1 diamonds, 2 hearts, 3 spades.
// A move is [fromKind, fromIndex, toKind, toIndex, count].

export const K = Object.freeze({ STOCK: 0, WASTE: 1, FOUND: 2, TAB: 3 });
export const UP = 64;
export const SUIT_SYMBOL = ['♣', '♦', '♥', '♠'];
export const SUIT_NAME = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];
export const DRAW = Object.freeze([K.STOCK, 0, K.WASTE, 0, 1]);

export const rankOf = (c) => (c & 63) % 13 + 1;
export const suitOf = (c) => Math.floor((c & 63) / 13);
export const isRed = (c) => { const s = suitOf(c); return s === 1 || s === 2; };
export const isUp = (c) => (c & UP) !== 0;
export const rankSymbol = (c) => { const r = rankOf(c); return r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r); };
export const rankName = (c) => { const r = rankOf(c); return r === 1 ? 'Ace' : r === 11 ? 'Jack' : r === 12 ? 'Queen' : r === 13 ? 'King' : String(r); };
export const shortName = (c) => rankSymbol(c) + SUIT_SYMBOL[suitOf(c)];
export const cardName = (c) => `${rankName(c)} of ${SUIT_NAME[suitOf(c)]}`;
export const assetName = (c) => `card_${SUIT_NAME[suitOf(c)].toLowerCase()}_${rankOf(c)}`;
export const moveEq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4];

// ---------- Setup ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

/** draw: 1 or 3. scoring: 'standard' | 'vegas' | 'none'. */
export function newGame(seed, draw, scoring) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const rng = mulberry32(seed);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tab = [];
  let idx = 0;
  for (let col = 0; col < 7; col++) {
    const pile = [];
    for (let row = 0; row <= col; row++) {
      const id = deck[idx++];
      pile.push(row === col ? id | UP : id);
    }
    tab.push(pile);
  }
  return {
    seed, draw, scoring,
    stock: deck.slice(idx), waste: [], found: [0, 0, 0, 0], tab,
    score: scoring === 'vegas' ? -52 : 0, moves: 0, recycles: 0,
  };
}

export function cloneState(s) {
  return { ...s, stock: s.stock.slice(), waste: s.waste.slice(), found: s.found.slice(), tab: s.tab.map((c) => c.slice()) };
}

// ---------- Queries ----------

export const isWon = (s) => s.found[0] === 13 && s.found[1] === 13 && s.found[2] === 13 && s.found[3] === 13;
const recycleLimit = (s) => (s.scoring === 'vegas' ? (s.draw === 1 ? 0 : 2) : Infinity);
export const canRecycle = (s) => s.recycles < recycleLimit(s);
export const canDraw = (s) => s.stock.length > 0 || (s.waste.length > 0 && canRecycle(s));

export function canAutoFinish(s) {
  return !isWon(s) && s.stock.length === 0 && s.waste.length === 0 &&
    s.tab.every((col) => col.every((c) => isUp(c)));
}

/** The cards a move would pick up, or null if that is not a valid group. */
export function cardsFrom(s, fk, fi, n) {
  switch (fk) {
    case K.WASTE:
      if (n !== 1 || s.waste.length === 0) return null;
      return [s.waste[s.waste.length - 1]];
    case K.FOUND:
      if (n !== 1 || fi < 0 || fi > 3 || s.found[fi] === 0) return null;
      return [(fi * 13 + s.found[fi] - 1) | UP];
    case K.TAB: {
      const col = s.tab[fi];
      if (!col || n < 1 || col.length < n) return null;
      const run = col.slice(col.length - n);
      for (const c of run) if (!isUp(c)) return null;
      for (let k = 0; k < run.length - 1; k++) {
        const a = run[k], b = run[k + 1];
        if (rankOf(a) !== rankOf(b) + 1 || isRed(a) === isRed(b)) return null;
      }
      return run;
    }
    default:
      return null;
  }
}

export function isLegal(s, m) {
  if (m[0] === K.STOCK) return canDraw(s);
  const run = cardsFrom(s, m[0], m[1], m[4]);
  if (!run) return false;
  const first = run[0];
  if (m[2] === K.FOUND) {
    const i = m[3];
    if (i < 0 || i > 3 || run.length !== 1) return false;
    if (m[0] === K.FOUND && m[1] === i) return false;
    if (suitOf(first) !== i) return false;
    return rankOf(first) === s.found[i] + 1;
  }
  if (m[2] === K.TAB) {
    const j = m[3];
    if (j < 0 || j > 6) return false;
    if (m[0] === K.TAB && m[1] === j) return false;
    const col = s.tab[j];
    if (col.length > 0) {
      const top = col[col.length - 1];
      return isUp(top) && rankOf(top) === rankOf(first) + 1 && isRed(top) !== isRed(first);
    }
    return rankOf(first) === 13;
  }
  return false;
}

/** Moving a whole column that starts with a King into an empty column changes nothing. */
export function isPointless(s, m) {
  return m[0] === K.TAB && m[2] === K.TAB && s.tab[m[3]].length === 0 && s.tab[m[1]].length === m[4];
}

export function legalMoves(s) {
  const sources = [];
  if (s.waste.length) sources.push([K.WASTE, 0, 1]);
  for (let i = 0; i < 4; i++) if (s.found[i] > 0) sources.push([K.FOUND, i, 1]);
  for (let i = 0; i < 7; i++) {
    const col = s.tab[i];
    for (let k = 0; k < col.length; k++) if (isUp(col[k])) sources.push([K.TAB, i, col.length - k]);
  }
  const moves = [];
  for (const [fk, fi, n] of sources) {
    if (n === 1) {
      for (let i = 0; i < 4; i++) {
        const m = [fk, fi, K.FOUND, i, n];
        if (isLegal(s, m)) moves.push(m);
      }
    }
    for (let j = 0; j < 7; j++) {
      const m = [fk, fi, K.TAB, j, n];
      if (isLegal(s, m) && !isPointless(s, m)) moves.push(m);
    }
  }
  if (canDraw(s)) moves.push(DRAW.slice());
  return moves;
}

/** Destination for tap-to-move: foundation first, then a built column, then an empty column. */
export function bestMove(s, fk, fi, n) {
  const legal = [];
  if (n === 1) {
    for (let i = 0; i < 4; i++) { const m = [fk, fi, K.FOUND, i, n]; if (isLegal(s, m)) legal.push(m); }
  }
  for (let j = 0; j < 7; j++) {
    const m = [fk, fi, K.TAB, j, n];
    if (isLegal(s, m) && !isPointless(s, m)) legal.push(m);
  }
  return legal.find((m) => m[2] === K.FOUND)
    || legal.find((m) => m[2] === K.TAB && s.tab[m[3]].length > 0)
    || legal[0] || null;
}

/** Next card that can go straight to a foundation (used by auto-finish). */
export function nextFoundationMove(s) {
  if (s.waste.length) {
    const top = s.waste[s.waste.length - 1];
    const m = [K.WASTE, 0, K.FOUND, suitOf(top), 1];
    if (isLegal(s, m)) return m;
  }
  for (let i = 0; i < 7; i++) {
    const col = s.tab[i];
    if (col.length) {
      const m = [K.TAB, i, K.FOUND, suitOf(col[col.length - 1]), 1];
      if (isLegal(s, m)) return m;
    }
  }
  return null;
}

// ---------- Applying moves ----------

function addScore(h, m, flipped) {
  if (h.scoring === 'none') return;
  if (h.scoring === 'vegas') {
    if (m[2] === K.FOUND) h.score += 5;
    if (m[0] === K.FOUND) h.score -= 5;
    return;
  }
  if (m[0] === K.WASTE && m[2] === K.TAB) h.score += 5;
  else if (m[0] === K.WASTE && m[2] === K.FOUND) h.score += 10;
  else if (m[0] === K.TAB && m[2] === K.FOUND) h.score += 10;
  else if (m[0] === K.FOUND && m[2] === K.TAB) h.score -= 15;
  if (flipped) h.score += 5;
  h.score = Math.max(h.score, 0);
}

function drawFromStock(s) {
  const h = cloneState(s);
  if (h.stock.length) {
    const n = Math.min(h.draw, h.stock.length);
    for (let i = 0; i < n; i++) h.waste.push(h.stock.pop() | UP);
  } else if (h.waste.length && canRecycle(h)) {
    h.stock = h.waste.slice().reverse().map((c) => c & ~UP);
    h.waste = [];
    h.recycles += 1;
    if (h.scoring === 'standard') {
      if (h.draw === 1) h.score = Math.max(h.score - 100, 0);
      else if (h.recycles >= 3) h.score = Math.max(h.score - 20, 0);
    }
  } else {
    return null;
  }
  h.moves += 1;
  return h;
}

/** Returns the new state, or null if the move is not legal. The old state is never changed. */
export function apply(s, m) {
  if (m[0] === K.STOCK) return drawFromStock(s);
  if (!isLegal(s, m)) return null;
  const run = cardsFrom(s, m[0], m[1], m[4]);
  const h = cloneState(s);
  if (m[0] === K.WASTE) h.waste.pop();
  else if (m[0] === K.FOUND) h.found[m[1]] -= 1;
  else h.tab[m[1]].length -= m[4];

  if (m[2] === K.FOUND) h.found[m[3]] += 1;
  else for (const c of run) h.tab[m[3]].push(c | UP);

  let flipped = false;
  if (m[0] === K.TAB) {
    const col = h.tab[m[1]];
    if (col.length && !isUp(col[col.length - 1])) { col[col.length - 1] |= UP; flipped = true; }
  }
  addScore(h, m, flipped);
  h.moves += 1;
  return h;
}

// ---------- Analysis helpers (solver and move critic) ----------

/** A card that can go to the foundation without ever hurting the game. */
export function isSafeFoundationMove(s, m) {
  if (m[2] !== K.FOUND || m[4] !== 1 || m[0] === K.FOUND || m[0] === K.STOCK || !isLegal(s, m)) return false;
  const card = cardsFrom(s, m[0], m[1], 1)[0];
  if (rankOf(card) <= 2) return true;
  for (let suit = 0; suit < 4; suit++) {
    const red = suit === 1 || suit === 2;
    if (red !== isRed(card) && s.found[suit] < rankOf(card) - 1) return false;
  }
  return true;
}

/** True if the move turns over a face-down card. */
export function revealsHiddenCard(s, m) {
  if (m[0] !== K.TAB || (m[2] !== K.TAB && m[2] !== K.FOUND)) return false;
  const col = s.tab[m[1]];
  const below = col.length - m[4] - 1;
  return below >= 0 && !isUp(col[below]);
}

export const hiddenCount = (s, i) => s.tab[i].filter((c) => !isUp(c)).length;
export const hiddenBeneath = (s, m) => (m[0] === K.TAB ? hiddenCount(s, m[1]) : 0);

function mix32(h, v) {
  h = Math.imul(h ^ v, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h | 0;
}

/** A 53-bit fingerprint of a position; column order does not matter. */
export function stateKey(s) {
  const cols = new Array(7);
  for (let i = 0; i < 7; i++) {
    let h = 0x1234567;
    const col = s.tab[i];
    for (let k = 0; k < col.length; k++) h = mix32(h, col[k] + 1);
    cols[i] = h >>> 0;
  }
  cols.sort((a, b) => a - b);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (const ch of cols) { h1 = mix32(h1, ch); h2 = mix32(h2 ^ 0x9e3779b9, ch + 7); }
  h1 = mix32(h1, 0xAAAA); h2 = mix32(h2, 0xAAAA);
  for (const c of s.stock) { h1 = mix32(h1, c + 1); h2 = mix32(h2, c + 11); }
  h1 = mix32(h1, 0xBBBB); h2 = mix32(h2, 0xBBBB);
  for (const c of s.waste) { h1 = mix32(h1, c + 1); h2 = mix32(h2, c + 13); }
  for (const f of s.found) { h1 = mix32(h1, f + 1); h2 = mix32(h2, f + 17); }
  if (s.scoring === 'vegas') { h1 = mix32(h1, s.recycles + 1); h2 = mix32(h2, s.recycles + 19); }
  return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1fffff);
}

/** Fingerprint of the table and foundations only (not the stock or waste). Equal keys = no board progress. */
export function boardKey(s) {
  return stateKey({ ...s, stock: [], waste: [], recycles: 0 });
}

/** Plain-English description of a move. Call on the position BEFORE the move. */
export function describe(s, m) {
  if (m[0] === K.STOCK) return 'draw from the stock';
  const run = cardsFrom(s, m[0], m[1], m[4]);
  if (!run) return 'make a different move';
  const what = m[4] > 1 ? `the ${shortName(run[0])} run` : shortName(run[0]);
  if (m[2] === K.FOUND) return `move ${what} to the foundation`;
  if (m[2] === K.TAB) {
    const col = s.tab[m[3]];
    return col.length ? `move ${what} onto ${shortName(col[col.length - 1])}` : `move ${what} into the empty column`;
  }
  return 'make a different move';
}
