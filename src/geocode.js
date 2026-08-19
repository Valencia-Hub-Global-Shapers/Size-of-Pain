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

/** @returns {Promise<Array<{lat:number, lng:number, label:string, name:string}>>} */
export async function searchPlaces(query, limit = 5) {
  const url = `${NOMINATIM_BASE}/search?format=json&limit=${limit}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error('search failed');
  const data = await res.json();
  return data.map((item) => ({
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    label: shortName(item.display_name),
    name: item.display_name,
  }));
}

/** Request the user's location with explicit opt-in. */
export function getUserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
}
