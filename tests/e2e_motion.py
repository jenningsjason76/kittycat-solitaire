"""Card motion: cards glide, flip when revealed, deal at a new game, settle exactly, and respect Motion = Off."""
from playwright.sync_api import sync_playwright
import sys
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/index.html"
errors = []
CRAFT = """() => { const c = kittycat.ctl; const s = c.state; s.stock = [0]; s.waste = []; s.found = [0,0,0,0]; s.tab = [[],[],[],[],[],[],[]];
  s.tab[0] = [20, 31 | 64]; s.tab[1] = [45 | 64]; s.moves = 0; c.state = s; c.history = []; c.serials = []; c.moveTimes = []; c.feedbackLog = []; c.lastShown = {}; c.lastMove = null; c.emit(); }"""
MOVE = "async () => { const E = await import('./js/engine.js'); kittycat.ctl.perform([E.K.TAB, 0, E.K.TAB, 1, 1], { critique: false }); }"
cardAnims = "document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('card')).length"
clean = r"[...document.querySelectorAll('.board .card')].every(c => /^translateY\(-?[\d.]+px\)$|^translate\(-?[\d.]+px, 0px\)$/.test(c.style.transform))"
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True).new_page()
    page.on("console", lambda m: errors.append((m.type, m.text[:150])) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:150])))
    page.goto(URL); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000)
    page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000); page.wait_for_timeout(1800)
    print("motion default:", page.evaluate("kittycat.settings.get('motion')"))

    page.evaluate(CRAFT); page.wait_for_timeout(500)
    page.evaluate(MOVE); page.wait_for_timeout(30)
    n = page.evaluate(cardAnims)
    print("1. a move glides: card animations running right after the move:", n)
    page.wait_for_timeout(900)
    print("   settled: animations left", page.evaluate(cardAnims), "| card transforms clean:", page.evaluate(clean), "| pile z-index reset:", page.evaluate("[...document.querySelectorAll('.pile')].every(p => p.style.zIndex === '')"))

    page.evaluate(CRAFT); page.wait_for_timeout(300)
    page.evaluate("async () => { const E = await import('./js/engine.js'); kittycat.ctl.perform(E.DRAW, { critique: false }); }"); page.wait_for_timeout(30)
    print("2. draw from the stock glides: animations:", page.evaluate(cardAnims))
    page.wait_for_timeout(700)

    page.evaluate(CRAFT); page.wait_for_timeout(300)
    page.evaluate(MOVE); page.wait_for_timeout(40)
    flip = page.evaluate("document.getAnimations().some(a => a.effect.getKeyframes().some(k => String(k.transform).includes('rotateY')))")
    print("3. the revealed hidden card flips (rotateY keyframe present):", flip)
    page.wait_for_timeout(700)

    page.evaluate("kittycat.ctl.newGame()"); page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000); page.wait_for_timeout(60)
    deal = page.evaluate(cardAnims)
    print("4. new game deals with motion: animations running:", deal, "(about 28 expected)")
    page.touchscreen.tap(200, 500); page.wait_for_timeout(120)
    print("   a tap lets the cards arrive at once: animations left:", page.evaluate(cardAnims))

    page.evaluate("kittycat.settings.set('motion', 'off')")
    page.evaluate(CRAFT); page.wait_for_timeout(300); page.evaluate(MOVE); page.wait_for_timeout(30)
    print("5. Motion = Off: animations:", page.evaluate(cardAnims), "(should be 0)")
    page.evaluate("kittycat.settings.set('motion', 'lively')")
    page.evaluate(CRAFT); page.wait_for_timeout(300); page.evaluate(MOVE); page.wait_for_timeout(30)
    print("   Motion = Lively: animations:", page.evaluate(cardAnims))
    page.wait_for_timeout(900)

    ctx2 = b.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce"); pg2 = ctx2.new_page()
    pg2.goto(URL); pg2.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000); pg2.wait_for_function("!kittycat.ctl.isDealing", timeout=30000); pg2.wait_for_timeout(300)
    pg2.evaluate(CRAFT); pg2.wait_for_timeout(300); pg2.evaluate(MOVE); pg2.wait_for_timeout(30)
    print("6. Reduce Motion on: animations:", pg2.evaluate(cardAnims), "(should be 0)")
    print("errors:", errors)
    b.close()
