# Size of Pain

Developed by the [Valencia Hub](https://valencia-hub-global-shapers.github.io/?lang=en)
in collaboration with the Kraków Hub — both part of the World Economic
Forum's [Global Shapers Community](https://www.globalshapers.org/).

## Why this exists

Almost everyone knows the concentration camps existed. Very few people
have any real sense of how big they were. "1.69 km²" or "the size of
236 football pitches" is a fact you can read and immediately forget —
it doesn't land, because it has nothing to compare itself to inside
your own head. That's the gap this project tries to close: not a lack
of awareness that it happened, but a lack of *tools* to make the scale
of it felt rather than just stated.

This site closes that gap the only way that reliably works: it takes
the real, surveyed footprint of the camp and drops it — at true
physical size — onto a place you already know. Your city. Your
neighbourhood. The block you grew up on. Drag it around, watch it
swallow streets you can picture, and the number stops being a number.

Built the way [thetruesize.com](https://thetruesize.com) handles country
outlines: shapes are stored as true meter offsets from a fixed point, then
re-projected around whatever latitude you drop them at, so they stay
correctly sized instead of stretching the way a naively-dragged map shape
would.

The site currently includes 18 camps: Auschwitz II–Birkenau, Auschwitz I,
Majdanek, Treblinka II, Sobibór, Bełżec, Stutthof, Gross-Rosen, Dachau,
Sachsenhausen, Buchenwald, Ravensbrück, Mauthausen, Flossenbürg,
Neuengamme, Natzweiler-Struthof, Mittelbau-Dora and Westerbork.

The site opens on a landing page that explains the idea and shows every
camp side by side at the same scale. From there, the map lets you pick a
camp, drop it over any place, switch its layers (perimeter, sub-camp
fences, barracks, watchtowers, gas chambers and crematoria, railways,
memorials) on and off, and open a **Learn more** note on each layer
explaining what it was at that camp. See [Adding another camp](#adding-another-camp)
to add more.

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
index.html             landing page: what the tool is, the camps, the layers, credits
map.html               the map itself
assets/                logo and favicon
src/
  landing.js / .css     landing page (same-scale camp outlines, layer glossary)
  main.js               map page entry point: camp picker, search, drag, sheet, tabs
  style.css             map page styling (sidebar on desktop, bottom sheet on phones)
  camps.js              loads data/camps.json and each camp dataset
  campLayer.js          builds the draggable Leaflet layers from a camp dataset
  layers.js             layer names and general "Learn more" explanations
  geo.js                meters <-> lat/lng conversion (the true-size math)
  geocode.js            search + reverse-geocode via Nominatim
  storage.js            small localStorage helpers (remembered camp, layers, hint)
data/
  camps.json            the list of camps: names, history, sources, per-layer text
  <camp>.geojson        one true-size dataset per camp (generated)
  raw/                  filtered OpenStreetMap exports the datasets are built from
scripts/
  camp_sources.json     per camp: approximate centre and OSM boundary id(s)
  fetch_osm.py          Overpass API -> data/raw/<camp>-overpass-export.geojson
  build_data.py         raw export -> data/<camp>.geojson with stats
  filter_data.py        the hand-tuned filter used for the original Birkenau export
.github/workflows/
  fetch-camp-data.yml   runs fetch_osm.py on GitHub Actions and commits the result
```

### Map page URLs

`map.html?camp=<id>` opens a camp at its real location;
`map.html?camp=<id>#lat,lng,zoom` opens it placed somewhere else (this is
what the address bar shows as you move it, so it can be shared);
`map.html?camp=<id>&q=Valencia` searches for a place and drops the camp
there (used by the landing page search box). Old `index.html#lat,lng,zoom`
links are redirected to the Birkenau map.

### Controls

- Desktop: drag the outline or its round handle; click anywhere on the map
  to drop the camp there.
- Phones: drag the round handle (the outline itself is left alone so that
  one-finger panning still works), long-press the map to drop the camp
  there, or use the **Place here** (centre of the screen), **Near me**
  (your location) and **Real site** buttons. The information panel is a
  bottom sheet: tap or swipe its header to expand it.

## Extending

### The data format

Every camp ends up as one small GeoJSON-like file with the same shape:

```jsonc
{
  "origin": [lat, lng],          // the point every feature's [east, north] offset is measured from
  "stats": { "area_km2": 1.69, "area_ha": 168.5, "perimeter_km": 5.56, "pitches": 236, "walk_min": 67 },
  "features": [
    { "k": "boundary", "n": "name", "t": "polygon", "pts": [[east, north], ...] },
    { "k": "railway",  "n": "",     "t": "line",    "pts": [[east, north], ...] }
  ]
}
```

`pts` are meter offsets, not lat/lng; that is what makes the shape
reproject correctly at true size anywhere it is dropped. `k` is the kind
of feature: `boundary`, `sector`, `fence`, `barracks`, `watchtower`,
`crematoria`, `railway`, `memorial` or `other`. `t` is `polygon` or
`line`. At least one feature must be a `boundary` polygon; area and
perimeter are measured from the boundary polygons. The layer list on the
map only shows kinds a camp actually has.

### Adding another camp

1. **Find the boundary.** Add the camp to `scripts/camp_sources.json` with
   its approximate `center`. Run the **Fetch camp data from OpenStreetMap**
   workflow (Actions tab, or push a change to that file); it writes
   `data/raw/DISCOVERY.txt` listing named, camp-sized OSM objects near the
   centre. Pick the one that matches the camp perimeter (or the memorial
   grounds if the perimeter is not mapped) and put its id in `boundary`,
   e.g. `"boundary": "way/123456"` (a list is allowed for camps mapped as
   several parts).

   Locally, if you can reach the Overpass API, the same works with
   `python3 scripts/fetch_osm.py discover scripts/camp_sources.json out.txt`.

2. **Fetch the features.** Run the workflow again (or
   `python3 scripts/fetch_osm.py fetch scripts/camp_sources.json <id>`).
   It downloads everything camp-relevant around the boundary (historic,
   ruins, buildings, fences, railways, memorials, towers), keeps what lies
   inside it plus a small buffer, drops obvious modern buildings, and
   writes `data/raw/<id>-overpass-export.geojson`. Review it: OSM tagging
   differs from site to site.

3. **Build the dataset.** `python3 scripts/build_data.py --camp <id>` writes
   `data/<id>.geojson` and prints the stats. Feature kinds are guessed from
   tags and names (multilingual patterns for crematoria, barracks and
   watchtowers live at the top of the script).

4. **Describe it.** Add an entry to `data/camps.json` with the name, place,
   years, summary, victim figure, sources, a `boundary_note` explaining
   what the outline represents, and one `layers` text per kind the camp
   has. Those texts are what the **Learn more** buttons show, above the
   general explanation from `src/layers.js`.

Nothing else needs to change: the landing page and the map both read the
camp list from `data/camps.json`.

## Data & attribution

- Building, fence, and boundary geometry: © OpenStreetMap contributors,
  [ODbL](https://www.openstreetmap.org/copyright). Keep that attribution
  visible if you fork or redeploy this.
- Basemap tiles: [OpenStreetMap](https://www.openstreetmap.org/copyright).
- Geocoding: [Nominatim](https://nominatim.org/) (OpenStreetMap). Please
  keep usage light — this project fires one request per user action, not
  per keystroke.
- Historical context and figures (area, deaths, etc.): the
  [Auschwitz-Birkenau Memorial and Museum](https://www.auschwitz.org/).

## License

Code in this repository is MIT-licensed (see `LICENSE`). The map data
under `data/` is derived from OpenStreetMap and remains under ODbL —
see the attribution section above.
