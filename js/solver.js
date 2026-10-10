// Depth-first solver for Klondike with every card known, plus a finder for winnable deals.
import {
  K, apply, isWon, legalMoves, isSafeFoundationMove, revealsHiddenCard, hiddenBeneath,
  stateKey, newGame, randomSeed, UP, DRAW,
} from './engine.js';

/** Moves to try, best first. A safe foundation move is always played alone. */
export function orderedMoves(s) {
  const all = legalMoves(s);
  for (const m of all) if (isSafeFoundationMove(s, m)) return [m];

  const priority = (m) => {
    if (m[0] === K.STOCK) return 4000;
    if (m[0] === K.FOUND) return 5000;
    if (revealsHiddenCard(s, m)) return -hiddenBeneath(s, m);
    if (m[0] === K.WASTE && m[2] === K.TAB) return 1000;
    if (m[2] === K.FOUND) return 2000;
    return 3000;
  };
  return all.map((m, i) => [priority(m), i, m]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
}

/**
 * result: 'win' (line = full winning move list), 'lost' (search finished, no win exists),
 * or 'unknown' (ran out of its node budget).
 */
export function solve(start, nodeLimit) {
  if (isWon(start)) return { result: 'win', line: [], nodes: 0 };
  const seen = new Set([stateKey(start)]);
  const stack = [{ s: start, moves: orderedMoves(start), next: 0, via: null }];
  let nodes = 0;
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top.next >= top.moves.length) { stack.pop(); continue; }
    const move = top.moves[top.next++];
    const g = apply(top.s, move);
    if (!g) continue;
    nodes += 1;
    if (nodes > nodeLimit) return { result: 'unknown', line: null, nodes };
    if (isWon(g)) {
      const line = [];
      for (let i = 1; i < stack.length; i++) line.push(stack[i].via);
      line.push(move);
      return { result: 'win', line, nodes };
    }
    const key = stateKey(g);
    if (seen.has(key)) continue;
    seen.add(key);
    stack.push({ s: g, moves: orderedMoves(g), next: 0, via: move });
  }
  return { result: 'lost', line: null, nodes };
}

/** Looks for a random deal the solver can prove is winnable. Draw 3 gets a smaller budget per try. */
export function findWinnableDeal(draw, scoring) {
  const nodeLimit = draw === 1 ? 4000 : 8000;
  const attempts = draw === 1 ? 12 : 20;
  let last = null;
  for (let i = 0; i < attempts; i++) {
    const candidate = newGame(randomSeed(), draw, scoring);
    last = candidate;
    const out = solve(candidate, nodeLimit);
    if (out.result === 'win') return { game: candidate, line: out.line };
  }
  return { game: last || newGame(randomSeed(), draw, scoring), line: null };
}

const homeCount = (s) => s.found[0] + s.found[1] + s.found[2] + s.found[3];
const faceUpCount = (s) => s.tab.reduce((n, col) => n + col.reduce((m, c) => m + ((c & UP) ? 1 : 0), 0), 0);

/**
 * "Any moves left?" Is there ANY way to make progress: a card going to a foundation, or a face-down card
 * being turned over? Looks at every sequence of moves, including drawing from the stock and shuffling cards
 * between columns, breadth first.
 *   'now'     the shortest way to progress starts with a move on the board (first = that move)
 *   'later'   it starts by drawing from the stock
 *   'none'    every reachable position was searched and none makes progress: she has run out of moves
 *   'unknown' the search was cut short (nodeLimit)
 * -> { result, first, nodes }
 */
export function findProgress(start, nodeLimit = 30000) {
  const home0 = homeCount(start), up0 = faceUpCount(start);
  const seen = new Set([stateKey(start)]);
  const queue = [{ s: start, first: null }];
  let head = 0, nodes = 0;
  while (head < queue.length) {
    const { s, first } = queue[head++];
    if (++nodes > nodeLimit) return { result: 'unknown', first: null, nodes };
    for (const m of legalMoves(s)) {
      const n = apply(s, m);
      if (!n) continue;
      const f = first || m;
      if (homeCount(n) > home0 || faceUpCount(n) > up0) return { result: f[0] === DRAW[0] ? 'later' : 'now', first: f, nodes };
      const key = stateKey(n);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ s: n, first: f });
    }
  }
  return { result: 'none', first: null, nodes };
}
