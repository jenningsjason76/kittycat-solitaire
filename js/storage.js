// Local-first storage: everything lives on this device in IndexedDB.
// Records carry ids and timestamps so a future sync (v2) can merge them.

const DB_NAME = 'kittycat';
const STORE = 'kv';
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function kvGet(key) {
  try { return await tx('readonly', (s) => s.get(key)); } catch { return undefined; }
}
export async function kvSet(key, value) {
  try { await tx('readwrite', (s) => s.put(value, key)); return true; } catch { return false; }
}
export async function kvDel(key) {
  try { await tx('readwrite', (s) => s.delete(key)); return true; } catch { return false; }
}

/** Ask the browser not to clear our data when storage runs low. Best effort. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return false;
}

export async function deviceId() {
  let id = await kvGet('deviceId');
  if (!id) { id = crypto.randomUUID(); await kvSet('deviceId', id); }
  return id;
}
