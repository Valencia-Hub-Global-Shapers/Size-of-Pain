// campLayer.js — turns data/birkenau.geojson into Leaflet polygons and
// keeps them all moving together as one rigid shape.

import { buildRing } from './geo.js';

// Draw order (later = on top): sub-camp fences and the boundary sit
// underneath the individual building footprints; watchtowers sit on top
// of everything since they're small and easy to lose under buildings.
const DRAW_ORDER = { sector: 0, boundary: 1, building: 2, tower: 3 };

function styleFor(kind) {
  switch (kind) {
    case 'boundary':
      return { color: '#c65a35', weight: 2.5, opacity: 0.95, dashArray: '8 5', fill: false };
    case 'sector':
      return { color: '#c65a35', weight: 1, opacity: 0.4, dashArray: '2 5', fill: false };
    case 'tower':
      return { color: '#5c3a24', weight: 0.6, opacity: 0.9, fillColor: '#5c3a24', fillOpacity: 0.9 };
    default: // 'building'
      return { color: '#8a3d24', weight: 0.6, opacity: 0.85, fillColor: '#c65a35', fillOpacity: 0.55 };
  }
}

/**
 * @param {L.Map} map
 * @param {{origin:[number,number], features:{k:string,n:string,pts:[number,number][]}[]}} data
 * @returns {{
 *   origin: {lat:number, lng:number},
 *   boundary: {feat: object, poly: L.Polygon},
 *   moveAllTo: (lat:number, lng:number) => void,
 *   getCurrent: () => {lat:number, lng:number},
 *   onEachLayer: (fn: (poly: L.Polygon) => void) => void,
 * }}
 */
export function createCampLayer(map, data) {
  const origin = { lat: data.origin[0], lng: data.origin[1] };
  let current = { lat: origin.lat, lng: origin.lng };

  const features = [...data.features].sort(
    (a, b) => (DRAW_ORDER[a.k] ?? 2) - (DRAW_ORDER[b.k] ?? 2)
  );

  const layers = features.map((feat) => {
    const poly = L.polygon(buildRing(feat.pts, current.lat, current.lng), styleFor(feat.k));
    if (feat.n) poly.bindTooltip(feat.n, { sticky: true, direction: 'top', opacity: 0.9 });
    poly.addTo(map);
    return { feat, poly };
  });

  const boundary = layers.find((l) => l.feat.k === 'boundary');
  if (!boundary) {
    throw new Error('createCampLayer: no feature with k === "boundary" in data');
  }

  function moveAllTo(lat, lng) {
    current = { lat, lng };
    for (const l of layers) {
      l.poly.setLatLngs(buildRing(l.feat.pts, lat, lng));
    }
  }

  function onEachLayer(fn) {
    for (const l of layers) fn(l.poly);
  }

  return {
    origin,
    boundary,
    moveAllTo,
    getCurrent: () => current,
    onEachLayer,
  };
}
