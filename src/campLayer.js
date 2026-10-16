// campLayer.js - turns a camp dataset (data/<camp>.geojson) into Leaflet
// layers and keeps them all moving together as one rigid shape.

import { buildRing, metersToLatLng } from './geo.js';

// Layer draw order (later = on top). Boundary and sectors sit under
// detailed structures; watchtowers sit on top because they are small.
const DRAW_ORDER = {
  railway: 0,
  boundary: 1,
  sector: 2,
  fence: 3,
  barracks: 4,
  other: 5,
  memorial: 6,
  crematoria: 7,
  watchtower: 8,
};

export function styleFor(kind) {
  switch (kind) {
    case 'boundary':
      return { color: '#c65a35', weight: 2.5, opacity: 0.95, dashArray: '8 5', fill: true, fillColor: '#c65a35', fillOpacity: 0.06 };
    case 'sector':
      return { color: '#c65a35', weight: 1, opacity: 0.5, dashArray: '2 5', fill: false };
    case 'fence':
      return { color: '#5c3a24', weight: 1.4, opacity: 0.8, dashArray: '4 3', fill: false };
    case 'railway':
      return { color: '#5c3a24', weight: 2.5, opacity: 0.85, lineCap: 'butt', dashArray: '1 6' };
    case 'watchtower':
      return { color: '#5c3a24', weight: 0.6, opacity: 0.9, fillColor: '#5c3a24', fillOpacity: 0.9 };
    case 'crematoria':
      return { color: '#6e2a17', weight: 1.4, opacity: 0.95, fillColor: '#8a3d24', fillOpacity: 0.75 };
    case 'barracks':
      return { color: '#8a3d24', weight: 0.6, opacity: 0.85, fillColor: '#c65a35', fillOpacity: 0.55 };
    case 'memorial':
      return { color: '#4a4a6a', weight: 1, opacity: 0.85, fillColor: '#6a6a8f', fillOpacity: 0.45 };
    default: // 'other'
      return { color: '#8a3d24', weight: 0.5, opacity: 0.7, fillColor: '#c65a35', fillOpacity: 0.35 };
  }
}

function createLayerFor(feat, lat, lng) {
  const latlngs = buildRing(feat.pts, lat, lng);
  // Shapes don't bubble clicks to the map, so clicking the outline never
  // counts as "place the camp here".
  const style = { ...styleFor(feat.k), bubblingMouseEvents: false };
  if (feat.t === 'line') return L.polyline(latlngs, style);
  return L.polygon(latlngs, style);
}

/** Geometric centroid of a ring of [east, north] meter points. */
function polygonCentroid(points) {
  let cx = 0;
  let cy = 0;
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % n];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  if (area === 0) return [0, 0];
  return [cx / (6 * area), cy / (6 * area)];
}

/**
 * @param {L.Map} map
 * @param {object} data   parsed camp dataset
 * @param {object} [opts]
 * @param {(lat:number, lng:number) => void} [opts.onMoveEnd]  called after a drag ends
 */
export function createCampLayer(map, data, opts = {}) {
  const origin = { lat: data.origin[0], lng: data.origin[1] };
  let current = { lat: origin.lat, lng: origin.lng };
  const group = L.layerGroup().addTo(map);
  const hidden = new Set();

  const features = [...data.features].sort(
    (a, b) => (DRAW_ORDER[a.k] ?? 5) - (DRAW_ORDER[b.k] ?? 5)
  );

  const layers = features.map((feat) => {
    const poly = createLayerFor(feat, current.lat, current.lng);
    if (feat.n) poly.bindTooltip(feat.n, { sticky: true, direction: 'top', opacity: 0.92 });
    poly.addTo(group);
    return { feat, poly };
  });

  const boundaries = layers.filter((l) => l.feat.k === 'boundary');
  if (!boundaries.length) {
    throw new Error('createCampLayer: no feature with k === "boundary" in data');
  }
  // The largest boundary ring anchors the drag handle and the initial view.
  const boundary = boundaries.reduce((a, b) => (b.feat.pts.length > a.feat.pts.length ? b : a));

  // Drag handle: a real draggable marker, which Leaflet handles well on
  // touch screens, with a large hit area so it is easy to grab with a thumb.
  const [handleEast, handleNorth] = polygonCentroid(boundary.feat.pts);
  const handle = L.marker(metersToLatLng(current.lat, current.lng, handleEast, handleNorth), {
    draggable: true,
    keyboard: true,
    title: 'Drag to move the camp outline',
    alt: 'Drag handle',
    zIndexOffset: 1000,
    icon: L.divIcon({
      className: 'camp-handle',
      html: '<span class="camp-handle-dot" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2l3 3h-2v4h4V7l3 3-3 3v-2h-4v4h2l-3 3-3-3h2v-4H7v2l-3-3 3-3v2h4V5H9z"/></svg></span>',
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    }),
  }).addTo(map);

  function moveAllTo(lat, lng, { moveHandle = true } = {}) {
    current = { lat, lng };
    for (const l of layers) l.poly.setLatLngs(buildRing(l.feat.pts, lat, lng));
    if (moveHandle) handle.setLatLng(metersToLatLng(lat, lng, handleEast, handleNorth));
  }

  // Convert a handle position back to the origin it implies.
  function originFromHandle(latlng) {
    // Iterate twice: the east offset depends on the origin latitude.
    let lat = latlng.lat - handleNorth / 111320;
    let lng = latlng.lng;
    for (let i = 0; i < 2; i += 1) {
      const [hLat, hLng] = metersToLatLng(lat, lng, handleEast, handleNorth);
      lat += latlng.lat - hLat;
      lng += latlng.lng - hLng;
    }
    return { lat, lng };
  }

  handle.on('dragstart', () => map.getContainer().classList.add('grabbing'));
  handle.on('drag', (e) => {
    const o = originFromHandle(e.target.getLatLng());
    moveAllTo(o.lat, o.lng, { moveHandle: false });
  });
  handle.on('dragend', () => {
    map.getContainer().classList.remove('grabbing');
    if (opts.onMoveEnd) opts.onMoveEnd(current.lat, current.lng);
  });

  // Desktop: the outline itself can be grabbed with the mouse. On touch
  // screens the shapes are left alone so one-finger panning still works.
  let grab = null;
  function onShapeDown(e) {
    if (e.originalEvent && e.originalEvent.button !== 0) return;
    L.DomEvent.stop(e);
    grab = { start: e.latlng, origin: { ...current }, moved: false };
    map.dragging.disable();
    map.getContainer().classList.add('grabbing');
  }
  function onMapMove(e) {
    if (!grab) return;
    grab.moved = true;
    moveAllTo(
      grab.origin.lat + (e.latlng.lat - grab.start.lat),
      grab.origin.lng + (e.latlng.lng - grab.start.lng)
    );
  }
  function onMapUp() {
    if (!grab) return;
    const moved = grab.moved;
    grab = null;
    map.dragging.enable();
    map.getContainer().classList.remove('grabbing');
    if (moved && opts.onMoveEnd) opts.onMoveEnd(current.lat, current.lng);
  }
  for (const l of layers) l.poly.on('mousedown', onShapeDown);
  map.on('mousemove', onMapMove);
  map.on('mouseup', onMapUp);
  document.addEventListener('mouseup', onMapUp);

  function refreshVisibility() {
    for (const l of layers) {
      const show = !hidden.has(l.feat.k);
      if (show && !group.hasLayer(l.poly)) group.addLayer(l.poly);
      else if (!show && group.hasLayer(l.poly)) group.removeLayer(l.poly);
    }
  }

  function setLayerVisibility(kind, visible) {
    if (visible) hidden.delete(kind);
    else hidden.add(kind);
    refreshVisibility();
  }

  function getCounts() {
    const counts = {};
    for (const l of layers) counts[l.feat.k] = (counts[l.feat.k] || 0) + 1;
    return counts;
  }

  function getBounds() {
    return L.latLngBounds(boundaries.flatMap((b) => b.poly.getLatLngs().flat(2)));
  }

  function destroy() {
    map.off('mousemove', onMapMove);
    map.off('mouseup', onMapUp);
    document.removeEventListener('mouseup', onMapUp);
    map.removeLayer(group);
    map.removeLayer(handle);
  }

  return {
    origin,
    handle,
    moveAllTo,
    getCurrent: () => current,
    getBounds,
    getCounts,
    setLayerVisibility,
    destroy,
  };
}
