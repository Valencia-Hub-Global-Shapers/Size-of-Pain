// camps.js - loads the list of available camps (data/camps.json) and each
// camp's true-size dataset, caching both for the life of the page.

const MANIFEST_URL = new URL('../data/camps.json', import.meta.url);
const cache = new Map();
let manifest = null;

export async function loadManifest() {
  if (!manifest) {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`Failed to load camp list: ${res.status}`);
    manifest = await res.json();
  }
  return manifest;
}

export async function loadCamp(entry) {
  if (!cache.has(entry.id)) {
    const promise = fetch(new URL(`../${entry.data}`, import.meta.url)).then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${entry.id}: ${res.status}`);
      return res.json();
    });
    cache.set(entry.id, promise);
    promise.catch(() => cache.delete(entry.id));
  }
  return cache.get(entry.id);
}
