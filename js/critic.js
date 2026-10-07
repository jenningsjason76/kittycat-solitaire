// Rule-based "lazy move" detection. Looks at the position BEFORE the move.
import {
  K, apply, legalMoves, isLegal, isUp, rankOf, cardsFrom, moveEq,
  isSafeFoundationMove, revealsHiddenCard, hiddenBeneath,
} from './engine.js';

function bestReveal(s, moves) {
  let best = null;
  for (const m of moves) if (!best || hiddenBeneath(s, m) > hiddenBeneath(s, best)) best = m;
  return best;
}

/** Returns { kind, better } or null. kinds: stockCycling, earlyFoundation, wastedKing, missedReveal. */
export function critique(before, move) {
  const legal = legalMoves(before);
  const revealing = legal.filter((m) => revealsHiddenCard(before, m));

  // 1. Drew from the stock while a card-revealing or safe foundation move existed.
  if (move[0] === K.STOCK) {
    const best = bestReveal(before, revealing);
    if (best) return { kind: 'stockCycling', better: best };
    const safe = legal.find((m) => isSafeFoundationMove(before, m));
    if (safe) return { kind: 'stockCycling', better: safe };
    return null;
  }

  // 2. Sent a card to the foundation too early (it was still a landing spot).
  if (move[2] === K.FOUND && move[0] === K.TAB) {
    if (isSafeFoundationMove(before, move) || revealsHiddenCard(before, move)) return null;
    const landing = legal.find((m) => !moveEq(m, move) && m[2] === K.TAB && m[3] === move[1]);
    return landing ? { kind: 'earlyFoundation', better: landing } : null;
  }

  // 3. Used an empty column on a King from the waste while another King sat on hidden cards.
  if (move[0] === K.WASTE && move[2] === K.TAB && before.tab[move[3]].length === 0) {
    const king = cardsFrom(before, K.WASTE, 0, 1);
    if (king && rankOf(king[0]) === 13) {
      for (let j = 0; j < 7; j++) {
        const col = before.tab[j];
        const firstUp = col.findIndex((c) => isUp(c));
        if (firstUp > 0 && rankOf(col[firstUp]) === 13) {
          const better = [K.TAB, j, K.TAB, move[3], col.length - firstUp];
          if (isLegal(before, better)) return { kind: 'wastedKing', better };
        }
      }
    }
    return null;
  }

  // 4. Made a tableau move that revealed nothing, and lost the chance to reveal a hidden card.
  if (move[2] === K.TAB && !revealsHiddenCard(before, move) && revealing.length) {
    const after = apply(before, move);
    if (after && !legalMoves(after).some((m) => revealsHiddenCard(after, m))) {
      return { kind: 'missedReveal', better: bestReveal(before, revealing) };
    }
  }
  return null;
}
