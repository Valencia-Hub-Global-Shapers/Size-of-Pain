#!/usr/bin/env python3
"""
filter_data.py — keep only camp-relevant features from a raw Overpass export.

A raw pull from Overpass Turbo over the Birkenau bounding box includes
hundreds of modern buildings from the surrounding village (Brzezinka) that
have nothing to do with the camp. This script applies the tag rules that
separate "part of the historic camp" from "modern village building".

Usage:
    python3 scripts/filter_data.py data/raw/overpass-export-full.geojson data/raw/overpass-export.geojson

Keep rules (a feature is kept if ANY of these match):
  - it is the main camp boundary way (way/53908378)
  - historic in {memorial, building, ruins, gate}
  - ruins is present (any value) — foundation/ruin outlines
  - building == barrack
  - building == gate
  - man_made == tower AND tower:type == watchtower
  - barrier == fence AND ref starts with "BI" or "BII" (sub-camp sector fences)

Everything else (houses, retail, service/substation buildings, modern
addresses, roads, etc.) is dropped.

Caveat: OSM tagging in this area isn't fully consistent — a handful of
genuine camp buildings (mostly latrine/washroom blocks) are tagged only
`building=yes` with no `historic`/`ruins` tag, so this heuristic won't
catch them. data/raw/overpass-export.geojson in this repo has already
been reviewed and includes those by hand; if you regenerate from a fresh
Overpass pull, do a quick visual diff against the current file before
trusting the output wholesale.
"""
import json
import sys


def keep(props):
    if props.get('@id') == 'way/53908378':
        return True
    if props.get('historic') in {'memorial', 'building', 'ruins', 'gate'}:
        return True
    if props.get('ruins') is not None:
        return True
    if props.get('building') in {'barrack', 'gate'}:
        return True
    if props.get('man_made') == 'tower' and props.get('tower:type') == 'watchtower':
        return True
    ref = str(props.get('ref', ''))
    if props.get('barrier') == 'fence' and (ref.startswith('BI') or ref.startswith('BII')):
        return True
    return False


def main():
    if len(sys.argv) != 3:
        print('usage: filter_data.py <input.geojson> <output.geojson>', file=sys.stderr)
        sys.exit(1)

    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding='utf-8') as f:
        data = json.load(f)

    before = len(data['features'])
    data['features'] = [f for f in data['features'] if keep(f['properties'])]
    after = len(data['features'])

    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    print(f'kept {after} of {before} features -> {dst}')


if __name__ == '__main__':
    main()
