import { createCampLayer, styleFor } from './campLayer.js';
import { loadManifest, loadCamp } from './camps.js';
import { reverseGeocode, searchPlaces } from './geocode.js';
import { LAYER_INFO, LAYER_ORDER } from './layers.js';
import { load, save } from './storage.js';

const isTouch = window.matchMedia('(pointer: coarse)').matches;
const mobileQuery = window.matchMedia('(max-width: 760px)');

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// --- URL state: ?camp=<id>#lat,lng,zoom (hash omitted = real site) ---
function readHash() {
  const m = location.hash.slice(1).match(/^(-?\d+\.?\d*),(-?\d+\.?\d*),?(\d+)?$/);
  return m ? { lat: parseFloat(m[1]), lng: parseFloat(m[2]), zoom: m[3] ? parseInt(m[3], 10) : null } : null;
}

function writeUrl(campId, pos, zoom) {
  const url = new URL(location.href);
  url.searchParams.set('camp', campId);
  url.searchParams.delete('q');
  url.hash = pos ? `${pos.lat.toFixed(5)},${pos.lng.toFixed(5)},${zoom}` : '';
  history.replaceState(null, '', url);
}

async function main() {
  const manifest = await loadManifest();
  const params = new URLSearchParams(location.search);
  const requested = params.get('camp') || load('camp', null);
  let entry = manifest.camps.find((c) => c.id === requested) || manifest.camps[0];

  // --- Map setup ---
  const map = L.map('map', { zoomControl: false, tapTolerance: 20 });
  if (!isTouch) L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ position: 'bottomright', imperial: false }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  let data = null;
  let camp = null;
  let atRealSite = true;
  const hidden = new Set(load('hiddenLayers', []));

  // --- DOM refs ---
  const locationLabel = $('locationLabel');
  const panel = $('panel');
  const grip = $('sheetGrip');

  // --- Location ---
  let labelRequest = 0;
  async function updateLocationLabel(lat, lng) {
    const req = ++labelRequest;
    locationLabel.textContent = 'Locating…';
    let text;
    try {
      text = `Shown over ${await reverseGeocode(lat, lng)}`;
    } catch {
      text = `Shown at ${lat.toFixed(3)}°, ${lng.toFixed(3)}°`;
    }
    if (req === labelRequest) locationLabel.textContent = text;
  }

  function showRealSiteLabel() {
    labelRequest += 1;
    locationLabel.textContent = `Actual location: ${entry.place}`;
  }

  function moveTo(lat, lng, { fly = false } = {}) {
    atRealSite = false;
    camp.moveAllTo(lat, lng);
    if (fly) map.flyTo(camp.getBounds().getCenter(), Math.max(map.getZoom(), 14), { duration: 1.1 });
    writeUrl(entry.id, { lat, lng }, map.getZoom());
    updateLocationLabel(lat, lng);
    hint.dismiss();
  }

  // Place the camp so that its centre (not its origin) lands on a point.
  function centreOn(lat, lng, opts) {
    const c = camp.getCurrent();
    const centre = camp.getBounds().getCenter();
    moveTo(lat + (c.lat - centre.lat), lng + (c.lng - centre.lng), opts);
  }

  function resetToSite({ fit = true } = {}) {
    atRealSite = true;
    camp.moveAllTo(data.origin[0], data.origin[1]);
    if (fit) map.flyToBounds(camp.getBounds(), { padding: fitPadding(), maxZoom: 16, duration: 1.1 });
    writeUrl(entry.id, null);
    showRealSiteLabel();
  }

  function fitPadding() {
    return mobileQuery.matches ? [40, 40] : [60, 60];
  }

  // --- Camp loading / switching ---
  async function showCamp(next, { keepPosition = false } = {}) {
    const keep = keepPosition && camp && !atRealSite ? camp.getBounds().getCenter() : null;
    entry = next;
    save('camp', entry.id);
    data = await loadCamp(entry);
    if (camp) camp.destroy();
    camp = createCampLayer(map, data, {
      onMoveEnd: (lat, lng) => {
        atRealSite = false;
        writeUrl(entry.id, { lat, lng }, map.getZoom());
        updateLocationLabel(lat, lng);
        hint.dismiss();
      },
    });
    renderCampInfo();
    renderLayers();
    if (keep) {
      centreOn(keep.lat, keep.lng);
    } else {
      atRealSite = true;
      writeUrl(entry.id, null);
      showRealSiteLabel();
    }
    document.title = `${entry.name} | Size of Pain`;
  }

  // --- Info panel content ---
  function renderCampInfo() {
    const s = data.stats;
    $('campBtnName').textContent = entry.short || entry.name;
    $('campTitle').textContent = entry.name;
    $('primaryStat').textContent = `${s.area_km2} km², about ${s.pitches.toLocaleString('en')} football pitches.`;
    $('statArea').textContent = `${s.area_km2} km²`;
    $('statPitches').textContent = s.pitches.toLocaleString('en');
    $('statPerimeter').textContent = `${s.perimeter_km} km`;
    $('statWalk').textContent = `${s.walk_min} min`;
    $('campVictims').textContent = entry.victims || '';
    $('campSummary').textContent = `${entry.years}. ${entry.summary}`;
    $('campBoundaryNote').textContent = entry.boundary_note || '';
    $('campBoundaryNote').hidden = !entry.boundary_note;
    $('campSources').innerHTML = (entry.sources || [])
      .map((src) => `<li><a href="${escapeHtml(src.url)}" target="_blank" rel="noopener">${escapeHtml(src.label)}</a></li>`)
      .join('');
  }

  function swatch(kind) {
    const st = styleFor(kind);
    const isLine = kind === 'railway' || kind === 'fence' || kind === 'sector' || kind === 'boundary';
    const fill = isLine ? 'none' : (st.fillColor || st.color);
    const dash = st.dashArray ? `stroke-dasharray="${st.dashArray}"` : '';
    return `<svg class="swatch" viewBox="0 0 24 16" aria-hidden="true"><rect x="2" y="2" width="20" height="12" rx="2" fill="${fill}" fill-opacity="${isLine ? 0 : st.fillOpacity}" stroke="${st.color}" stroke-width="${Math.max(st.weight, 1.5)}" ${dash}/></svg>`;
  }

  function renderLayers() {
    const counts = camp.getCounts();
    const kinds = LAYER_ORDER.filter((k) => counts[k]);
    const fs = $('layerControls');
    fs.innerHTML = '<legend class="sr-only">Map layers</legend>';
    kinds.forEach((k) => {
      const info = LAYER_INFO[k];
      const row = document.createElement('div');
      row.className = 'layer-row';
      const n = counts[k];
      row.innerHTML = `
        <label>
          <input type="checkbox" data-layer="${k}" ${hidden.has(k) ? '' : 'checked'}>
          ${swatch(k)}
          <span class="layer-name">${info.label}</span>
          <span class="layer-count">${k === 'boundary' ? '' : n}</span>
        </label>
        <button type="button" class="info-btn" data-learn="${k}" aria-label="Learn more about ${info.label}">i</button>`;
      fs.appendChild(row);
      camp.setLayerVisibility(k, !hidden.has(k));
    });
    fs.querySelectorAll('input[data-layer]').forEach((input) => {
      input.addEventListener('change', () => {
        const k = input.dataset.layer;
        if (input.checked) hidden.delete(k);
        else hidden.add(k);
        camp.setLayerVisibility(k, input.checked);
        save('hiddenLayers', [...hidden]);
      });
    });
    fs.querySelectorAll('[data-learn]').forEach((btn) => {
      btn.addEventListener('click', () => openLayerInfo(btn.dataset.learn));
    });
  }

  function openLayerInfo(kind) {
    const info = LAYER_INFO[kind];
    const specific = entry.layers && entry.layers[kind];
    const count = camp.getCounts()[kind] || 0;
    $('layerDialogTitle').innerHTML = `${swatch(kind)} ${escapeHtml(info.label)}`;
    let html = '';
    if (specific) {
      html += `<h3>At ${escapeHtml(entry.short || entry.name)}</h3><p>${escapeHtml(specific)}</p>`;
    }
    html += `<h3>${specific ? 'In general' : 'What this layer shows'}</h3><p>${escapeHtml(info.general)}</p>`;
    if (kind !== 'boundary') {
      html += `<p class="note">${count} mapped ${count === 1 ? 'feature' : 'features'} in this layer. Hover or tap a shape on the map to see its name, where one is recorded.</p>`;
    }
    $('layerDialogBody').innerHTML = html;
    openDialog($('layerDialog'));
  }

  // --- Camp picker ---
  function renderCampList() {
    const list = $('campList');
    list.innerHTML = '';
    manifest.camps.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'camp-option';
      btn.setAttribute('aria-current', String(c.id === entry.id));
      btn.innerHTML = `
        <span class="camp-option-name">${escapeHtml(c.name)}</span>
        <span class="camp-option-meta">${escapeHtml(c.place)} &middot; ${escapeHtml(c.years)}</span>
        <span class="camp-option-type">${escapeHtml(c.type)}</span>`;
      btn.addEventListener('click', async () => {
        closeDialog($('campDialog'));
        if (c.id === entry.id) return;
        await showCamp(c, { keepPosition: true });
        map.flyToBounds(camp.getBounds(), { padding: fitPadding(), maxZoom: 17, duration: 1.1 });
      });
      list.appendChild(btn);
    });
  }

  $('campBtn').addEventListener('click', () => {
    renderCampList();
    openDialog($('campDialog'));
  });

  // --- Dialogs ---
  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (typeof dlg.close === 'function') dlg.close();
    else dlg.removeAttribute('open');
  }
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(dlg)));
    // Click on the backdrop closes the dialog.
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(dlg); });
  });

  // --- Tabs ---
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  function selectTab(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (mobileQuery.matches && panel.dataset.state === 'peek') setSheet('half');
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', (e) => {
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      if (j !== null) { e.preventDefault(); tabs[j].focus(); selectTab(tabs[j]); }
    });
  });

  // --- Bottom sheet (phones) ---
  const SHEET_STATES = ['peek', 'half', 'full'];
  function setSheet(state) {
    panel.dataset.state = state;
    grip.setAttribute('aria-expanded', String(state !== 'peek'));
    save('sheet', state === 'full' ? 'half' : state);
  }
  setSheet(load('sheet', 'peek'));

  grip.addEventListener('click', () => {
    if (sheetDrag.moved) return;
    const i = SHEET_STATES.indexOf(panel.dataset.state);
    setSheet(i === 0 ? 'half' : 'peek');
  });

  // Swipe the grip or the panel header up/down to resize the sheet.
  const sheetDrag = { startY: 0, startH: 0, moved: false, active: false };
  function sheetHeights() {
    const vh = window.innerHeight;
    return { peek: panel.querySelector('.panel-head').offsetHeight + 28, half: vh * 0.5, full: vh * 0.88 };
  }
  function onSheetStart(e) {
    if (!mobileQuery.matches) return;
    sheetDrag.active = true;
    sheetDrag.moved = false;
    sheetDrag.startY = e.touches ? e.touches[0].clientY : e.clientY;
    sheetDrag.startH = panel.getBoundingClientRect().height;
    panel.classList.add('dragging');
  }
  function onSheetMove(e) {
    if (!sheetDrag.active) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const dy = sheetDrag.startY - y;
    if (Math.abs(dy) > 6) sheetDrag.moved = true;
    if (!sheetDrag.moved) return;
    if (e.cancelable) e.preventDefault();
    const h = sheetHeights();
    panel.style.height = `${Math.min(h.full, Math.max(h.peek, sheetDrag.startH + dy))}px`;
  }
  function onSheetEnd() {
    if (!sheetDrag.active) return;
    sheetDrag.active = false;
    panel.classList.remove('dragging');
    if (!sheetDrag.moved) return;
    const cur = panel.getBoundingClientRect().height;
    panel.style.height = '';
    const h = sheetHeights();
    const nearest = SHEET_STATES.reduce((a, b) => (Math.abs(h[b] - cur) < Math.abs(h[a] - cur) ? b : a));
    setSheet(nearest);
    setTimeout(() => { sheetDrag.moved = false; }, 50);
  }
  [grip, panel.querySelector('.panel-head')].forEach((el) => {
    el.addEventListener('touchstart', onSheetStart, { passive: true });
    el.addEventListener('mousedown', onSheetStart);
  });
  window.addEventListener('touchmove', onSheetMove, { passive: false });
  window.addEventListener('mousemove', onSheetMove);
  window.addEventListener('touchend', onSheetEnd);
  window.addEventListener('mouseup', onSheetEnd);
  panel.querySelector('.panel-head').addEventListener('click', () => {
    if (mobileQuery.matches && !sheetDrag.moved && panel.dataset.state === 'peek') setSheet('half');
  });

  // Let the floating buttons and scale bar sit just above the sheet.
  const root = document.documentElement;
  new ResizeObserver(() => {
    const h = mobileQuery.matches ? panel.getBoundingClientRect().height : 0;
    root.style.setProperty('--sheet-h', `${Math.round(h)}px`);
  }).observe(panel);

  // Keep panel scroll events from moving the map.
  L.DomEvent.disableClickPropagation(panel);
  L.DomEvent.disableScrollPropagation(panel);

  // --- Hint bubble ---
  const hint = (() => {
    const el = $('mapHint');
    const seen = load('hintSeen', false);
    el.innerHTML = isTouch
      ? 'Drag the <span class="hint-dot" aria-hidden="true"></span> handle to move the camp, long-press the map to place it there, or search for a town.'
      : 'Drag the outline or its <span class="hint-dot" aria-hidden="true"></span> handle, click the map to place the camp there, or search for a town.';
    el.hidden = seen;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'hint-close';
    close.setAttribute('aria-label', 'Dismiss hint');
    close.textContent = '×';
    close.addEventListener('click', () => dismiss());
    el.appendChild(close);
    function dismiss() {
      if (el.hidden) return;
      el.hidden = true;
      save('hintSeen', true);
    }
    return { dismiss };
  })();

  // --- Search ---
  const searchInput = $('searchInput');
  const searchResults = $('searchResults');
  const searchStatus = $('searchStatus');
  let searchTimer;
  let searchSeq = 0;

  function clearSearch() {
    searchResults.innerHTML = '';
    searchStatus.textContent = '';
  }

  $('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (!q) return;
    const results = await doSearch(q);
    // Enter on a single obvious result goes straight there.
    if (results && results.length === 1) pickResult(results[0]);
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length < 3) { clearSearch(); return; }
    searchTimer = setTimeout(() => doSearch(q), 450);
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = Array.from(searchResults.querySelectorAll('[role="option"]'));
    if (e.key === 'Escape') { clearSearch(); searchInput.blur(); return; }
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); items[0].focus(); }
  });
  searchResults.addEventListener('keydown', (e) => {
    const items = Array.from(searchResults.querySelectorAll('[role="option"]'));
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(idx + 1, items.length - 1)].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (idx <= 0) searchInput.focus(); else items[idx - 1].focus(); }
    else if (e.key === 'Escape') { clearSearch(); searchInput.focus(); }
  });

  document.addEventListener('click', (e) => {
    if (!$('searchForm').contains(e.target)) clearSearch();
  });

  function pickResult(r) {
    clearSearch();
    searchInput.value = r.label;
    searchInput.blur();
    centreOn(r.lat, r.lng);
    map.flyToBounds(camp.getBounds(), { padding: fitPadding(), maxZoom: 16, duration: 1.1 });
    if (mobileQuery.matches) setSheet('peek');
  }

  async function doSearch(query) {
    const seq = ++searchSeq;
    searchStatus.textContent = `Searching for ${query}…`;
    searchResults.innerHTML = '';
    try {
      const results = await searchPlaces(query, 5);
      if (seq !== searchSeq) return null;
      searchStatus.textContent = results.length ? '' : 'No results. Try a city, address or postcode.';
      results.forEach((r) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-result';
        btn.setAttribute('role', 'option');
        btn.innerHTML = `<span>${escapeHtml(r.label)}</span><small>${escapeHtml(r.name)}</small>`;
        btn.addEventListener('click', () => pickResult(r));
        searchResults.appendChild(btn);
      });
      return results;
    } catch {
      if (seq === searchSeq) searchStatus.textContent = 'Search failed. Please try again.';
      return null;
    }
  }

  // --- Map actions ---
  $('resetBtn').addEventListener('click', () => {
    searchInput.value = '';
    clearSearch();
    resetToSite();
  });

  $('placeHereBtn').addEventListener('click', () => {
    const c = map.getCenter();
    centreOn(c.lat, c.lng);
  });

  const locateBtn = $('locateBtn');
  if (!('geolocation' in navigator)) locateBtn.hidden = true;
  locateBtn.addEventListener('click', () => {
    locateBtn.disabled = true;
    locateBtn.classList.add('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locateBtn.disabled = false;
        locateBtn.classList.remove('busy');
        centreOn(pos.coords.latitude, pos.coords.longitude);
        map.flyToBounds(camp.getBounds(), { padding: fitPadding(), maxZoom: 16, duration: 1.1 });
      },
      () => {
        locateBtn.disabled = false;
        locateBtn.classList.remove('busy');
        locationLabel.textContent = 'Could not get your location. Try searching instead.';
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });

  // Desktop: click empty map to drop the camp there. Touch: long-press,
  // so that ordinary taps and pans never move the outline by accident.
  if (!isTouch) {
    map.on('click', (e) => centreOn(e.latlng.lat, e.latlng.lng));
  }
  map.on('contextmenu', (e) => {
    if (e.originalEvent) e.originalEvent.preventDefault();
    centreOn(e.latlng.lat, e.latlng.lng);
    if (navigator.vibrate) navigator.vibrate(15);
  });

  map.on('zoomend moveend', () => {
    if (!atRealSite) writeUrl(entry.id, camp.getCurrent(), map.getZoom());
  });

  // Keep the map sized correctly when the sheet or orientation changes.
  window.addEventListener('resize', () => map.invalidateSize());

  // --- Initial view ---
  const hash = readHash();
  await showCamp(entry);
  const q = params.get('q');
  if (hash) {
    camp.moveAllTo(hash.lat, hash.lng);
    atRealSite = false;
    map.setView(camp.getBounds().getCenter(), hash.zoom ?? 15);
    writeUrl(entry.id, hash, hash.zoom ?? 15);
    updateLocationLabel(hash.lat, hash.lng);
  } else {
    map.fitBounds(camp.getBounds(), { padding: fitPadding(), maxZoom: 16 });
    if (q) {
      // Arriving from the landing page search box.
      searchInput.value = q;
      const results = await doSearch(q);
      if (results && results.length) pickResult(results[0]);
    }
  }
}

main().catch((err) => {
  console.error(err);
  const status = document.getElementById('searchStatus');
  if (status) status.textContent = 'Failed to load map data. Please try again later.';
});
