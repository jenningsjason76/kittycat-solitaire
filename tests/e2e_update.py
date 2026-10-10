"""Updates: the app asks for a new version whenever it is reopened, and Settings > About shows the version."""
from playwright.sync_api import sync_playwright
import sys
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/index.html"
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_context(viewport={"width": 390, "height": 844}).new_page()
    page.on("console", lambda m: errors.append((m.type, m.text[:150])) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:150])))
    page.goto(URL); page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000)
    page.wait_for_function("navigator.serviceWorker.ready.then(r => !!r.active)", timeout=20000); page.wait_for_timeout(500)
    page.evaluate("window.__updates = 0; const orig = ServiceWorkerRegistration.prototype.update; ServiceWorkerRegistration.prototype.update = function () { window.__updates++; return orig.call(this); }; 0")
    page.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));")
    print("going to the background asks for nothing:", page.evaluate("window.__updates") == 0)
    page.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'));")
    print("coming back asks for a new version:", page.evaluate("window.__updates") == 1)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    print("reconnecting asks for a new version:", page.evaluate("window.__updates") == 2)
    page.click("#menuBtn"); page.get_by_role("menuitem", name="Settings").click(); page.wait_for_timeout(700)
    print("Settings > About:", page.evaluate("[...document.querySelectorAll('dialog p.note')].map(p => p.textContent).find(t => t.startsWith('Version'))"))
    print("errors:", errors)
    b.close()
