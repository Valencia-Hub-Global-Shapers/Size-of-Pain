// main.js — entry point. Loads the data, builds the map, wires up
// dragging, search, and reset. Leaflet (`L`) is loaded globally via the
// CDN <script> tag in index.html, not imported as a module.

import { createCampLayer } from './campLayer.js';
import { reverseGeocode, searchPlace } from './geocode.js';

const DATA_URL = new URL('../data/birkenau.geojson', import.meta.url);

async function main() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`failed to load ${DATA_URL}: ${res.status}`);
  const data = await res.json();

  const map = L.map('map', { zoomControl: false }).setView(
    [data.origin[0], data.origin[1]],
    15
  );
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  const camp = createCampLayer(map, data);
  map.fitBounds(camp.boundary.poly.getBounds(), { padding: [60, 60], maxZoom: 17 });

  // --- drag interaction: grabbing any part of the camp moves the whole thing ---
  let dragging = false;

  function startDrag(e) {
    L.DomEvent.stop(e);
    dragging = true;
    map.dragging.disable();
    map.getContainer().classList.add('grabbing');
  }

  camp.onEachLayer((poly) => poly.on('mousedown', startDrag));

  const locationLabel = document.getElementById('locationLabel');

  async function updateLocationLabel(lat, lng) {
    locationLabel.textContent = 'Locating\u2026';
    try {
      const label = await reverseGeocode(lat, lng);
      locationLabel.textContent = `Shown here: ${label}`;
    } catch {
      locationLabel.textContent = `Shown here: ${lat.toFixed(3)}\u00b0, ${lng.toFixed(3)}\u00b0`;
    }
  }

  map.on('mousemove', (e) => {
    if (!dragging) return;
    camp.moveAllTo(e.latlng.lat, e.latlng.lng);
  });

  map.on('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    map.dragging.enable();
    map.getContainer().classList.remove('grabbing');
    const { lat, lng } = camp.getCurrent();
    updateLocationLabel(lat, lng);
  });

  map.on('click', (e) => {
    if (dragging) return;
    camp.moveAllTo(e.latlng.lat, e.latlng.lng);
    updateLocationLabel(e.latlng.lat, e.latlng.lng);
  });

  // --- search ---
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    locationLabel.textContent = 'Searching\u2026';
    try {
      const result = await searchPlace(q);
      if (!result) {
        locationLabel.textContent = `No results for \u201c${q}\u201d \u2014 try another place.`;
        return;
      }
      camp.moveAllTo(result.lat, result.lng);
      map.flyTo([result.lat, result.lng], 15, { duration: 1.1 });
      locationLabel.textContent = `Shown here: ${result.label}`;
    } catch {
      locationLabel.textContent = 'Search failed \u2014 try again.';
    }
  });

  // --- reset ---
  document.getElementById('resetBtn').addEventListener('click', () => {
    camp.moveAllTo(camp.origin.lat, camp.origin.lng);
    map.flyTo([camp.origin.lat, camp.origin.lng], 15, { duration: 1.1 });
    locationLabel.textContent = 'Shown here: the actual site, O\u015bwi\u0119cim, Poland';
  });
}

main().catch((err) => {
  console.error(err);
  const label = document.getElementById('locationLabel');
  if (label) label.textContent = 'Failed to load map data — see console.';
});
