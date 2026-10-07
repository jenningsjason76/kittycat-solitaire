"""Her feedback: she prefers dragging. Tapping a card must NOT move it unless the setting is on;
dragging always works; the stock still draws on tap; the keyboard still works."""
from playwright.sync_api import sync_playwright
import sys
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/index.html"
errors = []
CRAFT = """async () => {
  const E = await import('./js/engine.js');
  const c = kittycat.ctl;
  const s = E.newGame(1, 1, 'standard');
  s.stock = [0]; s.waste = []; s.found = [0,0,0,0]; s.tab = [[],[],[],[],[],[],[]];
  s.tab[0] = [20 | 0, 31 | 64];   // hidden card under the red 6 of hearts (id 31 = 2*13+5)
  s.tab[1] = [45 | 64];           // black 7 of spades (id 45 = 3*13+6)
  c.state = s; c.history = []; c.serials = []; c.feedbackLog = []; c.winnability = 'unknown'; c.winningLine = []; c.emit(); }"""
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append((m.type, m.text[:150])) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:150])))
    page.goto(URL); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000)
    page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000); page.wait_for_timeout(500)
    print("default tapToMove:", page.evaluate("kittycat.settings.get('tapToMove')"))
    page.evaluate(CRAFT.replace("import('./js/engine.js')", "import(window.__solver ? '' : './js/engine.js')") if False else CRAFT); page.wait_for_timeout(300)

    mv = page.evaluate("kittycat.ctl.state.moves")
    page.locator('.pile[data-pile="t0"] .card.up').tap(); page.wait_for_timeout(300)
    print("tap on a card with tap-to-move OFF -> moves:", mv, "->", page.evaluate("kittycat.ctl.state.moves"), "(should not change)")

    src = page.locator('.pile[data-pile="t0"] .card.up').bounding_box(); dst = page.locator('.pile[data-pile="t1"]').bounding_box()
    page.mouse.move(src["x"] + src["width"]/2, src["y"] + 12); page.mouse.down()
    page.mouse.move(src["x"] + src["width"]/2 + 4, src["y"] + 18, steps=2)          # only 6 px of movement
    page.mouse.move(dst["x"] + dst["width"]/2, dst["y"] + 40, steps=6); page.mouse.up(); page.wait_for_timeout(400)
    print("short drag moves the card:", page.evaluate("kittycat.ctl.state.moves") == mv + 1, "| column 1 now has", page.evaluate("kittycat.ctl.state.tab[1].length"), "cards")

    page.evaluate(CRAFT); page.wait_for_timeout(300)
    n0 = page.evaluate("kittycat.ctl.state.waste.length")
    page.locator(".pile.stock .card").first.tap(); page.wait_for_timeout(300)
    print("tap on the stock still draws:", page.evaluate("kittycat.ctl.state.waste.length") == n0 + 1)

    page.evaluate(CRAFT); page.wait_for_timeout(300)
    page.locator('.pile[data-pile="t0"] .card.up').focus(); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    print("keyboard Enter still moves a card:", page.evaluate("kittycat.ctl.state.tab[1].length") == 2)

    page.evaluate(CRAFT); page.evaluate("kittycat.settings.set('tapToMove', true)"); page.wait_for_timeout(300)
    page.locator('.pile[data-pile="t0"] .card.up').tap(); page.wait_for_timeout(300)
    print("tap-to-move ON -> tap moves the card:", page.evaluate("kittycat.ctl.state.tab[1].length") == 2)

    page.locator("#menuBtn").click(); page.get_by_role("menuitem", name="Settings").click(); page.wait_for_timeout(300)
    print("settings row present:", page.evaluate("[...document.querySelectorAll('dialog .row-item span')].some(s => s.textContent === 'Tap a card to move it')"))
    print("errors:", errors)
    b.close()
