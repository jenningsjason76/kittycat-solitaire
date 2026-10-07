from playwright.sync_api import sync_playwright
import json
URL = "http://127.0.0.1:8765/index.html"
errors = []

def ready(page):
    page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=20000)
    page.wait_for_function("!window.kittycat.ctl.isDealing", timeout=20000)
    page.wait_for_timeout(600)

def legal(page, kinds=None):
    return page.evaluate("""async () => { const E = await import('./js/engine.js');
      return E.legalMoves(kittycat.ctl.state).filter(m => m[0] === E.K.TAB && m[2] === E.K.TAB && E.apply); }""")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append((m.type, m.text)) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e))))
    page.goto(URL); ready(page)

    # find a tableau->tableau legal move to drag
    moves = legal(page)
    print("tableau moves available:", len(moves))
    m = moves[0] if moves else None
    if not m:
        # draw until one exists
        for _ in range(10):
            page.evaluate("async () => { const E = await import('./js/engine.js'); kittycat.ctl.perform(E.DRAW); }")
            moves = legal(page)
            if moves: m = moves[0]; break
    print("drag move:", m)
    src = page.locator(f'.pile[data-pile="t{m[1]}"] .card[data-count="{m[4]}"]')
    sb = src.bounding_box()
    dst = page.locator(f'.pile[data-pile="t{m[3]}"]').bounding_box()
    sx, sy = sb["x"] + sb["width"]/2, sb["y"] + 12
    tx, ty = dst["x"] + dst["width"]/2, dst["y"] + 60
    page.mouse.move(sx, sy); page.mouse.down()
    page.mouse.move(sx + 5, sy + 30, steps=3)
    page.mouse.move((sx+tx)/2, (sy+ty)/2, steps=5)
    page.mouse.move(tx, ty, steps=5)
    page.wait_for_timeout(450)
    st = page.evaluate("""({dragging: document.getElementById('board').classList.contains('dragging'),
      lens: [...document.querySelectorAll('.pile.lens')].map(p => p.dataset.pile),
      focus: [...document.querySelectorAll('.pile.focus')].map(p => p.dataset.pile),
      layer: document.getElementById('dragLayer') ? document.getElementById('dragLayer').children.length : 0,
      scaleSrc: getComputedStyle(document.querySelector('.pile.lens.tab')||document.body).transform })""")
    print("mid-drag:", st)
    page.screenshot(path="/tmp/shots/drag_zoom.png")
    page.mouse.up(); page.wait_for_timeout(300)
    after = page.evaluate("({moves: kittycat.ctl.state.moves, dragLayer: !!document.getElementById('dragLayer'), cls: document.getElementById('board').className})")
    print("after drop:", after)

    # drag with no legal target snaps back
    mv_before = page.evaluate("kittycat.ctl.state.moves")
    cards = page.locator('.pile.tab .card.up')
    c0 = cards.first.bounding_box()
    page.mouse.move(c0["x"]+10, c0["y"]+10); page.mouse.down(); page.mouse.move(c0["x"]+10, c0["y"]+300, steps=6)
    page.mouse.up(); page.wait_for_timeout(500)
    print("snap back: moves unchanged:", page.evaluate("kittycat.ctl.state.moves") == mv_before, "layer gone:", page.evaluate("!document.getElementById('dragLayer')"))

    # cancelled drag (pointercancel) must not leave anything stuck
    c0 = page.locator('.pile.tab .card.up').first.bounding_box()
    page.mouse.move(c0["x"]+10, c0["y"]+10); page.mouse.down(); page.mouse.move(c0["x"]+10, c0["y"]+120, steps=4)
    page.evaluate("""() => { const b = document.getElementById('board'); const id = 1;
        b.dispatchEvent(new PointerEvent('pointercancel', {pointerId: 1, bubbles: true})); }""")
    page.mouse.up(); page.wait_for_timeout(500)
    print("after cancel: dragLayer gone:", page.evaluate("!document.getElementById('dragLayer')"), "dragging class:", page.evaluate("document.getElementById('board').classList.contains('dragging')"))

    print("errors:", errors)
    b.close()
