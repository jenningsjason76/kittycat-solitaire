"""'Any moves left?' in the menu: a move now, a move after drawing, nothing left, and the Keep playing / reset behavior."""
from playwright.sync_api import sync_playwright
import sys
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/index.html"
errors = []
SETUP = """(kind) => {
  const id = (suit, rank) => suit * 13 + rank - 1, UP = 64, c = kittycat.ctl, s = c.state;
  s.stock = []; s.waste = []; s.found = [0,0,0,0]; s.moves = 0;
  s.tab = [[id(1,13), id(1,5)|UP], [id(1,1), id(3,7)|UP], [id(2,1), id(0,2)|UP], [id(3,1), id(2,10)|UP], [id(1,2), id(0,13)|UP], [id(2,2), id(0,3)|UP], [id(3,2), id(1,11)|UP]];
  if (kind === 'now') s.tab[0] = [id(1,13), id(2,6)|UP];
  if (kind === 'later') s.stock = [id(0,1)];
  if (kind === 'none') s.stock = [id(3,13)];          // a king nobody can place: drawing is legal, but never makes progress
  c.state = s; c.history = []; c.serials = []; c.moveTimes = []; c.feedbackLog = []; c.lastShown = {}; c.deadEnd = null; c.outOfMoves = false;
  c.winnability = 'unknown'; c.winningLine = []; c.isDealing = false; c.highlight = null; c.emit(); }"""
dlg = "(() => { const d = document.getElementById('dlg'); return d.open ? d.innerText.replace(/\\n+/g, ' / ') : null; })()"
ov = "(() => { const o = document.getElementById('overlay'); return o.hidden ? null : o.innerText.replace(/\\n+/g, ' / '); })()"
def ask(page):
    page.click("#menuBtn"); page.get_by_role("menuitem", name="Any moves left?").click(); page.wait_for_timeout(900)
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True).new_page()
    page.on("console", lambda m: errors.append((m.type, m.text[:150])) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:150])))
    page.goto(URL); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000)
    page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000); page.wait_for_timeout(1500)
    print("menu item with icon:", page.evaluate("(() => { document.getElementById('menuBtn').click(); const b = [...document.querySelectorAll('#menu button')].find(x => x.innerText.includes('Any moves left')); const r = !!b && !!b.querySelector('svg'); document.getElementById('menuBtn').click(); return r; })()"))

    page.evaluate(SETUP, "now"); ask(page)
    print("1. a move on the board ->", page.evaluate(dlg)[:120], "| buttons:", page.evaluate("[...document.querySelectorAll('#dlg button.btn')].map(b => b.textContent)"))
    page.get_by_role("button", name="Show me one").click(); page.wait_for_timeout(300)
    print("   Show me one outlines a card:", page.evaluate("document.querySelectorAll('.card.hl').length"), "source,", page.evaluate("document.querySelectorAll('.hl-dst').length"), "target")
    page.wait_for_timeout(5300)
    print("   outline fades by itself:", page.evaluate("document.querySelectorAll('.card.hl').length == 0"))

    page.evaluate(SETUP, "later"); ask(page)
    print("2. after drawing ->", page.evaluate(dlg)[:120])
    page.get_by_role("button", name="Keep playing").click()

    page.evaluate(SETUP, "none"); ask(page)
    print("3. nothing left -> dialog closed:", page.evaluate(dlg) is None, "| end card:", (page.evaluate(ov) or "")[:140])
    print("   buttons:", page.evaluate("[...document.querySelectorAll('#overlay button')].map(b => b.textContent)"))
    page.get_by_role("button", name="Keep playing").click(); page.wait_for_timeout(300)
    print("   Keep playing dismisses it:", page.evaluate(ov) is None)

    page.evaluate(SETUP, "none"); ask(page)
    seed = page.evaluate("kittycat.ctl.state.seed"); page.get_by_role("button", name="Try this deal again").click(); page.wait_for_function("!kittycat.ctl.isDealing", timeout=20000); page.wait_for_timeout(500)
    print("   Try this deal again: card gone", page.evaluate(ov) is None, "| outOfMoves reset:", page.evaluate("kittycat.ctl.outOfMoves === false"), "| same seed:", seed == page.evaluate("kittycat.ctl.state.seed"))

    page.evaluate(SETUP, "none"); ask(page); page.get_by_role("button", name="New game").click(); page.wait_for_function("!kittycat.ctl.isDealing", timeout=20000); page.wait_for_timeout(500)
    print("   New game: card gone", page.evaluate(ov) is None, "| outOfMoves reset:", page.evaluate("kittycat.ctl.outOfMoves === false"))

    page.evaluate(SETUP, "now"); page.evaluate("kittycat.ctl.winnability = 'unwinnable'"); ask(page)
    print("4. unwinnable but moves exist ->", page.evaluate(dlg)[:170])
    print("errors:", errors)
    b.close()
