// The drawn decks: every file exists, is an SVG, and is listed in the service worker's shell cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import vm from 'node:vm';

const DECKS = ['thorn', 'ice', 'room'];
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const files = (d) => [...SUITS.flatMap((s) => Array.from({ length: 13 }, (_, i) => `cards/${d}/card_${s}_${i + 1}.svg`)), `cards/${d}/card_back_light.svg`, `cards/${d}/card_back_dark.svg`];

test('each drawn deck has 52 faces and two backs, all SVG', () => {
  for (const d of DECKS) {
    for (const f of files(d)) {
      assert.ok(existsSync(f), `${f} missing (run python3 tools/cards/make_svg_decks.py)`);
      const text = readFileSync(f, 'utf8');
      assert.ok(text.startsWith('<svg') && text.trimEnd().endsWith('</svg>'), `${f} is not a complete SVG`);
      assert.ok(text.includes('viewBox="0 0 250 350"'), `${f} has the wrong card box`);
      assert.ok(statSync(f).size < 40000, `${f} is unexpectedly large`);
    }
  }
});

test('the hidden cat is in every deck', () => {
  // the cat and paw are drawn with these exact shapes (see make_svg_decks.py)
  const CAT = 'M1-20l-2-15 9 9zM17-24l5-13 3 14z', PAW = 'cy="8" rx="13" ry="10"';
  assert.ok(readFileSync('cards/thorn/card_back_light.svg', 'utf8').includes(CAT), 'Thorn & Star: cat in the moon');
  assert.ok(readFileSync('cards/room/card_back_light.svg', 'utf8').includes(CAT), 'Reading Room: cat on the books');
  assert.ok(readFileSync('cards/room/card_spades_1.svg', 'utf8').includes(CAT), 'Reading Room: cat by the ace');
  assert.ok(readFileSync('cards/ice/card_back_light.svg', 'utf8').includes(PAW), 'Centre Ice: paw on the puck');
  assert.ok(readFileSync('cards/ice/card_spades_1.svg', 'utf8').includes(PAW), 'Centre Ice: paw on the ace');
});

test('sw.js caches every deck file and js/decks.js', () => {
  const src = readFileSync('sw.js', 'utf8');
  const start = src.indexOf('const SUITS'), end = src.indexOf('];', src.indexOf('const SHELL')) + 2;
  const shell = vm.runInNewContext(src.slice(start, end) + '; SHELL', {});
  const set = new Set(shell);
  for (const d of DECKS) for (const f of files(d)) assert.ok(set.has(f), `${f} not in SHELL`);
  assert.ok(set.has('js/decks.js'), 'js/decks.js not in SHELL');
  for (const f of shell) if (f.startsWith('cards/') || f.startsWith('js/')) assert.ok(existsSync(f), `${f} listed in SHELL but missing`);
});

test('build_single.py embeds the decks module and the SVG files', () => {
  const b = readFileSync('tools/build_single.py', 'utf8');
  assert.ok(/ORDER = \[[^\]]*"decks"/.test(b), 'decks missing from ORDER');
  assert.ok(b.includes('"*.svg"') && b.includes('".svg"'), 'svg files are not embedded');
});
