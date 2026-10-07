from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:8765/index.html"
errors = []
def ready(page):
    page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=20000)
    page.wait_for_function("!window.kittycat.ctl.isDealing", timeout=20000)
    page.wait_for_timeout(700)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append((m.type, m.text)) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e))))
    page.goto(URL); ready(page)

    # ---- service worker + installability ----
    page.wait_for_function("navigator.serviceWorker.ready.then(r => !!r.active)", timeout=20000)
    page.reload(); ready(page)
    print("controlled by service worker:", page.evaluate("!!navigator.serviceWorker.controller"))
    man = page.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
    print("manifest:", {k: man[k] for k in ('name', 'short_name', 'start_url', 'display')}, "icons", [ (i['sizes'], i.get('purpose')) for i in man['icons']])
    cached = page.evaluate("caches.keys().then(async ks => { const c = await caches.open(ks[0]); return {name: ks[0], n: (await c.keys()).length}; })")
    print("precached:", cached)

    # ---- fully offline: reload and play ----
    ctx.set_offline(True)
    page.reload(); ready(page)
    imgs = page.evaluate("""Promise.all([...document.querySelectorAll('.card.up')].map(c => new Promise(res => { const u = c.style.backgroundImage.slice(5,-2); const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = u; })))""")
    print("OFFLINE: page loaded, cards:", page.evaluate("document.querySelectorAll('.card').length"), "| face images load:", all(imgs), len(imgs))
    page.locator(".pile.stock .card").first.tap(); page.wait_for_timeout(300)
    print("OFFLINE: can play (draw ->)", page.evaluate("kittycat.ctl.state.moves"), "moves; new winnable deal works offline:", end=" ")
    page.evaluate("kittycat.ctl.newGame()"); ready(page)
    print(page.evaluate("kittycat.ctl.winnability"), "| worker used:", page.evaluate("!!kittycat.ctl.solver.worker"))
    ctx.set_offline(False)

    # ---- layouts ----
    for name, vp in [("ipad_portrait", (820, 1180)), ("ipad_landscape", (1180, 820)), ("phone_landscape", (844, 390))]:
        pg = b.new_context(viewport={"width": vp[0], "height": vp[1]}, device_scale_factor=1.5, has_touch=True).new_page()
        pg.goto(URL); ready(pg)
        # deal a few cards so columns have some depth
        pg.evaluate("""async () => { const E = await import('./js/engine.js'); for (let i = 0; i < 6; i++) { const m = E.legalMoves(kittycat.ctl.state).find(m => m[0] !== E.K.STOCK) || E.DRAW; kittycat.ctl.perform(m, {critique: false}); } }""")
        pg.wait_for_timeout(400)
        print(name, "overflow:", pg.evaluate("[document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight]"),
              "layout:", pg.evaluate("(() => { const cs = getComputedStyle(document.getElementById('board')); return [cs.getPropertyValue('--cw'), cs.getPropertyValue('--ch')].map(v => Math.round(parseFloat(v))) })()"))
        pg.screenshot(path=f"/tmp/shots/{name}.png")
    print("errors:", errors)
    b.close()
