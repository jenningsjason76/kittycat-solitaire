#!/usr/bin/env python3
"""Builds ONE self-contained HTML file with every script, style, image and sound embedded.
    python3 tools/build_single.py            ->  dist/KittyCat-Solitaire.html
It runs by double-clicking it on a computer. It has no service worker, so it is not an installable
offline web app (host the folder for that, see README.md)."""
import base64, glob, json, mimetypes, os, re, shutil, sys
HOSTED = "--hosted" in sys.argv   # flat folder for GitHub Pages: index.html + 4 small files

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
def read(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()
def b64(p): return base64.b64encode(open(os.path.join(ROOT, p), "rb").read()).decode()

MIME = {".webp": "image/webp", ".png": "image/png", ".wav": "audio/wav", ".mp3": "audio/mpeg",
        ".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml"}
def data_uri(p): return f"data:{MIME[os.path.splitext(p)[1]]};base64,{b64(p)}"

# ---------- scripts: wrap each module so names cannot collide ----------
ORDER = ["engine", "solver", "critic", "assets", "storage", "settings", "stats", "text", "audio",
         "solver-client", "store", "board", "dialogs", "main"]
IMPORT = re.compile(r"import\s*\{([^}]*)\}\s*from\s*'\./([\w-]+)\.js';", re.S)
EXPORT = re.compile(r"^export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)", re.M)

def wrap(name, code):
    exports = EXPORT.findall(code)
    code = IMPORT.sub(lambda m: f"const {{{m.group(1)}}} = __m[\"{m.group(2)}\"];", code)
    code = re.sub(r"^export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\b)", "", code, flags=re.M)
    assert "import " not in re.sub(r"//.*|`[^`]*`|'[^']*'", "", code).replace("import(", "").replace("import.meta", ""), name
    return f"__m[\"{name}\"] = (() => {{\n{code}\nreturn {{ {', '.join(exports)} }};\n}})();\n"

modules = {n: wrap(n, read(f"js/{n}.js")) for n in ORDER}

# the solver runs in a worker built from a text blob in the single-file version
worker_body = IMPORT.sub("const { solve, findWinnableDeal } = __m[\"solver\"];", read("js/worker.js"))
worker_src = "const __m = {};\n" + modules["engine"] + modules["solver"] + worker_body

app = "const __m = {};\n" + "".join(modules[n] for n in ORDER)
app += "window.__solver = __m[\"solver\"];\n"      # used when workers are unavailable

# ---------- assets ----------
assets = {}
for p in sorted(glob.glob(os.path.join(ROOT, "cards", "*.webp"))) + sorted(glob.glob(os.path.join(ROOT, "sounds", "*"))):
    rel = os.path.relpath(p, ROOT)
    if rel.endswith((".mp3", ".wav", ".webp", ".json", ".txt")) and not rel.endswith("README.txt"):
        assets[rel] = data_uri(rel)

# ---------- css ----------
css = read("css/styles.css").replace('@import url("paw-vars.css");', read("css/paw-vars.css"))
css = re.sub(r'url\("\.\./(cards/[\w.]+)"\)', lambda m: f'url("{assets[m.group(1)]}")', css)

# ---------- html ----------
html = read("index.html")
if not HOSTED:
    html = html.replace('<link rel="manifest" href="manifest.webmanifest">\n', "")
html = html.replace('href="icons/icon.svg"', f'href="{data_uri("icons/icon.svg")}"')
if HOSTED:
    html = html.replace('href="icons/apple-touch-icon.png"', 'href="apple-touch-icon.png"')
else:
    html = html.replace('href="icons/apple-touch-icon.png"', f'href="{data_uri("icons/apple-touch-icon.png")}"')
html = html.replace('<link rel="stylesheet" href="css/styles.css">', f"<style>\n{css}\n</style>")
def js_string(s): return json.dumps(s).replace("</", "<\\/")
scripts = (f"<script>window.__ASSETS__ = {json.dumps(assets)};\nwindow.__WORKER_SRC__ = {js_string(worker_src)};</script>\n"
           f"<script type=\"module\">\n{app.replace('</script', '<\\/script')}\n</script>")
html = html.replace('<script type="module" src="js/main.js"></script>', scripts)
assert "src=\"js/" not in html and "href=\"css/" not in html

if not HOSTED:
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    out = os.path.join(ROOT, "dist", "KittyCat-Solitaire.html")
    open(out, "w", encoding="utf-8").write(html)
    print(f"wrote {out}  ({os.path.getsize(out) / 1e6:.1f} MB, {len(assets)} embedded files)")
else:
    d = os.path.join(ROOT, "dist-hosted")
    shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(html)
    man = json.loads(read("manifest.webmanifest"))
    for icon in man["icons"]: icon["src"] = os.path.basename(icon["src"])
    json.dump(man, open(os.path.join(d, "manifest.webmanifest"), "w"), indent=2)
    for name in ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]:
        shutil.copy(os.path.join(ROOT, "icons", name), os.path.join(d, name))
    open(os.path.join(d, ".nojekyll"), "w").close()
    open(os.path.join(d, "sw.js"), "w").write('''// Keeps the game available offline. Raise VERSION when you replace index.html.
const VERSION = "v2";
const CORE = `kittycat-flat-${VERSION}`;
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CORE).then((c) => c.addAll(SHELL))); });
self.addEventListener("activate", (e) => { e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CORE) await caches.delete(k);
  await self.clients.claim();
})()); });
self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CORE);
    if (r.mode === "navigate") return (await cache.match("index.html")) || fetch(r);
    return (await cache.match(r, { ignoreSearch: true })) || fetch(r);
  })());
});
''')
    n = sum(len(f) for _, _, f in os.walk(d))
    print(f"wrote {d}  ({n} files; index.html {os.path.getsize(os.path.join(d, 'index.html')) / 1e6:.1f} MB)")
