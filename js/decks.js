// The decks. 'classic' is the original CC0 English-pattern deck (webp, with the old Table and Card back settings).
// The other three are drawn as SVG by tools/cards/make_svg_decks.py; each one owns its table, chrome and back,
// in light and dark. No imports from settings.js here, because settings.js imports this file.
import { asset } from './assets.js';
import { assetName } from './engine.js';

export const DECKS = {
  classic: { name: 'Classic', line: 'The English pattern deck on moss felt. The table and card back are yours to choose.', theme: { light: '#7F9F8C', dark: '#17241E' } },
  room: { name: 'Reading Room', line: 'A leather desk under a lamp. Baize by day, oxblood by night, brass and a bookplate back.', theme: { light: '#5F7A5A', dark: '#3B2320' } },
  thorn: { name: 'Thorn & Star', line: 'A night court. Midnight plum velvet, antique gold, roses and a crescent moon.', theme: { light: '#5B4A66', dark: '#231A2E' } },
  ice: { name: 'Centre Ice', line: 'A rink by day, an arena at night. Cold navy against heat red.', theme: { light: '#DFE9EE', dark: '#17233A' } },
};
export const DECK_IDS = Object.keys(DECKS);
export const SVG_DECKS = DECK_IDS.filter((d) => d !== 'classic');

export const deckId = (d) => (d in DECKS ? d : 'classic');

/** The image for a face-up card. `c` is a card code (the face-up flag is ignored). */
export function faceURL(c, deck) {
  const d = deckId(deck);
  return asset(d === 'classic' ? `cards/${assetName(c)}.webp` : `cards/${d}/${assetName(c)}.svg`);
}

/** The back for a drawn deck. Classic backs come from the Card back setting (CSS), so this returns null for it. */
export function backURL(deck, dark) {
  const d = deckId(deck);
  return d === 'classic' ? null : asset(`cards/${d}/card_back_${dark ? 'dark' : 'light'}.svg`);
}

/** Every file a drawn deck needs (the service worker and the tests use the same list). */
export function deckFiles(deck) {
  const files = [];
  for (const s of ['clubs', 'diamonds', 'hearts', 'spades']) for (let r = 1; r <= 13; r++) files.push(`cards/${deck}/card_${s}_${r}.svg`);
  return files.concat([`cards/${deck}/card_back_light.svg`, `cards/${deck}/card_back_dark.svg`]);
}
