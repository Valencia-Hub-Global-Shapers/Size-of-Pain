const K = 'size-of-pain:';

export function load(key, fallback) {
  try { const v = localStorage.getItem(K + key); return v == null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}

export function save(key, value) {
  try { localStorage.setItem(K + key, JSON.stringify(value)); } catch {}
}
