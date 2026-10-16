#!/usr/bin/env python3
"""
fetch_osm.py - pull camp geometry from OpenStreetMap via the Overpass API.

Two modes:

    python3 scripts/fetch_osm.py discover scripts/camp_sources.json out.txt
        For every camp in the sources file, list named, camp-scale OSM
        objects near its approximate center (historic sites, memorials,
        landuse, fences). Used once, by hand, to pick each camp's
        boundary way or relation.

    python3 scripts/fetch_osm.py fetch scripts/camp_sources.json [camp_id ...]
        For every camp that has a "boundary" set, download the boundary
        plus all camp-relevant features around it, keep the ones that sit
        inside the boundary (plus a small buffer), and write
        data/raw/<camp_id>-overpass-export.geojson. That file is the
        input to scripts/build_data.py.

Only the standard library is used, so this runs anywhere Python 3 does,
including a bare GitHub Actions runner.
"""

import json
import math
import sys
import time
import urllib.parse
import urllib.request

ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
]
USER_AGENT = (
    'size-of-pain-data-pipeline '
    '(github.com/valencia-hub-global-shapers/size-of-pain)'
)
M_PER_DEG_LAT = 111320.0

# Tags that make a feature worth looking at inside a camp boundary.
RELEVANT_KEYS = [
    'historic',
    'ruins',
    'building',
    'barrier',
    'railway',
    'memorial',
    'man_made',
]


def overpass(query):
    body = urllib.parse.urlencode({'data': query}).encode()
    last_err = None
    for attempt in range(6):
        for url in ENDPOINTS:
            req = urllib.request.Request(
                url, data=body, headers={'User-Agent': USER_AGENT}
            )
            try:
                with urllib.request.urlopen(req, timeout=180) as res:
                    return json.loads(res.read().decode('utf-8'))
            except Exception as err:  # noqa: BLE001 - try the next mirror
                last_err = err
                print(f'  {url} failed: {err}', file=sys.stderr)
        time.sleep(15 * (attempt + 1))
    raise RuntimeError(f'all Overpass endpoints failed: {last_err}')


def bbox_area_m2(bounds):
    mid_lat = (bounds['minlat'] + bounds['maxlat']) / 2
    h = (bounds['maxlat'] - bounds['minlat']) * M_PER_DEG_LAT
    w = (
        (bounds['maxlon'] - bounds['minlon'])
        * M_PER_DEG_LAT
        * math.cos(math.radians(mid_lat))
    )
    return w * h


def discover(sources, out_path):
    lines = []
    for camp_id, cfg in sources.items():
        if cfg.get('boundary'):
            continue
        lat, lon = cfg['center']
        radius = cfg.get('search_radius_m', 2500)
        q = f"""[out:json][timeout:120];
(
  nwr(around:{radius},{lat},{lon})["historic"];
  nwr(around:{radius},{lat},{lon})["memorial"];
  nwr(around:{radius},{lat},{lon})["landuse"]["name"];
  nwr(around:{radius},{lat},{lon})["tourism"="museum"];
  way(around:{radius},{lat},{lon})["barrier"~"fence|wall"]["name"];
  way(around:{radius},{lat},{lon})["barrier"~"fence|wall"]["ref"];
);
out tags bb;"""
        print(f'discover {camp_id}', file=sys.stderr)
        try:
            data = overpass(q)
        except RuntimeError as err:
            lines += [f'### {camp_id}', f'FAILED: {err}', '']
            continue
        rows = []
        for el in data.get('elements', []):
            b = el.get('bounds')
            if not b or el['type'] == 'node':
                continue
            area = bbox_area_m2(b)
            if area < 5000:
                continue
            rows.append((area, el))
        rows.sort(key=lambda r: -r[0])
        lines.append(f'### {camp_id}')
        for area, el in rows[:40]:
            tags = el.get('tags', {})
            keep = {
                k: v
                for k, v in tags.items()
                if k
                in (
                    'name',
                    'name:en',
                    'historic',
                    'memorial',
                    'landuse',
                    'barrier',
                    'ref',
                    'tourism',
                    'site_type',
                    'wikidata',
                )
            }
            lines.append(
                f"{el['type']}/{el['id']}\tbbox~{area / 1e6:.3f}km2\t"
                + json.dumps(keep, ensure_ascii=False)
            )
        lines.append('')
        time.sleep(5)
    if not lines:
        print(
            'every camp already has a boundary; nothing to discover',
            file=sys.stderr,
        )
        return
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    print(f'wrote {out_path}', file=sys.stderr)


def assemble_rings(ways):
    """Join way geometries (lists of (lon, lat)) into closed rings."""
    segments = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while segments:
        ring = segments.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, seg in enumerate(segments):
                if seg[0] == ring[-1]:
                    ring += seg[1:]
                elif seg[-1] == ring[-1]:
                    ring += seg[-2::-1]
                elif seg[-1] == ring[0]:
                    ring = seg[:-1] + ring
                elif seg[0] == ring[0]:
                    ring = seg[:0:-1] + ring
                else:
                    continue
                segments.pop(i)
                changed = True
                break
        if ring[0] == ring[-1] and len(ring) >= 4:
            rings.append(ring)
    return rings


def element_to_features(el):
    """Overpass element (with `out geom`) -> list of GeoJSON features."""
    tags = dict(el.get('tags', {}))
    tags['@id'] = f"{el['type']}/{el['id']}"
    feats = []
    if el['type'] == 'way' and 'geometry' in el:
        coords = [(p['lon'], p['lat']) for p in el['geometry'] if p]
        if len(coords) < 2:
            return feats
        closed = coords[0] == coords[-1] and len(coords) >= 4
        is_line = (
            (not closed)
            or tags.get('railway')
            or (
                tags.get('barrier') in ('fence', 'wall')
                and not tags.get('area')
                and not tags.get('historic')
                and not tags.get('landuse')
                and not tags.get('name')
            )
        )
        if closed and not is_line:
            geom = {
                'type': 'Polygon',
                'coordinates': [[list(c) for c in coords]],
            }
        else:
            geom = {
                'type': 'LineString',
                'coordinates': [list(c) for c in coords],
            }
        feats.append({'type': 'Feature', 'properties': tags, 'geometry': geom})
    elif el['type'] == 'relation' and tags.get('type') in (
        'multipolygon',
        'boundary',
    ):
        outers = [
            [(p['lon'], p['lat']) for p in m['geometry'] if p]
            for m in el.get('members', [])
            if m.get('type') == 'way'
            and m.get('role') in ('outer', '')
            and m.get('geometry')
        ]
        for ring in assemble_rings(outers):
            feats.append(
                {
                    'type': 'Feature',
                    'properties': dict(tags),
                    'geometry': {
                        'type': 'Polygon',
                        'coordinates': [[list(c) for c in ring]],
                    },
                }
            )
    return feats


def point_in_ring(lon, lat, ring):
    inside = False
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > lat) != (y2 > lat):
            x = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if x > lon:
                inside = not inside
    return inside


def dist_to_ring_m(lon, lat, ring):
    kx = M_PER_DEG_LAT * math.cos(math.radians(lat))
    ky = M_PER_DEG_LAT
    best = float('inf')
    for i in range(len(ring) - 1):
        ax, ay = (ring[i][0] - lon) * kx, (ring[i][1] - lat) * ky
        bx, by = (ring[i + 1][0] - lon) * kx, (ring[i + 1][1] - lat) * ky
        dx, dy = bx - ax, by - ay
        seg_len2 = dx * dx + dy * dy
        t = (
            0.0
            if seg_len2 == 0
            else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg_len2))
        )
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def near_boundary(coords, rings, buffer_m):
    lon = sum(c[0] for c in coords) / len(coords)
    lat = sum(c[1] for c in coords) / len(coords)
    for ring in rings:
        if (
            point_in_ring(lon, lat, ring)
            or dist_to_ring_m(lon, lat, ring) <= buffer_m
        ):
            return True
    return False


def is_modern_noise(tags):
    """Obvious modern features that sit inside some memorial grounds."""
    if tags.get('building') in (
        'house',
        'detached',
        'garage',
        'garages',
        'apartments',
        'residential',
        'retail',
        'commercial',
        'shed',
        'carport',
    ):
        return True
    if tags.get('amenity') in ('parking', 'toilets', 'cafe', 'restaurant'):
        return True
    if tags.get('railway') in (
        'platform',
        'station',
        'halt',
        'level_crossing',
    ) and not tags.get('historic'):
        return True
    return False


def fetch(sources, only):
    for camp_id, cfg in sources.items():
        if only and camp_id not in only:
            continue
        boundary_ids = cfg.get('boundary')
        if not boundary_ids or cfg.get('skip_fetch'):
            continue
        if isinstance(boundary_ids, str):
            boundary_ids = [boundary_ids]
        print(f'fetch {camp_id}', file=sys.stderr)
        try:
            fetch_one(camp_id, cfg, boundary_ids)
        except RuntimeError as err:
            print(f'  FAILED {camp_id}: {err}', file=sys.stderr)
        time.sleep(5)


def fetch_one(camp_id, cfg, boundary_ids):
    sel = ''.join(
        f'{b.split("/")[0]}({b.split("/")[1]});' for b in boundary_ids
    )
    bdata = overpass(f'[out:json][timeout:120];({sel});out geom;')
    boundary_feats = []
    for el in bdata['elements']:
        boundary_feats += element_to_features(el)
    if not boundary_feats:
        print(f'  no boundary geometry for {camp_id}', file=sys.stderr)
        return
    rings = [
        f['geometry']['coordinates'][0]
        for f in boundary_feats
        if f['geometry']['type'] == 'Polygon'
    ]
    if not rings:
        rings = [f['geometry']['coordinates'] for f in boundary_feats]
    lons = [c[0] for r in rings for c in r]
    lats = [c[1] for r in rings for c in r]
    pad = 0.003
    bbox = (
        f'{min(lats) - pad},{min(lons) - pad},'
        f'{max(lats) + pad},{max(lons) + pad}'
    )
    parts = ''.join(
        f'way({bbox})["{k}"];relation({bbox})["{k}"]["type"="multipolygon"];'
        for k in RELEVANT_KEYS
    )
    data = overpass(f'[out:json][timeout:180];({parts});out geom;')
    buffer_m = cfg.get('buffer_m', 30)
    seen = set(f['properties']['@id'] for f in boundary_feats)
    out = list(boundary_feats)
    for el in data['elements']:
        for feat in element_to_features(el):
            pid = feat['properties']['@id']
            if pid in seen or is_modern_noise(feat['properties']):
                continue
            g = feat['geometry']
            coords = (
                g['coordinates'][0]
                if g['type'] == 'Polygon'
                else g['coordinates']
            )
            if near_boundary(coords, rings, buffer_m):
                seen.add(pid)
                out.append(feat)
    path = f'data/raw/{camp_id}-overpass-export.geojson'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(
            {'type': 'FeatureCollection', 'features': out},
            f,
            ensure_ascii=False,
            indent=1,
        )
    print(f'  wrote {len(out)} features -> {path}', file=sys.stderr)


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ('discover', 'fetch'):
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    with open(sys.argv[2], encoding='utf-8') as f:
        sources = json.load(f)
    if sys.argv[1] == 'discover':
        discover(
            sources, sys.argv[3] if len(sys.argv) > 3 else 'discovery.txt'
        )
    else:
        fetch(sources, set(sys.argv[3:]))


if __name__ == '__main__':
    main()
