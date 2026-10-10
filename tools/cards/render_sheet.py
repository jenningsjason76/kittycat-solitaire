from playwright.sync_api import sync_playwright
import time
SCALE = 2.5
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 5110, 'height': 2883}, device_scale_factor=SCALE)
    t = time.time()
    pg.goto('file://' + __import__('os').path.abspath('deck_t.svg') + '')
    pg.wait_for_timeout(2500)
    pg.screenshot(path='sheet.png', omit_background=True)
    print('rendered', round(time.time() - t, 1), 's', flush=True)
    b.close()
