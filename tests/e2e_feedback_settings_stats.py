from playwright.sync_api import sync_playwright
import json
URL = "http://127.0.0.1:8765/index.html"
errors = []

def ready(page):
    page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=20000)
    page.wait_for_function("!window.kittycat.ctl.isDealing", timeout=20000)
    page.wait_for_timeout(700)

CRAFT = """async () => {
  const E = await import('./js/engine.js');
  const c = kittycat.ctl;
  const s = E.newGame(1, 1, 'standard');
  s.stock = [0]; s.waste = []; s.found = [0,0,0,0]; s.tab = [[],[],[],[],[],[],[]];
  s.tab[0] = [20, 31 | 64]; s.tab[1] = [45 | 64];
  c.state = s; c.history = []; c.serials = []; c.feedbackLog = []; c.winnability = 'unknown'; c.winningLine = []; c.emit();
  return true; }"""

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append((m.type, m.text)) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e))))
    page.goto(URL); ready(page)

    # ---- feedback note ----
    page.evaluate(CRAFT)
    page.locator(".pile.stock .card").first.tap(); page.wait_for_timeout(400)
    print("banner visible:", page.evaluate("!document.getElementById('banner').hidden"), "|", page.evaluate("document.getElementById('banner').innerText.replace(/\\n/g,' / ')"))
    print("undo enabled (flagged-only):", page.evaluate("!document.getElementById('undoBtn').disabled"))
    page.get_by_role("button", name="Show me").click(); page.wait_for_timeout(300)
    print("highlight classes:", page.evaluate("[document.querySelectorAll('.card.hl').length, document.querySelectorAll('.hl-dst').length]"),
          "| text:", page.evaluate("document.getElementById('banner').innerText.replace(/\\n/g,' / ')"))
    page.screenshot(path="/tmp/shots/feedback.png")
    page.get_by_role("button", name="Undo").first.click(); page.wait_for_timeout(300)
    print("after undo: moves", page.evaluate("kittycat.ctl.state.moves"), "stock", page.evaluate("kittycat.ctl.state.stock.length"), "banner hidden", page.evaluate("document.getElementById('banner').hidden"))
    # undo is not allowed for an unflagged move
    page.evaluate("""async () => { const E = await import('./js/engine.js'); kittycat.ctl.perform([3,0,3,1,1]); }""")
    page.wait_for_timeout(200)
    print("undo allowed right after a good move (6 s grace):", not page.evaluate("document.getElementById('undoBtn').disabled"))
    page.wait_for_timeout(6600)
    print("undo disabled for a good move once the grace period is over:", page.evaluate("document.getElementById('undoBtn').disabled"))

    # ---- settings dialog ----
    page.locator("#menuBtn").click(); page.get_by_role("menuitem", name="Settings").click(); page.wait_for_timeout(300)
    page.screenshot(path="/tmp/shots/settings.png")
    page.locator("dialog label.row-item", has_text="Mode").locator("select").select_option("dark")
    page.wait_for_timeout(100)
    print("scheme after choosing dark:", page.evaluate("document.documentElement.dataset.scheme"))
    labels = page.evaluate("[...document.querySelectorAll('dialog .row-item span')].map(s => s.textContent)")
    print("settings rows:", labels)
    # switch everything the user can change, then reload and verify persistence
    page.evaluate("kittycat.settings.set('tableStyle','paws'); kittycat.settings.set('cardBack','paws'); kittycat.settings.set('cardSize','medium'); kittycat.settings.set('feedbackTone','gentle')")
    page.wait_for_timeout(300)
    page.screenshot(path="/tmp/shots/paws_dark.png")
    # all sounds off disables the two sub-switches
    page.evaluate("kittycat.settings.set('soundsOn', false)")
    page.keyboard.press("Escape")
    page.reload(); ready(page)
    print("persisted settings:", page.evaluate("({s: kittycat.settings.all().appearance, t: kittycat.settings.all().tableStyle, tone: kittycat.settings.all().feedbackTone, sounds: kittycat.settings.all().soundsOn, data: document.documentElement.dataset.scheme + '/' + document.documentElement.dataset.table + '/' + document.documentElement.dataset.back})"))

    # ---- stats + summary ----
    page.evaluate("""async () => { const s = kittycat.stats; const now = Date.now();
      for (let i = 0; i < 14; i++) await s.add({date: now - (13 - i) * 86400000 * (i < 9 ? 1 : 0) - i*1000, drawMode: i % 3 ? 1 : 3, scoring: 'standard', won: i % 3 !== 0, moves: 60 + i, score: 200 + i*7, lazyMoves: [5,6,4,5,3,4,3,2,3,2,1,2,1,0][i], costMoves: 0, undone: 1, feedbackWasOn: true}); }""")
    page.locator("#menuBtn").click(); page.get_by_role("menuitem", name="Stats and history").click(); page.wait_for_timeout(400)
    page.screenshot(path="/tmp/shots/stats.png")
    print("stats:", page.evaluate("({games: kittycat.stats.gamesPlayed, wins: kittycat.stats.wins, dayStreak: kittycat.stats.currentDayStreak, bestDay: kittycat.stats.bestDayStreak, winStreak: kittycat.stats.currentWinStreak, best: kittycat.stats.bestWinStreak, recent: kittycat.stats.recentLazyAverage})"))
    page.keyboard.press("Escape")

    # ---- autosave / restore ----
    page.evaluate("""async () => { const E = await import('./js/engine.js'); const c = kittycat.ctl;
        const m = E.legalMoves(c.state).find(m => m[0] === E.K.TAB && m[2] === E.K.TAB) || E.DRAW; c.perform(m); }""")
    mv = page.evaluate("kittycat.ctl.state.moves"); seed = page.evaluate("kittycat.ctl.state.seed")
    page.wait_for_timeout(900)
    page.reload(); ready(page)
    print("restored game: seed same:", page.evaluate("kittycat.ctl.state.seed") == seed, "| moves", mv, "->", page.evaluate("kittycat.ctl.state.moves"))

    print("errors:", errors)
    b.close()
