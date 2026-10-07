// Wording for the feedback notes (direct and gentle tones).
export const TITLES = {
  stockCycling: 'Drew from the stock too soon',
  earlyFoundation: 'Sent a card up too early',
  wastedKing: 'Used an empty column on the wrong King',
  missedReveal: 'Missed a move that reveals a hidden card',
  costGame: 'Made the deal unwinnable',
};

const DIRECT = {
  stockCycling: 'Lazy move. You drew a card when a better move was on the table.',
  earlyFoundation: 'Lazy move. That card was still useful on the table.',
  wastedKing: 'Lazy move. That empty column should go to a King that uncovers hidden cards.',
  missedReveal: 'Lazy move. You skipped a move that reveals a hidden card.',
  costGame: 'That move made this deal unwinnable.',
};
const GENTLE = {
  stockCycling: 'You may not need to draw yet. There was a better move on the table.',
  earlyFoundation: 'That card might still be useful on the table. Want to take another look?',
  wastedKing: 'A different King could make better use of that empty column.',
  missedReveal: 'There was a move that reveals a hidden card. Want to see it?',
  costGame: 'After that move, this deal can no longer be won. You can undo it.',
};

export function message(entry, tone) {
  let text = (tone === 'gentle' ? GENTLE : DIRECT)[entry.kind];
  if (entry.costGame && entry.kind !== 'costGame') {
    text += tone === 'gentle' ? ' It may also have made this deal unwinnable.' : ' It also made this deal unwinnable.';
  }
  return text;
}
