"""Victory sequences (4 styles), skip, random without repeats, Off / Reduce Motion, and the win and defeat cards."""
from playwright.sync_api import sync_playwright
import json, re, sys, time
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/index.html"
import os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'e2e_deadend.py')).read()
DEAD = json.loads(re.search(r"r'''(.*?)'''", src, re.S).group(1))
errors = []
WIN = """() => { const c = kittycat.ctl; const s = c.state; s.found = [13,13,13,13]; s.stock = []; s.waste = []; s.tab = [[],[],[],[],[],[],[]]; s.moves = 212; s.score = 884; c.history = []; c.serials = []; c.feedbackLog = []; c.emit(); }"""
LOAD = """(state) => { const c = kittycat.ctl; c.state = state; c.history = []; c.serials = []; c.moveTimes = []; c.feedbackLog = []; c.lastShown = {};
  c.deadEnd = null; c.deadEndAck = null; c.lastRecycleBoard = null; c.winnability = 'unknown'; c.winningLine = []; c.isDealing = false; c.activeEntryId = null; c.emit(); }"""
OVERLAY = "(() => { const o = document.getElementById('overlay'); return o.hidden ? null : o.innerText.replace(/\\n+/g, ' / '); })()"
def fresh(browser, **kw):
    page = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, **kw).new_page()
    page.on("console", lambda m: errors.append((m.type, m.text[:150])) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:150])))
    page.goto(URL); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000)
    page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000); page.wait_for_timeout(1500)
    return page
with sync_playwright() as p:
    b = p.chromium.launch()
    page = fresh(b)
    for style in ["fan", "cascade", "cat", "riffle"]:
        page.evaluate(f"kittycat.settings.set('victory', '{style}')")
        page.evaluate("newGameStub = 0") if False else None
        page.evaluate(WIN); t0 = time.time()
        page.wait_for_function("!!document.getElementById('victory')", timeout=3000)
        page.wait_for_timeout(1300); page.screenshot(path=f"/tmp/shots/victory_{style}_a.png")
        page.wait_for_timeout(1100); page.screenshot(path=f"/tmp/shots/victory_{style}_b.png")
        page.wait_for_function("!document.getElementById('victory') && !document.getElementById('overlay').hidden", timeout=9000)
        took = time.time() - t0
        print(f"{style:8s} ran {took:.1f}s | style flag {page.evaluate('window.__victoryStyle')} | layer gone: {page.evaluate('!document.getElementById(\"victory\")')} | board restored: {page.evaluate('!document.querySelector(\".board\").classList.contains(\"victory\")')} | card: {page.evaluate(OVERLAY)[:60]}")
        page.evaluate("kittycat.ctl.state.found = [0,0,0,0]; kittycat.ctl.emit()"); page.wait_for_timeout(300)
    # skip with a tap
    page.evaluate("kittycat.settings.set('victory', 'fan')"); page.evaluate(WIN); page.wait_for_function("!!document.getElementById('victory')", timeout=3000); page.wait_for_timeout(500)
    t0 = time.time(); page.mouse.click(200, 400); page.wait_for_function("!document.getElementById('victory') && !document.getElementById('overlay').hidden", timeout=3000)
    print(f"skip     a tap ended the show in {time.time() - t0:.2f}s")
    page.evaluate("kittycat.ctl.state.found = [0,0,0,0]; kittycat.ctl.emit()"); page.wait_for_timeout(300)
    # win card content
    print("win card buttons:", page.evaluate("[]") or "", end=""); page.evaluate("kittycat.settings.set('victory', 'off')"); page.evaluate(WIN); page.wait_for_timeout(500)
    print(page.evaluate("[...document.querySelectorAll('#overlay button')].map(b => b.textContent)"), "| streak trail paws:", page.evaluate("document.querySelectorAll('#overlay .trail .icon').length"), "| headline font:", page.evaluate("getComputedStyle(document.querySelector('#overlay h2')).fontFamily.slice(0, 40)"))
    # random never repeats back to back
    seq = page.evaluate("""async () => { const V = await import('./js/victory.js'); kittycat.settings.set('victory', 'random'); const out = []; for (let i = 0; i < 40; i++) out.push(V.pickStyle()); return out; }""")
    print("random picks:", "".join(x[0] for x in seq), "| any repeat:", any(a == b2 for a, b2 in zip(seq, seq[1:])), "| styles used:", sorted(set(seq)))
    # defeat card, turning point, go back, replay
    page.evaluate("kittycat.settings.set('victory', 'off')")
    page.evaluate(LOAD, DEAD); page.evaluate("async () => { const E = await import('./js/engine.js'); kittycat.ctl.perform(E.DRAW, { critique: false }); }")
    page.evaluate("() => { const c = kittycat.ctl; c.feedbackLog.push({ id: 99, serial: c.serials[c.serials.length - 1], moveNumber: c.state.moves, kind: 'costGame', costGame: true, undone: false, betterText: null }); c.deadEnd = { key: 'x' }; c.emit(); }")
    page.wait_for_timeout(500)
    print("defeat card:", page.evaluate(OVERLAY)[:150])
    print("   buttons:", page.evaluate("[...document.querySelectorAll('#overlay button')].map(b => b.textContent)"), "| ring arc present:", page.evaluate("document.querySelectorAll('#overlay .ring circle').length == 2"))
    mv = page.evaluate("kittycat.ctl.state.moves"); page.get_by_role("button", name="Go back to it").click(); page.wait_for_timeout(400)
    print("   Go back to it: moves", mv, "->", page.evaluate("kittycat.ctl.state.moves"), "| overlay gone:", page.evaluate(OVERLAY) is None)
    page.evaluate("() => { kittycat.ctl.deadEnd = { key: 'y' }; kittycat.ctl.emit(); }"); page.wait_for_timeout(300)
    seed = page.evaluate("kittycat.ctl.state.seed"); page.get_by_role("button", name="Try this deal again").click(); page.wait_for_function("!kittycat.ctl.isDealing", timeout=20000); page.wait_for_timeout(400)
    print("   Try this deal again: same seed", seed == page.evaluate("kittycat.ctl.state.seed"), "| moves", page.evaluate("kittycat.ctl.state.moves"), "| overlay gone:", page.evaluate(OVERLAY) is None)
    # Reduce Motion: straight to the card
    pg2 = fresh(b, reduced_motion="reduce")
    pg2.evaluate("kittycat.settings.set('victory', 'fan')"); pg2.evaluate(WIN); pg2.wait_for_timeout(400)
    print("Reduce Motion: victory layer:", pg2.evaluate("!!document.getElementById('victory')"), "| card shown at once:", pg2.evaluate(OVERLAY) is not None)
    print("errors:", errors)
    b.close()
