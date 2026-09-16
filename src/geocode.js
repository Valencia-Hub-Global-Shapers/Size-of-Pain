// geocode.js — thin wrapper around Nominatim (OpenStreetMap's free
// geocoder) for the search box and the "where did I drop this" label.
// No API key needed; keep usage light (one request per user action).
//
// Nominatim's usage policy asks for a User-Agent or Referer identifying the
// application. Browsers do not allow scripts to override User-Agent, so the
// identifying signal is the Referer sent automatically by the browser. For
// production, host the site under a real domain so that Referer is meaningful.

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

const NOMINATIM_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'en',
};

export function shortName(displayName) {
  return displayName.split(',').slice(0, 2).join(',').trim();
}

function describeAddress(address, fallbackDisplayName) {
  const a = address || {};
  const place = a.city || a.town || a.village || a.municipality || a.county;
  if (place && a.country) return `${place}, ${a.country}`;
  if (fallbackDisplayName) return shortName(fallbackDisplayName);
  return 'a custom location';
}

/** @returns {Promise<string>} a short human-readable place description */
export async function reverseGeocode(lat, lng) {
  const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error('reverse geocode failed');
  const data = await res.json();
  return describeAddress(data.address, data.display_name);
}

/** @returns {Promise<{lat:number, lng:number, label:string}|null>} */
export async function searchPlace(query) {
  const results = await searchPlaces(query, 1);
  if (!results.length) return null;
  return results[0];
}

const SEARCH_CACHE = new Map();
const SEARCH_CACHE_LIMIT = 100;

/** @returns {Promise<Array<{lat:number, lng:number, label:string, name:string}>>} */
export async function searchPlaces(query, limit = 5) {
  const cacheKey = `${limit}:${query.toLowerCase()}`;
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached) return cached;

  const url = `${NOMINATIM_BASE}/search?format=json&limit=${limit}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error('search failed');
  const data = await res.json();
  const results = data.map((item) => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    label: shortName(item.display_name),
    name: item.display_name,
  }));

  // Cap cache size, discarding the oldest entry first (Map preserves insertion order).
  if (SEARCH_CACHE.size >= SEARCH_CACHE_LIMIT) {
    SEARCH_CACHE.delete(SEARCH_CACHE.keys().next().value);
  }
  SEARCH_CACHE.set(cacheKey, results);
  return results;
}
