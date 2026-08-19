import { createCampLayer } from './campLayer.js';
import { reverseGeocode, searchPlaces, getUserPosition } from './geocode.js';
import { load, save } from './storage.js';

const DATA_URL = new URL('../data/birkenau.geojson', import.meta.url);

const ALL_LAYERS = ['boundary', 'barracks', 'watchtower', 'crematoria', 'railway', 'other'];
const ORIGIN_LABEL = 'the actual site, O\u015bwi\u0119cim, Poland';

async function main() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
  const data = await res.json();

  // --- Map setup ---
  const map = L.map('map', { zoomControl: false }).setView([data.origin[0], data.origin[1]], 15);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  const camp = createCampLayer(map, data);

  // --- State ---
  let currentLat = data.origin[0];
  let currentLng = data.origin[1];
  let isActualSite = true;
  let searching = false;

  // --- DOM refs ---
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const searchStatus = document.getElementById('searchStatus');
  const resetBtn = document.getElementById('resetBtn');
  const locationLabel = document.getElementById('locationLabel');
  const primaryStat = document.getElementById('primaryStat');
  const detailsBtn = document.getElementById('detailsBtn');
  const infoDetails = document.getElementById('infoDetails');

  // --- URL hash ---
  function readHash() {
    const m = location.hash.slice(1).match(/^(-?\d+\.?\d*),(-?\d+\.?\d*),?(\d+)?$/);
    return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]), zoom: m[3] ? parseInt(m[3], 10) : null } : null;
  }

  function writeHash() {
    history.replaceState(null, '', `#${currentLat.toFixed(5)},${currentLng.toFixed(5)},${map.getZoom()}`);
  }

  // --- Location update ---
  async function updateLocationLabel(lat, lng) {
    locationLabel.textContent = 'Locating\u2026';
    try {
      const label = await reverseGeocode(lat, lng);
      locationLabel.textContent = `Shown here: ${label}`;
    } catch {
      locationLabel.textContent = `Shown here: ${lat.toFixed(3)}\u00b0, ${lng.toFixed(3)}\u00b0`;
    }
  }

  function moveTo(lat, lng, actualSite = false) {
    currentLat = lat;
    currentLng = lng;
    isActualSite = actualSite;
    camp.moveAllTo(lat, lng);
    writeHash();
    updateLocationLabel(lat, lng);
  }

  // --- Search ---
  let searchTimer;

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    await doSearch(q);
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (!q) { searchResults.innerHTML = ''; searchStatus.textContent = ''; return; }
    searchTimer = setTimeout(() => doSearch(q), 300);
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = Array.from(searchResults.querySelectorAll('[role="option"]'));
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[Math.min(idx + 1, items.length - 1)] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx <= 0 ? searchInput.focus() : items[idx - 1].focus(); }
    else if (e.key === 'Escape') { searchResults.innerHTML = ''; searchInput.blur(); }
  });

  async function doSearch(query) {
    if (searching) return;
    searching = true;
    searchStatus.textContent = `Finding ${query}\u2026`;
    searchResults.innerHTML = '';
    try {
      const results = await searchPlaces(query, 5);
      searchStatus.textContent = '';
      if (!results.length) {
        searchStatus.textContent = 'No results found. Try a city, address, or postcode.';
        return;
      }
      results.forEach((r) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-result';
        btn.role = 'option';
        btn.textContent = r.label;
        btn.addEventListener('click', () => {
          moveTo(r.lat, r.lng);
          map.flyTo([r.lat, r.lng], 15, { duration: 1.1 });
          searchResults.innerHTML = '';
          searchInput.value = r.label;
        });
        searchResults.appendChild(btn);
      });
    } catch {
      searchStatus.textContent = 'Search failed. Please try again.';
    } finally {
      searching = false;
    }
  }

  // --- Reset ---
  resetBtn.addEventListener('click', () => {
    moveTo(data.origin[0], data.origin[1], true);
    map.flyTo([data.origin[0], data.origin[1]], 15, { duration: 1.1 });
    locationLabel.textContent = `Shown here: ${ORIGIN_LABEL}`;
    searchInput.value = '';
    searchResults.innerHTML = '';
  });

  // --- Drag interaction ---
  let dragging = false;
  let dragMoved = false;

  function startDrag(e) {
    L.DomEvent.stop(e);
    dragging = true;
    dragMoved = false;
    map.dragging.disable();
    map.getContainer().classList.add('grabbing');
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    map.dragging.enable();
    map.getContainer().classList.remove('grabbing');
    const c = camp.getCurrent();
    moveTo(c.lat, c.lng);
  }

  function moveDrag(e) {
    if (!dragging) return;
    const ev = e.originalEvent;
    if (ev && ev.touches && ev.touches[0]) ev.preventDefault();
    const pt = e.latlng || (ev && ev.touches && ev.touches[0] ? map.mouseEventToLatLng(ev.touches[0]) : null);
    if (!pt) return;
    dragMoved = true;
    camp.moveAllTo(pt.lat, pt.lng);
  }

  camp.onEachLayer((poly) => { poly.on('mousedown', startDrag); poly.on('touchstart', startDrag); });
  camp.handle.on('mousedown', startDrag);
  camp.handle.on('touchstart', startDrag);

  map.on('mousemove', moveDrag);
  map.on('touchmove', moveDrag);
  map.on('mouseup', endDrag);
  map.on('touchend', endDrag);
  map.on('touchcancel', endDrag);

  map.on('click', (e) => {
    if (dragging || dragMoved) { dragMoved = false; return; }
    moveTo(e.latlng.lat, e.latlng.lng);
  });

  // --- Details expand/collapse ---
  detailsBtn.addEventListener('click', () => {
    const open = infoDetails.hidden;
    infoDetails.hidden = !open;
    detailsBtn.setAttribute('aria-expanded', String(open));
    detailsBtn.textContent = open ? 'Hide details' : 'Show details';
  });

  // --- Layer toggles ---
  const layerInputs = {};
  document.querySelectorAll('#layerControls input[data-layer]').forEach((input) => {
    layerInputs[input.dataset.layer] = input;
  });

  // Restore saved layer prefs
  const saved = load('layers', null);
  if (saved) {
    ALL_LAYERS.forEach((k) => { if (k in saved) { layerInputs[k].checked = saved[k]; camp.setLayerVisibility(k, saved[k]); } });
    layerInputs.all.checked = ALL_LAYERS.every((k) => layerInputs[k].checked);
  }

  // Individual layer toggle
  ALL_LAYERS.forEach((k) => {
    layerInputs[k].addEventListener('change', () => {
      camp.setLayerVisibility(k, layerInputs[k].checked);
      layerInputs.all.checked = ALL_LAYERS.every((l) => layerInputs[l].checked);
      saveLayers();
    });
  });

  // All toggle
  layerInputs.all.addEventListener('change', () => {
    const v = layerInputs.all.checked;
    ALL_LAYERS.forEach((k) => { layerInputs[k].checked = v; camp.setLayerVisibility(k, v); });
    saveLayers();
  });

  function saveLayers() {
    const prefs = {};
    ALL_LAYERS.forEach((k) => { prefs[k] = layerInputs[k].checked; });
    save('layers', prefs);
  }

  // --- Stat card population ---
  if (data.stats) {
    const s = data.stats;
    document.getElementById('statArea').textContent = `The documented site footprint covers approximately ${s.area_km2} km\u00b2.`;
    document.getElementById('statPitches').textContent = `That is roughly the area of ${s.pitches} football pitches.`;
    document.getElementById('statWalk').textContent = `Walking the perimeter would take about ${s.walk_min} minutes at a typical pace.`;
    primaryStat.textContent = `The documented footprint covers approximately ${s.area_km2} km\u00b2.`;
  }

  // --- Initial view ---
  const hash = readHash();
  if (hash) {
    camp.moveAllTo(hash.lat, hash.lng);
    map.setView([hash.lat, hash.lng], hash.zoom ?? 15);
    currentLat = hash.lat;
    currentLng = hash.lng;
    isActualSite = false;
    updateLocationLabel(hash.lat, hash.lng);
  } else {
    map.fitBounds(camp.boundary.poly.getBounds(), { padding: [60, 60], maxZoom: 17 });
  }
}

main().catch((err) => {
  console.error(err);
  const status = document.getElementById('searchStatus');
  if (status) status.textContent = 'Failed to load map data. Please try again later.';
});
