"""The cat: where it appears in each mode, how its state follows the game, and the coach's paw cue."""
from playwright.sync_api import sync_playwright
import json, re, sys
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/index.html"
import os
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'e2e_deadend.py')).read()
DEAD = json.loads(re.search(r"r'''(.*?)'''", src, re.S).group(1))
errors = []
LOAD = """(state) => { const c = kittycat.ctl; c.state = state; c.history = []; c.serials = []; c.moveTimes = []; c.feedbackLog = []; c.lastShown = {};
  c.deadEnd = null; c.deadEndAck = null; c.lastRecycleBoard = null; c.winnability = 'unknown'; c.winningLine = []; c.isDealing = false; c.activeEntryId = null; c.emit(); }"""
CRAFT = """() => { const c = kittycat.ctl; const s = c.state; s.stock = [0]; s.waste = []; s.found = [0,0,0,0]; s.tab = [[],[],[],[],[],[],[]];
  s.tab[0] = [20, 31 | 64]; s.tab[1] = [45 | 64]; s.moves = 0; c.state = s; c.history = []; c.serials = []; c.moveTimes = []; c.feedbackLog = []; c.lastShown = {}; c.activeEntryId = null; c.emit(); }"""
count = "[document.querySelectorAll('.cat-perch .cat').length, document.querySelectorAll('#overlay .cat').length]"
state = "[...document.querySelectorAll('.cat')].map(c => c.dataset.state)"
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True).new_page()
    page.on("console", lambda m: errors.append((m.type, m.text[:150])) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:150])))
    page.goto(URL); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000)
    page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000); page.wait_for_timeout(400)
    WON = """() => { const c = kittycat.ctl; const s = c.state; s.found = [13,13,13,13]; s.stock = []; s.waste = []; s.tab = [[],[],[],[],[],[],[]]; c.emit(); }"""
    page.evaluate("kittycat.settings.set('victory','off')")      # no victory sequence in this test, just the end card
    for mode, table in [("off", "calm"), ("companion", "calm"), ("themeOnly", "calm"), ("themeOnly", "paws"), ("endScreens", "calm")]:
        page.evaluate(f"kittycat.settings.set('catMode','{mode}'); kittycat.settings.set('tableStyle','{table}')"); page.wait_for_timeout(300)
        page.evaluate(CRAFT); page.wait_for_timeout(200)
        playing = page.evaluate(count)
        page.evaluate(WON); page.wait_for_timeout(400)
        won = page.evaluate(count), page.evaluate(state)
        print(f"{mode:10s} table={table:5s} playing [perch, overlay] = {playing} | won = {won[0]} states {won[1]}")
    print("default catMode:", page.evaluate("kittycat.settings.get('catMode')"))
    page.evaluate("kittycat.settings.set('catMode','companion'); kittycat.settings.set('tableStyle','calm')"); page.wait_for_timeout(300)

    page.evaluate(CRAFT); page.wait_for_timeout(300)
    print("idle:", page.evaluate(state))
    page.evaluate("async () => { const E = await import('./js/engine.js'); kittycat.ctl.perform(E.DRAW); }"); page.wait_for_timeout(400)
    print("lazy note -> flick attribute:", page.evaluate("document.querySelector('.cat-perch .cat').hasAttribute('data-flick')"),
          "| cue badges (should be 0):", page.evaluate("document.querySelectorAll('.card.cue').length"), "| banner:", page.evaluate("!document.getElementById('banner').hidden"))
    page.get_by_role("button", name="Show me").click(); page.wait_for_timeout(300)
    print("after Show me: [cue, highlighted source, target marker] =", page.evaluate("[document.querySelectorAll('.card.cue').length, document.querySelectorAll('.card.hl').length, document.querySelectorAll('.hl-dst').length]"))

    page.evaluate(CRAFT); page.wait_for_timeout(200)
    src_box = page.locator('.pile[data-pile="t0"] .card.up').bounding_box()
    page.mouse.move(src_box["x"] + 20, src_box["y"] + 10); page.mouse.down(); page.mouse.move(src_box["x"] + 30, src_box["y"] + 40, steps=4); page.wait_for_timeout(300)
    print("while dragging:", page.evaluate(state)); page.mouse.up(); page.wait_for_timeout(500)
    print("after the drop:", page.evaluate(state))
    page.evaluate(LOAD, DEAD)
    page.evaluate("async () => { const E = await import('./js/engine.js'); for (let i = 0; i < 35; i++) kittycat.ctl.perform(E.DRAW, { critique: false }); }")
    page.wait_for_function("!document.getElementById('overlay').hidden", timeout=20000); page.wait_for_timeout(400)
    print("dead end:", page.evaluate(state), "| overlay cat:", page.evaluate(count))
    print("errors:", errors)
    b.close()
