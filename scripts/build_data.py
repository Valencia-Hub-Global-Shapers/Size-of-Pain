#!/usr/bin/env python3
"""
build_data.py - turn a filtered camp GeoJSON export into the true-size
dataset the site loads at runtime (data/<camp>.geojson).

Every vertex of every feature is converted from (lon, lat) into a meter
offset (east, north) from a single origin point: the bounding-box center
of the camp boundary. Storing offsets in real meters, rather than raw
lat/lng, is what lets the site redraw the whole camp at its true physical
size anywhere on the globe. See src/geo.js for the inverse conversion.

Usage:
    # Build one camp listed in scripts/camp_sources.json
    python3 scripts/build_data.py --camp majdanek

    # Build every camp in scripts/camp_sources.json that has a raw export
    python3 scripts/build_data.py --all

    # Explicit paths (boundary ids default to the camp's sources entry)
    python3 scripts/build_data.py data/raw/overpass-export.geojson data/birkenau.geojson \\
        --boundary way/53908378
"""
import argparse
import json
import math
import os
import re
import sys

M_PER_DEG_LAT = 111320.0
FOOTBALL_PITCH_M2 = 7140  # standard 105m x 68m pitch
SOURCES = os.path.join(os.path.dirname(__file__), 'camp_sources.json')

CREMATORIA_RE = re.compile(
    r'krematori|cremato|komora gazow|gaskammer|gas chamber|chambre [àa] gaz|vergasung|'
    r'gas van|death pit|komory gazowe', re.I)
WATCHTOWER_RE = re.compile(r'watch ?tower|wachturm|wieża strażnicza|wartownicza|mirador|stra[žz]n', re.I)
BARRACKS_RE = re.compile(r'^(blok|block|baracke|barak|barrack|baraque)\b|\bbara(ck|k|cke)\b|\bbarrack', re.I)


def to_meters(lng, lat, origin_lat, origin_lng):
    north = (lat - origin_lat) * M_PER_DEG_LAT
    east = (lng - origin_lng) * M_PER_DEG_LAT * math.cos(math.radians(origin_lat))
    return [round(east, 2), round(north, 2)]


def classify(props, boundary_ids):
    name = (props.get('name') or props.get('name:en') or '').lower()
    if props.get('@id') in boundary_ids:
        return 'boundary'
    if props.get('railway') is not None:
        return 'railway'
    if props.get('man_made') == 'tower' and props.get('tower:type') in ('watchtower', 'observation', None):
        return 'watchtower'
    if WATCHTOWER_RE.search(name):
        return 'watchtower'
    if props.get('barrier') in ('fence', 'wall', 'wire_fence'):
        return 'sector' if 'ref' in props else 'fence'
    if CREMATORIA_RE.search(name):
        return 'crematoria'
    if props.get('building') in ('barrack', 'barracks', 'hut') or BARRACKS_RE.search(name):
        return 'barracks'
    if (props.get('historic') == 'memorial' or props.get('memorial') is not None
            or props.get('historic') == 'monument' or props.get('historic') == 'tomb'):
        return 'memorial'
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


def build(src, dst, boundary_ids):
    with open(src, encoding='utf-8') as f:
        data = json.load(f)

    feats = data['features']
    boundaries = [f for f in feats if f['properties'].get('@id') in boundary_ids
                  and f['geometry']['type'] == 'Polygon']
    if not boundaries:
        print(f'error: boundary {boundary_ids} not found in {src}', file=sys.stderr)
        sys.exit(1)

    lons = [p[0] for b in boundaries for p in b['geometry']['coordinates'][0]]
    lats = [p[1] for b in boundaries for p in b['geometry']['coordinates'][0]]
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
        kind = classify(props, boundary_ids)
        if kind == 'boundary' and geom_type != 'polygon':
            continue
        pts = [to_meters(lng, lat, origin_lat, origin_lng) for lng, lat in ring]
        name = props.get('name:en') or props.get('name') or ''
        out_features.append({'k': kind, 'n': name, 't': geom_type, 'pts': pts})

    area_m2 = 0.0
    perim_m = 0.0
    for f in out_features:
        if f['k'] == 'boundary':
            a, p = polygon_area_and_perimeter(f['pts'])
            area_m2 += a
            perim_m += p

    out = {
        'origin': [origin_lat, origin_lng],
        'stats': {
            'area_km2': round(area_m2 / 1e6, 2) if area_m2 >= 1e5 else round(area_m2 / 1e6, 3),
            'area_ha': round(area_m2 / 1e4, 1),
            'perimeter_km': round(perim_m / 1000, 2),
            'pitches': int(round(area_m2 / FOOTBALL_PITCH_M2)),
            'walk_min': int(round(perim_m / 1000 / 5 * 60)),
        },
        'features': out_features,
    }
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'), ensure_ascii=False)

    counts = {}
    for f in out_features:
        counts[f['k']] = counts.get(f['k'], 0) + 1
    print(f'{dst}: {len(out_features)} features {counts}')
    print(f'  area {area_m2 / 1e6:.3f} km^2 ({area_m2 / 10000:.1f} ha), '
          f'perimeter {perim_m / 1000:.2f} km, ~{area_m2 / FOOTBALL_PITCH_M2:.0f} pitches, '
          f'~{perim_m / 1000 / 5 * 60:.0f} min walk')


def as_list(value):
    return [value] if isinstance(value, str) else list(value)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('src', nargs='?')
    ap.add_argument('dst', nargs='?')
    ap.add_argument('--boundary', nargs='+', help='OSM id(s) of the boundary, e.g. way/53908378')
    ap.add_argument('--camp', help='camp id from scripts/camp_sources.json')
    ap.add_argument('--all', action='store_true', help='build every camp that has a raw export')
    args = ap.parse_args()

    with open(SOURCES, encoding='utf-8') as f:
        sources = json.load(f)

    if args.all or args.camp:
        ids = list(sources) if args.all else [args.camp]
        for camp_id in ids:
            cfg = sources[camp_id]
            src = cfg.get('raw', f'data/raw/{camp_id}-overpass-export.geojson')
            if not cfg.get('boundary') or not os.path.exists(src):
                if args.camp:
                    print(f'error: {camp_id} has no boundary or no {src}', file=sys.stderr)
                    sys.exit(1)
                continue
            build(src, f'data/{camp_id}.geojson', set(as_list(cfg['boundary'])))
        return

    if not (args.src and args.dst and args.boundary):
        ap.error('give src, dst and --boundary, or use --camp / --all')
    build(args.src, args.dst, set(args.boundary))


if __name__ == '__main__':
    main()
