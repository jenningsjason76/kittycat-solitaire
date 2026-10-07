// Service worker: makes the game work offline. Bump VERSION when you publish changes.
const VERSION = 'v6';
const CORE = `kittycat-core-${VERSION}`;
const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];

const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/styles.css', 'css/paw-vars.css',
  'js/main.js', 'js/engine.js', 'js/solver.js', 'js/critic.js', 'js/worker.js', 'js/solver-client.js',
  'js/store.js', 'js/board.js', 'js/dialogs.js', 'js/settings.js', 'js/stats.js', 'js/storage.js',
  'js/audio.js', 'js/text.js', 'js/assets.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'sounds/manifest.json',
  ...SUITS.flatMap((s) => Array.from({ length: 13 }, (_, i) => `cards/card_${s}_${i + 1}.webp`)),
  ...['blue', 'red', 'purple', 'yellow'].map((c) => `cards/card_back_${c}.webp`),
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE);
    await cache.addAll(SHELL);
    // Sound and music files listed in the manifest are kept for offline play (best effort).
    try {
      const res = await fetch('sounds/manifest.json', { cache: 'no-cache' });
      const m = await res.json();
      const files = [...Object.values(m.effects || {}).flat(), ...(m.music || [])].map((f) => 'sounds/' + f);
      files.push('sounds/SoundCredits.txt');
      await Promise.all(files.map((f) => cache.add(f).catch(() => {})));
    } catch { /* no sounds yet */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CORE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => { if (event.data === 'skipWaiting') self.skipWaiting(); });

// Safari asks for audio in byte ranges, so answer those from the cached full file.
async function rangeResponse(request, response) {
  const header = request.headers.get('range');
  const buf = await response.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(header || '');
  if (!m) return response;
  const start = m[1] ? parseInt(m[1], 10) : 0;
  const end = m[2] ? Math.min(parseInt(m[2], 10), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206, statusText: 'Partial Content',
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'audio/mp4',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
    },
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CORE);

    // The sound manifest and credits: use the network when we can, so new sounds show up.
    if (url.pathname.endsWith('/sounds/manifest.json') || url.pathname.endsWith('/sounds/SoundCredits.txt')) {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return (await cache.match(req)) || new Response('{}', { status: 404 });
      }
    }

    // Pages: always fall back to the app shell, so the game opens offline.
    if (req.mode === 'navigate') {
      return (await cache.match('index.html')) || (await cache.match('./')) || fetch(req);
    }

    let hit = await cache.match(req, { ignoreSearch: true });
    if (!hit && req.headers.get('range')) hit = await cache.match(url.pathname.replace(/^.*\//, 'sounds/'));
    if (hit) return req.headers.get('range') ? rangeResponse(req, hit) : hit;

    try {
      // Fetch the whole file (not a byte range) so it can be cached.
      const full = await fetch(req.headers.get('range') ? new Request(req.url) : req);
      if (full.ok && url.pathname.includes('/sounds/')) cache.put(req.url, full.clone());
      return req.headers.get('range') && full.ok ? rangeResponse(req, full) : full;
    } catch {
      return new Response('Offline', { status: 503 });
    }
  })());
});
