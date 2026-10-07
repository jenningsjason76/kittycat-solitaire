from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:8766/kittycat-solitaire/"
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.on("console", lambda m: errors.append((m.type, m.text)) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e))))
    page.on("response", lambda r: errors.append(("http", r.status, r.url)) if r.status >= 400 else None)
    page.goto(URL)
    page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=20000)
    page.wait_for_function("navigator.serviceWorker.ready.then(r => !!r.active)", timeout=20000)
    page.reload(); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=20000)
    print("scope:", page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.scope)"))
    ctx.set_offline(True)
    page.reload(); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=20000)
    print("offline in subfolder: cards", page.evaluate("document.querySelectorAll('.card').length"))
    print("errors:", errors)
    b.close()
