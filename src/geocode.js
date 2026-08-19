// geocode.js — thin wrapper around Nominatim (OpenStreetMap's free
// geocoder) for the search box and the "where did I drop this" label.
// No API key needed; keep usage light (one request per user action).

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

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
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('reverse geocode failed');
  const data = await res.json();
  return describeAddress(data.address, data.display_name);
}

/** @returns {Promise<{lat:number, lng:number, label:string}|null>} */
export async function searchPlace(query) {
  const url = `${NOMINATIM_BASE}/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('search failed');
  const results = await res.json();
  if (!results.length) return null;
  return {
    lat: parseFloat(results[0].lat),
    lng: parseFloat(results[0].lon),
    label: shortName(results[0].display_name),
  };
}
