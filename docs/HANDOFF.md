# Handoff: technical status (Oct 9, 2026)

## State
- Web app: complete through "Design v2" (felt and light, paper cards, icons, serif and rounded type, card motion, four victory sequences, win card, dead-end card with progress ring, "Go back to it" and "Try this deal again", cat on end cards, settings for Light, Motion, Victory, Cat).
- Tests: 17 node tests pass; the browser tests (cat, notes, deadend, drag, drag_only, grace, motion, victory, audio, feedback_settings_stats) pass with no console errors.
- Not confirmed: whether the latest version has been pushed to GitHub. Check `git log --oneline -3` and the live site.
- iPhone app (separate Xcode project): has drag-only default, larger card numbers, the narrow coach rule, Tip labels, quiet repeats, the dead-end prompt and the 6-second undo (6 files from `KittyCatSolitaire-Update4.zip`, never compiled). It lacks all of Design v2.

## Known gaps and risks
- Nothing tested in Safari or on a real iPhone. Motion speed on older phones is unknown. Victory sequences were checked from frames, not watched.
- Draw 3 has a smaller solver budget for the dead-end check, so more dead ends may go unflagged.
- The coach may now be too quiet (the early-foundation rule almost never fires on winning games).
- Deals handed out look easier than random ones (small simulation).
- `privacy.html` (for an App Store release) still has a placeholder email and is not in this repository.

## Ideas not built
Deal-difficulty setting. A "show me a winning move" hint. Daily deal and iCloud sync. Four-color suits and a high-contrast mode. Vegas scoring and age rating review. TestFlight (builds expire after 90 days). Porting Design v2 to SwiftUI.

## Useful simulations (not in the repo)
Simulated players (a simple careful bot, a random bot) were used to measure how often the coach fires on winning lines and whether lost games end. They are easy to rebuild from `engine.js`, `solver.js` and `critic.js`.
