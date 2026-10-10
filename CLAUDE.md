# KittyCat Solitaire (web app)

A Klondike solitaire PWA. Plain ES modules: no build step, no dependencies. GitHub Pages serves this repository's root from `main` at https://jenningsjason76.github.io/kittycat-solitaire/. Its difference from other solitaire apps is an honest coach that says when a move could have been better. The player is a relaxed adult who likes calm, careful play.

## Commands
- `npm test` (= `node --test tests/*.test.mjs`): 17 rules, solver and critic tests. Needs Node 18+.
- `sh tests/run-e2e.sh [names]`: Playwright browser tests, e.g. `sh tests/run-e2e.sh cat motion`. One-time setup: `python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt && playwright install chromium`.
- `python3 -m http.server 8765`, then open http://127.0.0.1:8765/ to play.
- `./tools/publish.sh "message"`: runs the rules tests, stamps a new version in `sw.js`, commits and pushes. Only when I ask.
- `python3 tools/build_single.py [--hosted]`: optional one-file builds into `dist/` and `dist-hosted/` (git-ignored).

## Layout (`js/`)
- `engine.js` rules, scoring, `stateKey`, `boardKey`. `solver.js` + `worker.js` + `solver-client.js` DFS solver (winnable deals, win/lost proofs).
- `critic.js` the coach's rules. `text.js` the wording. `store.js` `GameController`: the only owner of game state (undo, dead ends, replay, autosave).
- `board.js` renders cards, drag, and motion (FLIP flights, flips, deal). `main.js` bar, banner, end cards, cat state. `dialogs.js` settings, stats, summary.
- `solver.js` also has `findProgress`. `victory.js` four victory sequences. `cat.js` the cat SVG and states. `icons.js` line icons. `audio.js`, `settings.js`, `stats.js`, `storage.js`, `assets.js`.
- `css/styles.css` (the "Design v2" block at the end overrides the older look), `css/textures.css`, `sw.js` (offline cache), `cards/` and `sounds/` (CC0; keep the CREDITS files).
- Tests poke `window.kittycat` (`ctl`, `settings`, `stats`, `fx`).

## Decisions (do not reopen without a reason)
- Klondike only. Drag to move; tap-to-move is a setting, off by default. Tapping the stock always draws.
- "Lazy move" only for a concrete cost: skipped reveal when drawing, early foundation that loses the only card-turning move, wasted king, missed reveal, or a move that made the deal unwinnable. "Tip" for skipping a free foundation card. The same kind of note is not repeated within 6 moves.
- Undo: flagged moves, plus any move for 6 seconds. "Unlimited" is a setting.
- Dead end: after two stock passes with no board change, ask the solver (budget 120000 nodes draw 1, 50000 draw 3). Show "No win from here" only on proof.
- Cat appears on win and end cards by default. No on-table companion by default, no paw badge cue.
- "Any moves left?" (menu): breadth-first search for ANY way to make progress (a card to a foundation, or a face-down card turned over), including drawing and shuffling columns (`findProgress` in `solver.js`, budget 30000 nodes). `none` shows the "No more moves." card. It is different from the dead-end prompt, which needs a solver proof that the deal cannot be won; a lost deal can still have moves.
- Updates: a home-screen app on iPhone is frozen and resumed, so the page calls `reg.update()` on return to the app, on reconnect and hourly (`main.js`). Settings > About > Version shows the cache version (`kittycat-core-<stamp>`); `publish.sh` prints the same stamp. Never tell anyone to delete and re-add the home-screen icon: it can erase saved games and stats (IndexedDB).
- Card corner numbers are large and heavy (rebuild with `tools/cards/`, see its README).
- Look: moss felt, lamp gold, paper cards, system serif headlines, system rounded sans. Motion default Calm. Victory: random among four, never the same twice in a row.

## Rules of the road
- Run the narrowest relevant test after a change: engine, solver or critic -> `npm test`; board or motion -> `drag motion`; victory or cat -> `victory cat`; settings or dialogs -> `feedback_settings_stats`. Run everything before publishing.
- The solver must never call a winnable position lost (`tests/deadend.test.mjs`). Never weaken that test.
- Every animation must respect `motionScale()` (0 means none). It already covers Reduce Motion and the Motion setting.
- A new file under `js/`, `css/` or `icons/` must be added to `SHELL` in `sw.js` and, for the one-file build, to `ORDER` in `tools/build_single.py`. Do not otherwise edit `VERSION` in `sw.js`; `publish.sh` stamps it.
- `Board.render()` rebuilds the card elements on every emit. Do not keep element references across renders.
- Never force-push. Before `publish.sh` or any `git push`, show `git status --short` and `git diff --stat` and wait for my yes.
- Keep `tools/publish.sh` and `tests/run-e2e.sh` executable (`chmod +x`).
- Keep web and iPhone numbers in sync (fan gaps 0.42 and 0.12, shrink floor 0.2, analysis limits, undo grace, note cooldown). The iPhone app is a separate Xcode project with its own CLAUDE.md.
- Fonts are system fonts only. The look only matches the design on Apple devices; elsewhere it falls back.

More history: `docs/HANDOFF.md`.
