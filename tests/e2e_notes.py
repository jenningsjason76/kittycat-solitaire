"""Change 1: the coach only says 'Lazy move' for a concrete cost, uses 'Tip' for a skipped free move,
and does not repeat the same kind of banner within a few moves (it is still counted)."""
from playwright.sync_api import sync_playwright
import sys
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/index.html"
errors = []
CRAFT_REVEAL = """() => { const c = kittycat.ctl; const s = c.state;
  s.stock = [0]; s.waste = []; s.found = [0,0,0,0]; s.tab = [[],[],[],[],[],[],[]];
  s.tab[0] = [20, 31 | 64]; s.tab[1] = [45 | 64]; s.moves = 0;           // a red 6 on a hidden card, and a black 7 to land on
  c.state = s; c.history = []; c.serials = []; c.feedbackLog = []; c.lastShown = {}; c.activeEntryId = null; c.winnability = 'unknown'; c.winningLine = []; c.emit(); }"""
CRAFT_TIP = """() => { const c = kittycat.ctl; const s = c.state;
  s.stock = [1]; s.waste = []; s.found = [0,0,0,0]; s.tab = [[],[],[],[],[],[],[]];
  s.tab[0] = [0 | 64]; s.moves = 0;                                        // the ace of clubs, free to go up, nothing hidden
  c.state = s; c.history = []; c.serials = []; c.feedbackLog = []; c.lastShown = {}; c.activeEntryId = null; c.winnability = 'unknown'; c.winningLine = []; c.emit(); }"""
DRAW = "async () => { const E = await import('./js/engine.js'); kittycat.ctl.perform(E.DRAW); }"
banner = "(() => { const b = document.getElementById('banner'); return b.hidden ? null : b.innerText.split('\\n')[0]; })()"
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True).new_page()
    page.on("console", lambda m: errors.append((m.type, m.text[:150])) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:150])))
    page.goto(URL); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000)
    page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000); page.wait_for_timeout(400)

    page.evaluate(CRAFT_REVEAL); page.evaluate(DRAW); page.wait_for_timeout(300)
    print("1. skipped reveal  ->", page.evaluate(banner))
    page.evaluate(CRAFT_REVEAL); page.evaluate("kittycat.ctl.lastShown = {'stockCycling:lazy': 0}")  # a note of the same kind was just shown
    page.evaluate(DRAW); page.wait_for_timeout(300)
    print("2. same kind again -> banner:", page.evaluate(banner), "| still counted:", page.evaluate("kittycat.ctl.feedbackLog.length"), "entries, quiet flag:", page.evaluate("kittycat.ctl.feedbackLog[0].quiet === true"))

    page.evaluate(CRAFT_TIP); page.evaluate(DRAW); page.wait_for_timeout(300)
    print("3. skipped free card ->", page.evaluate(banner), "| lazy:", page.evaluate("kittycat.ctl.lazyCount"), "tips:", page.evaluate("kittycat.ctl.tipCount"))
    page.evaluate("kittycat.settings.set('feedbackTone','gentle')"); page.wait_for_timeout(300)
    print("   gentle tone      ->", page.evaluate(banner)); page.evaluate("kittycat.settings.set('feedbackTone','direct')")

    page.evaluate(CRAFT_REVEAL); page.evaluate(DRAW); page.wait_for_timeout(200)
    page.evaluate("kittycat.ctl.undo()"); page.wait_for_timeout(200)
    page.evaluate(DRAW); page.wait_for_timeout(300)
    print("4. note after an undo is shown again:", page.evaluate(banner) is not None)

    page.evaluate(CRAFT_TIP); page.evaluate(DRAW); page.wait_for_timeout(200)
    page.evaluate("kittycat.ctl.moveCount = 0")
    page.evaluate("document.querySelector('#menuBtn').click()"); page.get_by_role("menuitem", name="Game summary").click(); page.wait_for_timeout(300)
    print("5. summary rows:", page.evaluate("[...document.querySelectorAll('dialog .kv')].map(r => r.innerText.replace(/\\n/g, ': '))"))
    print("errors:", errors)
    b.close()
