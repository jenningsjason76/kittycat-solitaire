// Keeps the game available offline. Raise VERSION when you replace index.html.
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
