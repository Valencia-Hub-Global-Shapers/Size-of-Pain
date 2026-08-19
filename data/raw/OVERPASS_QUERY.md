# Overpass query used for data/raw/overpass-export.geojson

Run this at https://overpass-turbo.eu — paste, click Run, then
Export → GeoJSON.

```
[out:json][timeout:60];
(
  way(50.0246,19.1400,50.0446,19.1950)["historic"];
  way(50.0246,19.1400,50.0446,19.1950)["building"];
  way(50.0246,19.1400,50.0446,19.1950)["ruins"];
  way(50.0246,19.1400,50.0446,19.1950)["barrier"];
  way(50.0246,19.1400,50.0446,19.1950)["railway"];
);
out body;
>;
out skel qt;
```

The bounding box (`south,west,north,east`) covers the BI and BII sectors —
the built-up core of the camp. It does not cover the unfinished BIII
"Mexico" sector further west.

## Extending to BIII "Mexico"

Shift the west edge of the bounding box further west (try `19.1200`
instead of `19.1400`) and re-run. The BIII boundary way is
`way/266179150` ("B III 'Mexico' area extension of the camp") — if it's
present in your export, `scripts/filter_data.py` will keep it
automatically (it's tagged `historic`/`ruins` like the rest), but you'll
also need to add its id alongside `way/53908378` wherever the main
boundary is treated specially (`BOUNDARY_ID` in `scripts/build_data.py`,
and the `k: 'boundary'` styling in `src/campLayer.js`) if you want it
drawn as a second boundary outline rather than folded into "building".

## Regenerating the site data after a new export

```
python3 scripts/filter_data.py data/raw/overpass-export-full.geojson data/raw/overpass-export.geojson
python3 scripts/build_data.py data/raw/overpass-export.geojson data/birkenau.geojson
```
