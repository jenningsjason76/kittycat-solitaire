"""Change 3: the move she just made can be undone for 6 seconds, flagged or not. After that, flagged-only applies."""
from playwright.sync_api import sync_playwright
import sys
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/index.html"
errors = []
CRAFT = """() => { const c = kittycat.ctl; const s = c.state;
  s.stock = [0]; s.waste = []; s.found = [0,0,0,0]; s.tab = [[],[],[],[],[],[],[]];
  s.tab[0] = [20, 31 | 64]; s.tab[1] = [45 | 64]; s.moves = 0;          // red 6 on a hidden card; a black 7 to land on
  c.state = s; c.history = []; c.serials = []; c.moveTimes = []; c.feedbackLog = []; c.lastShown = {}; c.activeEntryId = null;
  c.winnability = 'unknown'; c.winningLine = []; c.emit(); }"""
GOOD = "async () => { const E = await import('./js/engine.js'); kittycat.ctl.perform([E.K.TAB, 0, E.K.TAB, 1, 1]); }"      # a good, unflagged move
undo_enabled = "!document.getElementById('undoBtn').disabled"
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True).new_page()
    page.on("console", lambda m: errors.append((m.type, m.text[:150])) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:150])))
    page.goto(URL); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000)
    page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000); page.wait_for_timeout(400)
    print("policy:", page.evaluate("kittycat.settings.get('undoPolicy')"))

    page.evaluate(CRAFT)
    print("0. before any move: undo enabled:", page.evaluate(undo_enabled))
    page.evaluate(GOOD); page.wait_for_timeout(300)
    print("1. a good (unflagged) move just made: flagged entries:", page.evaluate("kittycat.ctl.feedbackLog.length"), "| undo enabled:", page.evaluate(undo_enabled))
    page.locator("#undoBtn").click(); page.wait_for_timeout(300)
    print("   undo within 6 s works: tab[1] has", page.evaluate("kittycat.ctl.state.tab[1].length"), "card (was 2 after the move)")

    page.evaluate(GOOD); page.wait_for_timeout(5000)
    print("2. 5 s later: undo enabled:", page.evaluate(undo_enabled))
    page.wait_for_timeout(1600)
    print("   6.6 s later: undo enabled:", page.evaluate(undo_enabled), "(should be False, and it updated by itself)")

    page.evaluate(CRAFT)
    page.evaluate("async () => { const E = await import('./js/engine.js'); kittycat.ctl.perform(E.DRAW); }")   # a flagged (lazy) move
    page.wait_for_timeout(6800)
    print("3. a flagged move stays undoable after 6.8 s:", page.evaluate(undo_enabled))

    page.evaluate("kittycat.settings.set('undoPolicy', 'unlimited')")
    page.evaluate(CRAFT); page.evaluate(GOOD); page.wait_for_timeout(6800)
    print("4. unlimited policy: undo enabled after 6.8 s:", page.evaluate(undo_enabled))
    page.evaluate("kittycat.settings.set('undoPolicy', 'flaggedOnly')")

    page.evaluate(CRAFT); page.evaluate(GOOD); page.wait_for_timeout(200)
    page.evaluate("kittycat.ctl.save()"); page.wait_for_timeout(300); page.reload()
    page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000); page.wait_for_timeout(500)
    print("5. after reopening the app, no grace period:", page.evaluate(undo_enabled) is False, "| history restored:", page.evaluate("kittycat.ctl.history.length"), "moveTimes length matches:", page.evaluate("kittycat.ctl.moveTimes.length === kittycat.ctl.history.length"))
    print("errors:", errors)
    b.close()
