import test from 'node:test';
import assert from 'node:assert/strict';
import {
  K, newGame, apply, legalMoves, isWon, isLegal, cardsFrom, UP, suitOf, rankOf, isUp, bestMove,
  canAutoFinish, nextFoundationMove, stateKey, describe, DRAW,
} from '../js/engine.js';
import { solve, findWinnableDeal } from '../js/solver.js';
import { critique } from '../js/critic.js';

function replay(state, line) {
  let s = state;
  for (const m of line) {
    assert.ok(isLegal(s, m), 'illegal move in line: ' + m);
    s = apply(s, m);
    assert.ok(s, 'apply returned null');
  }
  return s;
}

test('deal layout: 28 tableau cards, 24 stock, all 52 unique, tops face up', () => {
  const s = newGame(12345, 1, 'standard');
  assert.equal(s.stock.length, 24);
  assert.deepEqual(s.tab.map((c) => c.length), [1, 2, 3, 4, 5, 6, 7]);
  const ids = [...s.stock, ...s.tab.flat()].map((c) => c & 63);
  assert.equal(new Set(ids).size, 52);
  s.tab.forEach((col) => col.forEach((c, i) => assert.equal(isUp(c), i === col.length - 1)));
  assert.deepEqual(newGame(12345, 1, 'standard'), s); // same seed, same deal
  assert.notDeepEqual(newGame(12346, 1, 'standard').tab, s.tab);
});

test('apply never changes the old state', () => {
  const s = newGame(7, 3, 'standard');
  const copy = JSON.stringify(s);
  for (const m of legalMoves(s)) apply(s, m);
  assert.equal(JSON.stringify(s), copy);
});

test('draw 1 and draw 3, recycle, vegas limits', () => {
  let s = newGame(1, 3, 'standard');
  s = apply(s, DRAW);
  assert.equal(s.waste.length, 3);
  assert.equal(s.stock.length, 21);
  assert.ok(s.waste.every(isUp));
  // draw everything then recycle
  while (s.stock.length) s = apply(s, DRAW);
  const wasteBefore = s.waste.map((c) => c & 63);
  s = apply(s, DRAW);
  assert.equal(s.waste.length, 0);
  assert.equal(s.stock.length, 24);
  assert.equal(s.recycles, 1);
  // first card drawn first again
  assert.equal(s.stock[s.stock.length - 1] & 63, wasteBefore[0]);

  let v = newGame(1, 1, 'vegas');
  while (v.stock.length) v = apply(v, DRAW);
  assert.equal(apply(v, DRAW), null, 'vegas draw-1 allows one pass only');
  let v3 = newGame(1, 3, 'vegas');
  for (let pass = 0; pass < 3; pass++) {
    while (v3.stock.length) v3 = apply(v3, DRAW);
    if (pass < 2) v3 = apply(v3, DRAW);
  }
  assert.equal(apply(v3, DRAW), null, 'vegas draw-3 allows three passes');
  assert.equal(newGame(1, 1, 'vegas').score, -52);
});

test('scoring: standard rules', () => {
  // build a tiny position by hand
  const base = newGame(1, 1, 'standard');
  const s = { ...base, stock: [], waste: [], found: [0, 0, 0, 0], tab: [[], [], [], [], [], [], []] };
  // ace of clubs (id 0) face up in col 0 over a face-down card
  s.tab[0] = [30, 0 | UP];
  const m = [K.TAB, 0, K.FOUND, 0, 1];
  const out = apply(s, m);
  assert.equal(out.score, 10 + 5); // tableau -> foundation +10, flip +5
  assert.equal(out.found[0], 1);
  assert.ok(isUp(out.tab[0][0]));
  const back = apply(out, [K.FOUND, 0, K.TAB, 3, 1]);
  assert.equal(back, null, 'ace cannot go on an empty column');
});

test('tap-to-move and run moves', () => {
  const base = newGame(1, 1, 'standard');
  const s = { ...base, stock: [], waste: [], found: [0, 0, 0, 0], tab: [[], [], [], [], [], [], []] };
  // 9 of hearts (id 26+8=34) on 10 of spades (39+9=48)? suits: 0 clubs 1 diamonds 2 hearts 3 spades
  const tenSpades = 3 * 13 + 9, nineHearts = 2 * 13 + 8, eightClubs = 0 * 13 + 7;
  s.tab[0] = [tenSpades | UP, nineHearts | UP];
  s.tab[1] = [(2 * 13 + 10) | UP]; // jack of hearts
  const m = bestMove(s, K.TAB, 0, 2);
  assert.ok(m, 'run of two should be movable onto the red jack? (10 spades needs a red J)');
  assert.deepEqual(m.slice(2, 4), [K.TAB, 1]);
  const out = apply(s, m);
  assert.deepEqual(out.tab[1].map((c) => c & 63), [2 * 13 + 10, tenSpades, nineHearts]);
  assert.equal(out.tab[0].length, 0);
  assert.equal(bestMove(s, K.TAB, 0, 1), null); // nine of hearts on nothing legal (needs a black 10)
});

test('solver wins replay to a real win (draw 1, many deals)', () => {
  let wins = 0, lost = 0, unknown = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = newGame(seed, 1, 'standard');
    const out = solve(s, 20000);
    if (out.result === 'win') {
      wins++;
      assert.ok(isWon(replay(s, out.line)), 'line must reach a win, seed ' + seed);
    } else if (out.result === 'lost') lost++; else unknown++;
  }
  console.log(`draw1 budget 20000: win ${wins}, lost ${lost}, unknown ${unknown} of 60`);
  assert.ok(wins >= 20);
});

test('solver wins replay to a real win (draw 3, vegas)', () => {
  let wins = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const [draw, scoring] of [[3, 'standard'], [1, 'vegas'], [3, 'vegas']]) {
      const s = newGame(seed, draw, scoring);
      const out = solve(s, 6000);
      if (out.result === 'win') { wins++; assert.ok(isWon(replay(s, out.line))); }
    }
  }
  console.log('draw3/vegas wins found:', wins);
  assert.ok(wins > 10);
});

test('findWinnableDeal returns a verified deal', () => {
  for (const draw of [1, 3]) {
    let verified = 0;
    for (let i = 0; i < 10; i++) {
      const { game, line } = findWinnableDeal(draw, 'standard');
      if (line) { verified++; assert.ok(isWon(replay(game, line))); }
    }
    console.log(`draw ${draw}: verified ${verified}/10`);
    assert.ok(verified >= 8);
  }
});

test('auto-finish helpers', () => {
  const base = newGame(1, 1, 'standard');
  const s = { ...base, stock: [], waste: [], found: [12, 12, 12, 12], tab: [[], [], [], [], [], [], []] };
  s.tab[0] = [(0 * 13 + 12) | UP];  // king of clubs
  s.tab[1] = [(1 * 13 + 12) | UP];
  s.tab[2] = [(2 * 13 + 12) | UP];
  s.tab[3] = [(3 * 13 + 12) | UP];
  assert.ok(canAutoFinish(s));
  let cur = s, n = 0;
  while (nextFoundationMove(cur)) { cur = apply(cur, nextFoundationMove(cur)); n++; }
  assert.equal(n, 4);
  assert.ok(isWon(cur));
});

test('stateKey ignores column order but not content', () => {
  const s = newGame(5, 1, 'standard');
  const t = { ...s, tab: [...s.tab].reverse() };
  assert.equal(stateKey(s), stateKey(t));
  const u = apply(s, legalMoves(s)[0]);
  assert.notEqual(stateKey(s), stateKey(u));
});

test('critic: stock cycling, early foundation, wasted king, missed reveal', () => {
  const blank = () => ({ ...newGame(1, 1, 'standard'), stock: [0], waste: [], found: [0, 0, 0, 0], tab: [[], [], [], [], [], [], []] });

  // 1. draw while a revealing move exists: red 6 on black 7 flips the card beneath
  let s = blank();
  const black7 = 3 * 13 + 6, red6 = 2 * 13 + 5;
  s.tab[0] = [20, red6 | UP];                 // face-down card under a red 6
  s.tab[1] = [black7 | UP];
  let c = critique(s, DRAW);
  assert.equal(c && c.kind, 'stockCycling');
  assert.ok(isLegal(s, c.better));

  // 2. early foundation (narrow rule): only when it costs the ONLY way to turn over a hidden card
  const id = (suit, rank) => suit * 13 + rank - 1;       // suits: 0 clubs 1 diamonds 2 hearts 3 spades
  //   (a) the old over-eager case: sending 5H up while a black 4 could land on it, but nothing is hidden -> quiet
  s = blank();
  s.found = [0, 0, 4, 0];
  s.tab[0] = [id(3, 4) | UP];                              // black 4 of spades, nothing under it
  s.tab[1] = [id(2, 5) | UP];                              // 5 of hearts
  assert.equal(critique(s, [K.TAB, 1, K.FOUND, 2, 1]), null, 'ordinary progress must not be flagged');
  //   (b) stranding: the black 4 sits on a hidden card and the 5H is the only place it can land
  s = blank();
  s.found = [0, 0, 4, 0];
  s.tab[0] = [20, id(3, 4) | UP];                          // hidden card under the black 4
  s.tab[1] = [id(2, 5) | UP];
  c = critique(s, [K.TAB, 1, K.FOUND, 2, 1]);
  assert.equal(c && c.kind, 'earlyFoundation');
  assert.equal(c.severity, 'lazy');
  assert.deepEqual(c.better, [K.TAB, 0, K.TAB, 1, 1]);
  //   (c) another reveal is still available afterwards -> quiet
  s.tab[2] = [21, id(0, 4) | UP];                          // a second hidden card under the black 4 of clubs
  s.tab[3] = [id(1, 5) | UP];                              // a red 5 of diamonds the club 4 can reach
  assert.equal(critique(s, [K.TAB, 1, K.FOUND, 2, 1]), null, 'a reveal remains, so no flag');

  // tip vs lazy for the stock: a skipped reveal is lazy, a skipped free foundation card is only a tip
  s = blank();
  s.tab[0] = [id(0, 1) | UP];                              // ace of clubs, free to go up, nothing hidden anywhere
  c = critique(s, DRAW);
  assert.equal(c && c.kind, 'stockCycling');
  assert.equal(c.severity, 'tip');
  s = blank();
  s.tab[0] = [20, red6 | UP]; s.tab[1] = [black7 | UP];
  assert.equal(critique(s, DRAW).severity, 'lazy');

  // 3. wasted king: king from waste into empty column while another king covers hidden cards
  s = blank();
  const kingH = 2 * 13 + 12, kingS = 3 * 13 + 12;
  s.waste = [kingH | UP];
  s.tab[0] = [20, kingS | UP];
  s.tab[1] = [];                                            // empty column
  c = critique(s, [K.WASTE, 0, K.TAB, 1, 1]);
  assert.equal(c && c.kind, 'wastedKing');

  // no false alarm: good reveal move is not flagged
  s = blank();
  s.tab[0] = [20, red6 | UP];
  s.tab[1] = [black7 | UP];
  assert.equal(critique(s, [K.TAB, 0, K.TAB, 1, 1]), null);

  // 4. missed reveal: playing a card onto the only spot the revealing move needed
  s = blank();
  const black7b = 3 * 13 + 6, red6b = 2 * 13 + 5, red6c = 1 * 13 + 5;
  s.tab[0] = [20, red6b | UP];          // hidden card under red 6 (reveal by moving onto black 7)
  s.tab[1] = [black7b | UP];
  s.waste = [red6c | UP];               // another red 6 can take the same black 7
  c = critique(s, [K.WASTE, 0, K.TAB, 1, 1]);
  assert.equal(c && c.kind, 'missedReveal');
});

test('describe reads well', () => {
  const base = newGame(1, 1, 'standard');
  const s = { ...base, stock: [], waste: [], found: [0, 0, 0, 0], tab: [[], [], [], [], [], [], []] };
  s.tab[0] = [(2 * 13 + 5) | UP];
  s.tab[1] = [(3 * 13 + 6) | UP];
  assert.equal(describe(s, [K.TAB, 0, K.TAB, 1, 1]), 'move 6♥ onto 7♠');
  assert.equal(describe(s, DRAW), 'draw from the stock');
});

test('acceptance: the coach stays quiet on winning games (narrowed early-foundation rule)', () => {
  let games = 0, flags = 0, early = 0;
  for (let seed = 1; seed <= 60 && games < 30; seed++) {
    let st = newGame(seed * 7919, 1, 'standard');
    const out = solve(st, 20000);
    if (out.result !== 'win') continue;
    games++;
    for (const m of out.line) {
      const c = critique(st, m);
      if (c && c.severity === 'lazy') { flags++; if (c.kind === 'earlyFoundation') early++; }
      st = apply(st, m);
    }
  }
  console.log(`winning games ${games}: lazy flags per game ${(flags / games).toFixed(2)} (early-foundation ${(early / games).toFixed(2)})`);
  assert.ok(games >= 20);
  assert.ok(early / games < 1, 'early-foundation flags per winning game must stay under 1 (was about 10)');
  assert.ok(flags / games < 2, 'lazy flags per winning game must stay under 2');
});
