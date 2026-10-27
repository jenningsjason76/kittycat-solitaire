"""Decks: choosing a deck changes the faces, the back, the table tokens and the theme colour; every deck file loads;
players updating from the one-deck version see the chooser once; new players do not."""
from playwright.sync_api import sync_playwright
import sys, json
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/index.html"
errors = []

def ready(page):
    page.wait_for_function("document.documentElement.dataset.ready === 'true'", timeout=30000)
    page.wait_for_function("!kittycat.ctl.isDealing", timeout=30000)
    page.wait_for_timeout(500)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append((m.type, m.text[:160])) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(("pageerror", str(e)[:160])))
    page.goto(URL); ready(page)
    print("1. new player: deck", page.evaluate("kittycat.settings.get('deck')"), "| chooser open:", page.evaluate("document.getElementById('dlg').open"), "(should be false)")

    face = "getComputedStyle(document.querySelector('.card.up')).backgroundImage"
    back = "getComputedStyle(document.querySelector('.card.down')).backgroundImage"
    table = "getComputedStyle(document.body).backgroundColor"
    for deck in ["room", "thorn", "ice", "classic"]:
        page.evaluate(f"kittycat.settings.set('deck', '{deck}')"); page.wait_for_timeout(150)
        f, bk = page.evaluate(face), page.evaluate(back)
        want = f"cards/{deck}/card_" if deck != "classic" else "cards/card_"
        print(f"2. {deck}: data-deck", page.evaluate("document.documentElement.dataset.deck"), "| face ok:", want in f, "| back ok:",
              (f"cards/{deck}/card_back_light.svg" in bk) if deck != "classic" else ("card_back_blue.webp" in bk),
              "| table", page.evaluate(table), "| theme-color", page.evaluate("document.querySelector('meta[name=theme-color]').content"))
        if deck != "classic":
            page.evaluate("kittycat.settings.set('appearance', 'dark')"); page.wait_for_timeout(100)
            print("   dark: back ok:", "card_back_dark.svg" in page.evaluate(back), "| table", page.evaluate(table), "| data-table/back:", page.evaluate("document.documentElement.dataset.table + '/' + document.documentElement.dataset.back"))
            page.evaluate("kittycat.settings.set('appearance', 'light')"); page.wait_for_timeout(100)

    # every file of every drawn deck loads
    missing = page.evaluate("""async () => { const D = await import('./js/decks.js'); const bad = [];
      for (const d of D.SVG_DECKS) for (const f of D.deckFiles(d)) { const r = await fetch(f); if (!r.ok || !(r.headers.get('content-type') || '').includes('svg')) bad.push(f + ':' + r.status); }
      return bad; }""")
    print("3. deck files that fail to load:", missing, "(should be [])")

    # the settings dialog: Deck row; Table and Card back rows only for Classic
    page.evaluate("kittycat.settings.set('deck', 'room')")
    page.locator("#menuBtn").click(); page.get_by_role("menuitem", name="Settings").click(); page.wait_for_timeout(300)
    labels = page.evaluate("[...document.querySelectorAll('dialog .row-item span')].map(s => s.textContent)")
    print("4. settings rows with a drawn deck: Deck present:", "Deck" in labels, "| Table hidden:", "Table" not in labels, "| Card back hidden:", "Card back" not in labels)
    page.locator("dialog .row-item", has_text="Deck").locator("button").click(); page.wait_for_timeout(300)
    print("   chooser title:", page.evaluate("document.getElementById('dlgTitle').textContent"), "| tiles:", page.evaluate("document.querySelectorAll('.deck-tile').length"),
          "| images loaded:", page.evaluate("[...document.querySelectorAll('.deck-tile img')].every(i => i.complete && i.naturalWidth > 0)"))
    page.locator(".deck-tile[data-deck=ice]").click(); page.wait_for_timeout(200)
    print("   tap a tile: deck", page.evaluate("kittycat.settings.get('deck')"), "| checked tile:", page.evaluate("document.querySelector('.deck-tile.on').dataset.deck"))
    page.get_by_role("button", name="Done").click(); page.wait_for_timeout(200)
    print("   Done returns to Settings:", page.evaluate("document.getElementById('dlgTitle').textContent"))
    page.keyboard.press("Escape")

    # a player updating from the one-deck version: saved settings without a deck key -> the chooser, once
    ctx2 = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx2.new_page()
    pg.on("pageerror", lambda e: errors.append(("pageerror2", str(e)[:160])))
    pg.goto(URL); ready(pg)
    pg.evaluate("localStorage.setItem('kittycat.settings.v1', JSON.stringify({drawMode: 1, tableStyle: 'paws'})); localStorage.removeItem('kittycat.deckPicked')")
    pg.reload(); ready(pg)
    print("5. updating player: chooser open:", pg.evaluate("document.getElementById('dlg').open"), "| title:", pg.evaluate("document.getElementById('dlgTitle').textContent"),
          "| intro shown:", pg.evaluate("document.querySelector('dialog .note').textContent.startsWith('New:')"))
    pg.locator(".deck-tile[data-deck=thorn]").click(); pg.wait_for_timeout(150)
    pg.get_by_role("button", name="Done").click(); pg.wait_for_timeout(150)
    pg.reload(); ready(pg)
    print("   after choosing: deck", pg.evaluate("kittycat.settings.get('deck')"), "| chooser open again:", pg.evaluate("document.getElementById('dlg').open"), "(should be false)")
    pg.screenshot(path="/tmp/shots/deck_thorn.png")
    print("errors:", errors)
    b.close()
