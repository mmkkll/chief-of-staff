// API client — thin wrapper over fetch
const cache = new Map();

export async function api(path, { ttlMs = 0, signal } = {}) {
  const now = Date.now();
  if (ttlMs > 0) {
    const entry = cache.get(path);
    if (entry && now - entry.ts < ttlMs) return entry.data;
  }
  const r = await fetch(path, { signal, headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  const data = await r.json();
  cache.set(path, { ts: now, data });
  return data;
}

export function invalidate(path) { cache.delete(path); }
