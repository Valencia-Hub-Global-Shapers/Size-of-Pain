#!/usr/bin/env python3
"""
build_data.py — turn filtered camp GeoJSON into the true-size dataset the
site loads at runtime (data/birkenau.geojson).

Every vertex of every feature is converted from (lon, lat) into a meter
offset (east, north) from a single origin point: the bounding-box center
of the main camp boundary. Storing offsets in real meters — rather than
raw lat/lng — is what lets the site redraw the whole camp, at its true
physical size, anywhere on the globe the person drags it to. See
src/geo.js for the inverse conversion used at render time.

Usage:
    python3 scripts/build_data.py data/raw/overpass-export.geojson data/birkenau.geojson
"""
import json
import math
import sys

M_PER_DEG_LAT = 111320.0
BOUNDARY_ID = 'way/53908378'
FOOTBALL_PITCH_M2 = 7140  # standard 105m x 68m pitch


def to_meters(lng, lat, origin_lat, origin_lng):
    north = (lat - origin_lat) * M_PER_DEG_LAT
    east = (lng - origin_lng) * M_PER_DEG_LAT * math.cos(math.radians(origin_lat))
    return [round(east, 2), round(north, 2)]


def classify(props):
    name = (props.get('name') or props.get('name:en') or '').lower()
    if props.get('@id') == BOUNDARY_ID:
        return 'boundary'
    if props.get('railway') is not None:
        return 'railway'
    if props.get('man_made') == 'tower' and props.get('tower:type') == 'watchtower':
        return 'watchtower'
    if props.get('barrier') == 'fence' and 'ref' in props:
        return 'sector'
    if 'krematorium' in name or 'crematorium' in name or 'komora gazowa' in name:
        return 'crematoria'
    if props.get('building') == 'barrack' or name.startswith('blok ') or 'barak' in name:
        return 'barracks'
    return 'other'


def polygon_area_and_perimeter(points):
    """Shoelace area + perimeter for a ring of [east, north] meter points."""
    n = len(points)
    area = 0.0
    perim = 0.0
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        area += x1 * y2 - x2 * y1
        perim += math.hypot(x2 - x1, y2 - y1)
    return abs(area) / 2, perim


def main():
    if len(sys.argv) != 3:
        print('usage: build_data.py <filtered-input.geojson> <output.geojson>', file=sys.stderr)
        sys.exit(1)

    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding='utf-8') as f:
        data = json.load(f)

    feats = data['features']
    boundary = next((f for f in feats if f['properties'].get('@id') == BOUNDARY_ID), None)
    if boundary is None:
        print(f'error: boundary feature {BOUNDARY_ID} not found in {src}', file=sys.stderr)
        sys.exit(1)

    ring = boundary['geometry']['coordinates'][0]
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    origin_lat = (min(lats) + max(lats)) / 2
    origin_lng = (min(lons) + max(lons)) / 2

    out_features = []
    for feat in feats:
        props = feat['properties']
        geom = feat['geometry']
        if geom['type'] == 'Polygon':
            ring = geom['coordinates'][0]
            geom_type = 'polygon'
        elif geom['type'] == 'LineString':
            ring = geom['coordinates']
            geom_type = 'line'
        else:
            continue
        pts = [to_meters(lng, lat, origin_lat, origin_lng) for lng, lat in ring]
        name = props.get('name') or props.get('name:en') or ''
        out_features.append({'k': classify(props), 'n': name, 't': geom_type, 'pts': pts})

    boundary_pts = next(f['pts'] for f in out_features if f['k'] == 'boundary')
    area_m2, perim_m = polygon_area_and_perimeter(boundary_pts)

    out = {
        'origin': [origin_lat, origin_lng],
        'stats': {
            'area_km2': round(area_m2 / 1e6, 2),
            'perimeter_km': round(perim_m / 1000, 2),
            'pitches': int(round(area_m2 / FOOTBALL_PITCH_M2)),
            'walk_min': int(round(perim_m / 1000 / 5 * 60)),
        },
        'features': out_features,
    }
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'), ensure_ascii=False)

    print(f'origin: {origin_lat:.6f}, {origin_lng:.6f}')
    print(f'features: {len(out_features)}')
    print(f'boundary area: {area_m2 / 1e6:.3f} km^2 ({area_m2 / 10000:.1f} ha)')
    print(f'boundary perimeter: {perim_m / 1000:.3f} km')
    print(f'~{area_m2 / FOOTBALL_PITCH_M2:.0f} football pitches')
    print(f'~{perim_m / 1000 / 5 * 60:.0f} min to walk the perimeter at 5 km/h')
    print(f'wrote {dst}')


if __name__ == '__main__':
    main()
