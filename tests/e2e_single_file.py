from playwright.sync_api import sync_playwright
URL = "file:///mnt/user-data/outputs/kittycat-pwa/dist/KittyCat-Solitaire.html"
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append((m.type, m.text[:200])) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:200])))
    page.on("requestfailed", lambda r: errors.append(("reqfailed", r.url[:100])))
    page.goto(URL)
    page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000)
    page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000)
    page.wait_for_timeout(600)
    print("loaded from file://; protocol:", page.evaluate("location.protocol"))
    print("deal:", page.evaluate("({win: kittycat.ctl.winnability, stock: kittycat.ctl.state.stock.length, note: kittycat.ctl.dealNote, worker: !!kittycat.ctl.solver.worker})"))
    imgs = page.evaluate("""Promise.all([...document.querySelectorAll('.card.up')].map(c => new Promise(res => { const m = c.style.backgroundImage.match(/url\\("(.*)"\\)/); const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = m[1]; })))""")
    print("card faces decode:", all(imgs), len(imgs), "| card-back shows:", page.evaluate("getComputedStyle(document.querySelector('.card.down')).backgroundImage.startsWith('url(\"data:image/webp')"))
    page.screenshot(path="/tmp/shots/single.png")

    page.evaluate("kittycat.settings.set('tapToMove', true)")   # this test checks tap-to-move, which is off by default
    # play: tap stock, tap-to-move, drag
    page.locator(".pile.stock .card").first.tap(); page.wait_for_timeout(300)
    print("stock tap -> moves:", page.evaluate("kittycat.ctl.state.moves"))
    res = page.evaluate("""async () => { const E = window.kittycat.ctl.state; return null; }""")
    mv = page.evaluate("""(() => { const s = kittycat.ctl.state; for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) { if (i === j) continue;
        const a = s.tab[i][s.tab[i].length-1], b = s.tab[j][s.tab[j].length-1]; if (a === undefined || b === undefined) continue; }
        return null; })()""")
    # use the controller's own legal moves via the exposed engine through a button-free path: find a card with a legal tap
    moved = False
    for _ in range(40):
        cards = page.locator(".pile.tab .card.up").all()
        before = page.evaluate("kittycat.ctl.state.moves")
        for c in cards:
            c.tap(); page.wait_for_timeout(120)
            if page.evaluate("kittycat.ctl.state.moves") > before: moved = True; break
        if moved: break
        page.locator(".pile.stock .card").first.tap(); page.wait_for_timeout(120)
    print("tap-to-move worked:", moved, "| moves", page.evaluate("kittycat.ctl.state.moves"))

    # feedback + settings + dark mode
    page.evaluate("kittycat.settings.set('appearance','dark'); kittycat.settings.set('tableStyle','paws'); kittycat.settings.set('cardBack','paws')")
    page.wait_for_timeout(300)
    page.screenshot(path="/tmp/shots/single_paws.png")
    page.locator("#menuBtn").click(); page.get_by_role("menuitem", name="Settings").click(); page.wait_for_timeout(300)
    page.get_by_role("button", name="Sound credits").click(); page.wait_for_timeout(400)
    print("credits:", page.evaluate("document.querySelector('pre.credits').textContent.split('\\n')[0]"))
    page.keyboard.press("Escape")

    # sounds decode from the embedded data
    page.locator(".pile.stock .card").first.tap()
    page.wait_for_function("kittycat.fx.ready && Object.keys(kittycat.fx.buffers).length === 4", timeout=30000)
    page.wait_for_timeout(1500)
    print("embedded sounds decoded:", page.evaluate("Object.fromEntries(Object.entries(kittycat.fx.buffers).map(([k,v]) => [k, v.length]))"))
    page.evaluate("kittycat.settings.set('musicOn', true)"); page.wait_for_timeout(2500)
    print("embedded music plays:", page.evaluate("!!kittycat.fx.musicEl && !kittycat.fx.musicEl.paused"))

    # storage on file://
    page.evaluate("kittycat.ctl.save()"); page.wait_for_timeout(500)
    saved = page.evaluate("new Promise(r => { const q = indexedDB.open('kittycat'); q.onsuccess = () => { try { const g = q.result.transaction('kv').objectStore('kv').get('currentGame'); g.onsuccess = () => r(!!g.result); g.onerror = () => r('error'); } catch (e) { r('no store: ' + e.name); } }; q.onerror = () => r('cannot open'); })")
    print("autosave in IndexedDB on file://:", saved, "| settings in localStorage:", page.evaluate("!!localStorage.getItem('kittycat.settings.v1')"))
    page.reload(); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000); page.wait_for_timeout(800)
    print("after reload: appearance kept:", page.evaluate("kittycat.settings.get('appearance')"), "| game restored, moves:", page.evaluate("kittycat.ctl.state.moves"))
    print("errors:", errors)
    b.close()
