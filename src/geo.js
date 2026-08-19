// geo.js — the true-size projection trick.
//
// Every camp feature is stored (in data/birkenau.geojson) as a list of
// [east, north] meter offsets from a single origin point, not as raw
// lat/lng. To draw the camp at some target location, we convert those
// meter offsets into lat/lng around the *target's* latitude. Because the
// conversion re-derives longitude spacing from cos(latitude) every time,
// the shape keeps its true physical size no matter where it's dropped —
// the same idea thetruesize.com uses to counter Mercator distortion.

export const M_PER_DEG_LAT = 111320;

export function metersToLatLng(centerLat, centerLng, eastM, northM) {
  const dLat = northM / M_PER_DEG_LAT;
  const dLng = eastM / (M_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180));
  return [centerLat + dLat, centerLng + dLng];
}

/** Convert a feature's stored meter-offset ring into a Leaflet-ready lat/lng ring. */
export function buildRing(points, centerLat, centerLng) {
  return points.map(([e, n]) => metersToLatLng(centerLat, centerLng, e, n));
}
