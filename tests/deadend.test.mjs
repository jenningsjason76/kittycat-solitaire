import test from 'node:test';
import assert from 'node:assert/strict';
import { K, newGame, apply, legalMoves, isWon, DRAW, boardKey, stateKey, isSafeFoundationMove, revealsHiddenCard, hiddenBeneath } from '../js/engine.js';
import { solve } from '../js/solver.js';

// a simple careful player used to produce stuck positions; it never repeats a position
function tidyBot(s0, cap = 600) {
  let s = s0; const seen = new Set([stateKey(s)]);
  for (let moves = 0; moves < cap && !isWon(s); moves++) {
    const rank = (m) => m[0] === K.STOCK ? 9 : isSafeFoundationMove(s, m) ? 0 : revealsHiddenCard(s, m) ? 1 - hiddenBeneath(s, m) / 100 : m[0] === K.FOUND ? 8 : m[2] === K.FOUND ? 3 : m[0] === K.WASTE ? 2 : 4;
    const cands = legalMoves(s).map((m) => [rank(m), m]).sort((a, b) => a[0] - b[0]);
    let next = null;
    for (const [, m] of cands) { const n = apply(s, m); if (n && !seen.has(stateKey(n))) { next = n; break; } }
    if (!next) break;
    s = next; seen.add(stateKey(s));
  }
  return s;
}

test('boardKey ignores the stock and waste, but not the table', () => {
  const s = newGame(5, 1, 'standard');
  let t = s;
  for (let i = 0; i < 30; i++) t = apply(t, DRAW);                 // draw and recycle only
  assert.equal(boardKey(s), boardKey(t), 'drawing never changes the board');
  const move = legalMoves(s).find((m) => m[0] !== K.STOCK);
  assert.ok(move);
  assert.notEqual(boardKey(s), boardKey(apply(s, move)), 'a real move changes the board');
});

test('a full pass of the stock with no play gives the same board key at each recycle', () => {
  let s = newGame(9, 1, 'standard');
  const keys = [];
  for (let i = 0; i < 80; i++) {
    const before = s; s = apply(s, DRAW);
    if (before.stock.length === 0 && s.stock.length > 0) keys.push(boardKey(s));
  }
  assert.ok(keys.length >= 2);
  assert.ok(keys.every((k) => k === keys[0]));
});

test('soundness: the solver never calls a winnable position lost', () => {
  let checked = 0, bad = 0;
  for (let seed = 1; seed <= 40 && checked < 400; seed++) {
    let s = newGame(seed * 7919, seed % 2 ? 1 : 3, 'standard');
    const out = solve(s, 20000);
    if (out.result !== 'win') continue;
    out.line.forEach((m, i) => {
      if (i % 9 === 0) {
        const r = solve(s, 6000);
        checked++;
        if (r.result === 'lost') bad++;
      }
      s = apply(s, m);
    });
  }
  console.log(`positions on winning lines checked: ${checked}, wrongly called lost: ${bad}`);
  assert.ok(checked > 100);
  assert.equal(bad, 0, 'a winnable position must never be reported as lost');
});

test('stuck positions: the solver proves many are lost, and the stock pass leaves the board unchanged', () => {
  let found = 0, tried = 0, undecided = 0;
  for (let seed = 1; seed <= 40 && found < 3; seed++) {
    const end = tidyBot(newGame(seed * 7907, 1, 'standard'));
    if (isWon(end)) continue;
    tried++;
    const r = solve(end, 60000);
    if (r.result === 'unknown') undecided++;
    if (r.result !== 'lost') continue;
    found++;
    // two full passes through the stock change nothing on the board
    let s = end, recycles = [];
    for (let i = 0; i < 120 && recycles.length < 3; i++) {
      const b = s; s = apply(s, DRAW) || s;
      if (b.stock.length === 0 && s.stock.length > 0) recycles.push(boardKey(s));
    }
    assert.ok(recycles.length >= 2 && recycles.every((k) => k === recycles[0]), 'board unchanged across recycles');
  }
  console.log(`stuck positions tried ${tried}, proven lost ${found}, undecided ${undecided}`);
  assert.ok(found >= 3, 'should find at least 3 provably lost stuck positions in 40 deals');
});
