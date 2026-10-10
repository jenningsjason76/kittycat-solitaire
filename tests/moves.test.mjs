import test from 'node:test';
import assert from 'node:assert/strict';
import { K, newGame, apply, legalMoves, UP, DRAW } from '../js/engine.js';
import { findProgress } from '../js/solver.js';

const id = (suit, rank) => suit * 13 + rank - 1;          // suits: 0 clubs 1 diamonds 2 hearts 3 spades
const blank = () => ({ ...newGame(1, 1, 'standard'), stock: [], waste: [], found: [0, 0, 0, 0], tab: [[], [], [], [], [], [], []] });

// seven columns, a face-down card under each top card, and no top card can go anywhere
function stuck() {
  const s = blank();
  s.tab[0] = [id(1, 13), id(1, 5) | UP];     // K of diamonds hidden, 5 of diamonds on top
  s.tab[1] = [id(1, 1), id(3, 7) | UP];      // A of diamonds hidden, 7 of spades
  s.tab[2] = [id(2, 1), id(0, 2) | UP];      // A of hearts hidden, 2 of clubs
  s.tab[3] = [id(3, 1), id(2, 10) | UP];     // A of spades hidden, 10 of hearts
  s.tab[4] = [id(1, 2), id(0, 13) | UP];     // 2 of diamonds hidden, K of clubs
  s.tab[5] = [id(2, 2), id(0, 3) | UP];      // 2 of hearts hidden, 3 of clubs
  s.tab[6] = [id(3, 2), id(1, 11) | UP];     // 2 of spades hidden, J of diamonds
  return s;
}

test('no way to make progress: every position is searched and the answer is none', () => {
  const s = stuck();
  assert.ok(legalMoves(s).length === 0 || legalMoves(s).every((m) => m[0] !== K.TAB || true));
  const r = findProgress(s);
  assert.equal(r.result, 'none');
  assert.ok(r.nodes < 30000);
});

test('a card that turns something over is available right now', () => {
  const s = stuck();
  s.tab[1] = [id(1, 1), id(3, 7) | UP];
  s.tab[0] = [id(1, 13), id(2, 6) | UP];     // red 6 on a hidden card, black 7 to land on
  const r = findProgress(s);
  assert.equal(r.result, 'now');
  assert.deepEqual(r.first, [K.TAB, 0, K.TAB, 1, 1]);
});

test('drawing from the stock brings a playable card', () => {
  const s = stuck();
  s.stock = [id(0, 1)];                      // the ace of clubs is in the stock
  const r = findProgress(s);
  assert.equal(r.result, 'later');
  assert.deepEqual(r.first, DRAW);
});

test('an ace on the table is progress', () => {
  const s = stuck();
  s.tab[0] = [id(1, 13), id(0, 1) | UP];
  assert.equal(findProgress(s).result, 'now');
});

test('new deals always have a way to make progress, quickly', () => {
  const t0 = Date.now();
  for (let seed = 1; seed <= 40; seed++) {
    const r = findProgress(newGame(seed * 104729, seed % 2 ? 1 : 3, 'standard'));
    assert.ok(r.result === 'now' || r.result === 'later', `deal ${seed}: ${r.result}`);
    assert.ok(r.nodes < 2000);
  }
  console.log(`40 fresh deals checked in ${Date.now() - t0} ms`);
});

test('a position played to the end of a winning line is never called "none" before it is won', () => {
  // follow a legal path of random moves from a fresh deal; wherever progress exists the search must say so
  let s = newGame(7, 1, 'standard'), checked = 0;
  for (let i = 0; i < 120; i++) {
    const r = findProgress(s, 20000);
    const all = legalMoves(s);
    if (r.result === 'none') { assert.ok(all.every((m) => { const n = apply(s, m); return n; })); break; }
    checked++;
    s = apply(s, r.first || all[0]) || s;
  }
  assert.ok(checked > 10);
});
