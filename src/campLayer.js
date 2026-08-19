// campLayer.js — turns data/birkenau.geojson into Leaflet layers and
// keeps them all moving together as one rigid shape.

import { buildRing, metersToLatLng } from './geo.js';

// Layer draw order (later = on top). Boundary and sectors sit under
// detailed structures; watchtowers sit on top because they are small.
const DRAW_ORDER = {
  railway: 0,
  boundary: 1,
  sector: 2,
  barracks: 3,
  other: 4,
  crematoria: 5,
  watchtower: 6,
};

function styleFor(kind, type) {
  const isLine = type === 'line';
  switch (kind) {
    case 'boundary':
      return {
        color: '#c65a35',
        weight: 2.5,
        opacity: 0.95,
        dashArray: '8 5',
        fill: false,
      };
    case 'sector':
      return {
        color: '#c65a35',
        weight: 1,
        opacity: 0.4,
        dashArray: '2 5',
        fill: false,
      };
    case 'railway':
      return {
        color: '#5c3a24',
        weight: 2.5,
        opacity: 0.85,
        lineCap: 'butt',
        dashArray: '1 6',
      };
    case 'watchtower':
      return {
        color: '#5c3a24',
        weight: 0.6,
        opacity: 0.9,
        fillColor: '#5c3a24',
        fillOpacity: 0.9,
      };
    case 'crematoria':
      return {
        color: '#8a3d24',
        weight: 1.2,
        opacity: 0.9,
        fillColor: '#8a3d24',
        fillOpacity: 0.65,
      };
    case 'barracks':
      return {
        color: '#8a3d24',
        weight: 0.6,
        opacity: 0.85,
        fillColor: '#c65a35',
        fillOpacity: 0.55,
      };
    default: // 'other'
      return {
        color: '#8a3d24',
        weight: 0.5,
        opacity: 0.7,
        fillColor: '#c65a35',
        fillOpacity: 0.35,
      };
  }
}

function createLayerFor(feat, lat, lng) {
  const latlngs = buildRing(feat.pts, lat, lng);
  const style = styleFor(feat.k, feat.t);
  if (feat.t === 'line') {
    return L.polyline(latlngs, style);
  }
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
  cx /= 6 * area;
  cy /= 6 * area;
  return [cx, cy];
}

/**
 * @param {L.Map} map
 * @param {object} data
 * @returns {object}
 */
export function createCampLayer(map, data) {
  const origin = { lat: data.origin[0], lng: data.origin[1] };
  let current = { lat: origin.lat, lng: origin.lng };

  const features = [...data.features].sort(
    (a, b) => (DRAW_ORDER[a.k] ?? 4) - (DRAW_ORDER[b.k] ?? 4)
  );

  const layers = features.map((feat) => {
    const poly = createLayerFor(feat, current.lat, current.lng);
    if (feat.n) poly.bindTooltip(feat.n, { sticky: true, direction: 'top', opacity: 0.9 });
    poly.addTo(map);
    return { feat, poly };
  });

  const boundary = layers.find((l) => l.feat.k === 'boundary');
  if (!boundary) {
    throw new Error('createCampLayer: no feature with k === "boundary" in data');
  }

  // Visual drag handle at the camp's centroid so users have a clear pivot to
  // grab, especially on touch devices where cursors are not visible.
  const [handleEast, handleNorth] = polygonCentroid(boundary.feat.pts);
  const handle = L.circleMarker(
    metersToLatLng(current.lat, current.lng, handleEast, handleNorth),
    {
      radius: 10,
      weight: 2.5,
      color: '#c65a35',
      fillColor: '#c65a35',
      fillOpacity: 0.25,
      className: 'camp-drag-handle',
      interactive: true,
    }
  );
  handle.bindTooltip('Drag to move', { direction: 'top', opacity: 0.9 });
  handle.addTo(map);

  function moveAllTo(lat, lng) {
    current = { lat, lng };
    for (const l of layers) {
      l.poly.setLatLngs(buildRing(l.feat.pts, lat, lng));
    }
    handle.setLatLng(metersToLatLng(lat, lng, handleEast, handleNorth));
  }

  function setLayerVisibility(kind, visible) {
    for (const l of layers) {
      if (l.feat.k === kind) {
        if (visible) {
          if (!map.hasLayer(l.poly)) l.poly.addTo(map);
        } else if (map.hasLayer(l.poly)) {
          map.removeLayer(l.poly);
        }
      }
    }
  }

  function setAllLayersVisibility(visible) {
    for (const l of layers) {
      if (visible) {
        if (!map.hasLayer(l.poly)) l.poly.addTo(map);
      } else if (map.hasLayer(l.poly)) {
        map.removeLayer(l.poly);
      }
    }
  }

  function onEachLayer(fn) {
    for (const l of layers) fn(l.poly);
  }

  function getVisibleCounts() {
    const counts = {};
    for (const l of layers) {
      counts[l.feat.k] = (counts[l.feat.k] || 0) + 1;
    }
    return counts;
  }

  return {
    origin,
    boundary,
    handle,
    moveAllTo,
    getCurrent: () => current,
    onEachLayer,
    setLayerVisibility,
    setAllLayersVisibility,
    getVisibleCounts,
  };
}
