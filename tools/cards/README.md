# Rebuilding the card images

The card faces come from the CC0 "English pattern playing cards deck PLUS" artwork (Wikimedia Commons). These two scripts rebuild all 52 faces and 4 backs with the large, heavy corner numbers. You only need this to change the corner size or boldness.

1. Put the source SVG next to the scripts as `deck_t.svg` (the downloaded deck SVG with its page-background rectangle removed so the card corners are transparent).
2. `python3 render_sheet.py` renders the whole sheet to `sheet.png` with Playwright (about 10 seconds, about 11 MB).
3. `BOLD_R=4 OUTDIR=out python3 make_cards.py` writes `out/png/` (for the iPhone asset catalog) and `out/webp/` (for `cards/`). Add `ONLY=spades_10,hearts_13` for a quick test of a few cards.
- `BOLD_R` is how much heavier the number strokes get, in pixels at the 908-wide working size. 3 is a little, 4 is the current look, 5 gets tight on the "10". 11 fills the letters in.
- Layout numbers (number height 21.5% of the card, suit 11.2%, margins 3% and 2.4%) are near the top of `make_cards.py`.
