# Birkenau, to scale

An interactive map that overlays the true footprint of Auschwitz II–Birkenau
— its real perimeter, sub-camp fences, barrack and ruin foundations, and
watchtowers — onto anywhere in the world, at true physical size, so the
scale of the camp can be felt against a place you actually know.

Built the way [thetruesize.com](https://thetruesize.com) handles country
outlines: shapes are stored as true meter offsets from a fixed point, then
re-projected around whatever latitude you drop them at, so they stay
correctly sized instead of stretching the way a naively-dragged map shape
would.

## Quick start

No build step, no dependencies to install. You do need to serve the files
over HTTP rather than opening `index.html` directly — the browser blocks
`fetch()` of local files under `file://`.

```
python3 -m http.server 8000
# then open http://localhost:8000
```

(Any other static file server — `npx serve`, VS Code's Live Server, etc.
— works just as well.)

## Deploying

It's plain static files. Push to a repo and point GitHub Pages / Netlify /
Vercel at the root — nothing to build.

## Architecture

```
index.html            markup shell only
src/
  style.css            all styling
  geo.js               meters <-> lat/lng conversion (the true-size math)
  campLayer.js          builds the draggable Leaflet layers from the data
  geocode.js             search + reverse-geocode via Nominatim
  main.js                 entry point; wires map, drag, search, reset together
data/
  birkenau.geojson       the data the site actually loads (generated)
  raw/
    overpass-export.geojson   curated source pull from OpenStreetMap
    OVERPASS_QUERY.md          the query used, and how to extend it
scripts/
  filter_data.py         raw Overpass export -> camp-relevant features only
  build_data.py           filtered features -> true-size dataset + stats
```

`data/birkenau.geojson` is a build artifact, committed so the site works
with zero build step. If you change `data/raw/overpass-export.geojson`
(or pull a fresh export), regenerate it:

```
python3 scripts/filter_data.py data/raw/overpass-export.geojson data/raw/overpass-export.geojson
python3 scripts/build_data.py data/raw/overpass-export.geojson data/birkenau.geojson
```

`build_data.py` also prints the area/perimeter/comparison stats shown in
the stat card on the page — if the data changes, update those numbers in
`index.html` by hand to match.

## Extending

- **Add the BIII "Mexico" sector**: see `data/raw/OVERPASS_QUERY.md`.
- **Add another camp/site entirely**: pull its own Overpass export, run
  it through the same two scripts to get its own `origin` + `features`,
  and either swap `data/birkenau.geojson` or add a second dataset and a
  way to switch between them in `main.js`.
- **Feature kinds**: the data format is deliberately small —
  `{k: 'boundary'|'sector'|'tower'|'building', n: name, pts: [[east,north],...]}`.
  Add a new `k` and a matching case in `styleFor()` in `campLayer.js` to
  render it differently.

## Data & attribution

- Building, fence, and boundary geometry: © OpenStreetMap contributors,
  [ODbL](https://www.openstreetmap.org/copyright). Keep that attribution
  visible if you fork or redeploy this.
- Basemap tiles: [CARTO](https://carto.com/attribution/) / OpenStreetMap.
- Geocoding: [Nominatim](https://nominatim.org/) (OpenStreetMap). Please
  keep usage light — this project fires one request per user action, not
  per keystroke.
- Historical context and figures (area, deaths, etc.): the
  [Auschwitz-Birkenau Memorial and Museum](https://www.auschwitz.org/).

## License

Code in this repository is MIT-licensed (see `LICENSE`). The map data
under `data/` is derived from OpenStreetMap and remains under ODbL —
see the attribution section above.
