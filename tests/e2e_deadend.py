"""Change 2: when a whole pass through the stock changes nothing, ask the solver. The prompt appears ONLY
if the solver proves no win exists. 'Keep playing' is respected, and a winnable position is never interrupted."""
from playwright.sync_api import sync_playwright
import json, sys
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/index.html"
DEAD = json.loads(r'''{"seed":39535,"draw":1,"scoring":"standard","stock":[18,43,29],"waste":[],"found":[3,0,2,0],"tab":[[102],[115,88,113,99,111,84,70,95,68,80,105,78],[74],[89,114,100,112,98,110,83,69,81,67,92,104],[76],[22,15,11,87,73,85,71,96,108,94,106],[37,39,33,45,13,72]],"score":0,"moves":600,"recycles":2}''')                      # a real stuck position (seed 5 bot game), proven lost by the solver
errors = []
LOAD = """(state) => { const c = kittycat.ctl; c.state = state; c.history = []; c.serials = []; c.feedbackLog = []; c.lastShown = {};
  c.deadEnd = null; c.deadEndAck = null; c.lastRecycleBoard = null; c.winnability = 'unknown'; c.winningLine = []; c.isDealing = false; c.emit(); }"""
DRAWS = """async (n) => { const E = await import('./js/engine.js'); for (let i = 0; i < n; i++) kittycat.ctl.perform(E.DRAW, { critique: false }); }"""
overlay = "(() => { const o = document.getElementById('overlay'); return o.hidden ? null : o.innerText.replace(/\\n+/g, ' / '); })()"
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True).new_page()
    page.on("console", lambda m: errors.append((m.type, m.text[:150])) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:150])))
    page.goto(URL); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000)
    page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000); page.wait_for_timeout(400)

    # 1. a lost position: one pass then the second recycle with no change -> solver -> prompt
    page.evaluate(LOAD, DEAD)
    page.evaluate(DRAWS, 5); page.wait_for_timeout(600)
    print("1. after the first recycle only        ->", page.evaluate(overlay), "(should be None)")
    page.evaluate(DRAWS, 30); page.wait_for_function("document.getElementById('overlay').hidden === false", timeout=20000)
    print("   after a second full pass            ->", page.evaluate(overlay))
    print("   buttons:", page.evaluate("[...document.querySelectorAll('#overlay button')].map(b => b.textContent)"))
    page.screenshot(path="/tmp/shots/deadend.png")

    # 2. Keep playing: the prompt closes and does not come back for the same board
    page.get_by_role("button", name="Keep playing").click(); page.wait_for_timeout(300)
    page.evaluate(DRAWS, 80); page.wait_for_timeout(1500)
    print("2. after Keep playing and 80 more draws ->", page.evaluate(overlay), "(should be None)")

    # 3. a winnable position is never interrupted, however many times the stock is turned over
    page.evaluate("kittycat.ctl.newGame()"); page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000)
    print("3. fresh deal winnable:", page.evaluate("kittycat.ctl.winnability"))
    page.evaluate(DRAWS, 120); page.wait_for_timeout(2500)
    print("   after 120 draws on a winnable deal  ->", page.evaluate(overlay), "(should be None)")

    # 4. New Game from the prompt
    page.evaluate(LOAD, DEAD); page.evaluate(DRAWS, 35); page.wait_for_function("document.getElementById('overlay').hidden === false", timeout=20000)
    page.get_by_role("button", name="New game").click()
    try:
        page.wait_for_function("!kittycat.ctl.isDealing && document.getElementById('overlay').hidden", timeout=30000)
    except Exception:
        print("STATE AT TIMEOUT:", page.evaluate("({dealing: kittycat.ctl.isDealing, dead: !!kittycat.ctl.deadEnd, stuck: kittycat.ctl.isStuck, moves: kittycat.ctl.state.moves, overlayHidden: document.getElementById('overlay').hidden, overlay: document.getElementById('overlay').innerText.slice(0, 120)})"))
        raise
    print("4. New Game from the prompt: moves", page.evaluate("kittycat.ctl.state.moves"), "| records:", page.evaluate("kittycat.stats.records.slice(-1)[0] && kittycat.stats.records.slice(-1)[0].won"), "(False = counted as not won)")

    # 5. a position the solver cannot decide stays silent
    page.evaluate("kittycat.ctl.solver.solve = async () => ({ result: 'unknown', line: null, nodes: 0 })")
    page.evaluate(LOAD, DEAD); page.evaluate(DRAWS, 60); page.wait_for_timeout(1500)
    print("5. solver undecided                     ->", page.evaluate(overlay), "(should be None)")
    print("errors:", errors)
    b.close()
