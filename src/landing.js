// landing.js - fills the landing page: hero outline, same-scale camp
// cards and the layer glossary, all from the same data the map uses.

import { styleFor } from './campLayer.js';
import { loadCamp, loadManifest } from './camps.js';
import { LAYER_INFO, LAYER_ORDER } from './layers.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, text = '') {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (text) node.textContent = text;
  return node;
}

function extent(features) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  features.forEach((f) => f.pts.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }));
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** SVG path data for a feature, with metres scaled and centred into a box. */
function pathFor(feat, ext, scale, size) {
  const ox = (size - ext.w * scale) / 2;
  const oy = (size - ext.h * scale) / 2;
  const d = feat.pts.map(([x, y], i) => {
    const px = ox + (x - ext.minX) * scale;
    const py = oy + (ext.maxY - y) * scale;
    return `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
  }).join('');
  return feat.t === 'polygon' ? `${d}Z` : d;
}

function drawFeatures(svg, features, ext, scale, size, { detail = true } = {}) {
  const order = ['railway', 'boundary', 'sector', 'fence', 'barracks', 'other', 'memorial', 'crematoria', 'watchtower'];
  const sorted = [...features].sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
  sorted.forEach((f) => {
    if (!detail && f.k !== 'boundary') return;
    const st = styleFor(f.k);
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', pathFor(f, ext, scale, size));
    const isLine = f.t === 'line' || f.k === 'sector' || f.k === 'fence';
    p.setAttribute('fill', isLine ? 'none' : (st.fillColor || st.color));
    p.setAttribute('fill-opacity', isLine ? 0 : (f.k === 'boundary' ? 0.12 : st.fillOpacity));
    p.setAttribute('stroke', f.k === 'boundary' ? 'var(--accent)' : st.color);
    p.setAttribute('stroke-width', f.k === 'boundary' ? 1.6 : Math.min(st.weight, 1));
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    p.setAttribute('stroke-linejoin', 'round');
    if (f.k === 'boundary') p.setAttribute('stroke-dasharray', '5 3');
    svg.appendChild(p);
  });
}

function drawHero(data) {
  const svg = document.getElementById('heroSvg');
  const size = 400;
  const ext = extent(data.features.filter((f) => f.k === 'boundary'));
  const scale = (size * 0.9) / Math.max(ext.w, ext.h);
  drawFeatures(svg, data.features, ext, scale, size);
  // 500 m scale bar
  const bar = 500 * scale;
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'scalebar');
  g.innerHTML = `<line x1="12" y1="388" x2="${12 + bar}" y2="388" /><text x="12" y="380">500 m</text>`;
  svg.appendChild(g);
}

function swatch(kind) {
  const st = styleFor(kind);
  const isLine = ['railway', 'fence', 'sector', 'boundary'].includes(kind);
  const fill = isLine ? 'none' : (st.fillColor || st.color);
  const dash = st.dashArray ? `stroke-dasharray="${st.dashArray}"` : '';
  return `<svg class="swatch" viewBox="0 0 24 16" aria-hidden="true"><rect x="2" y="2" width="20" height="12" rx="2" fill="${fill}" fill-opacity="${isLine ? 0 : st.fillOpacity}" stroke="${st.color}" stroke-width="${Math.max(st.weight, 1.5)}" ${dash}/></svg>`;
}

function renderLayerGlossary() {
  const grid = document.getElementById('layerGrid');
  LAYER_ORDER.forEach((k) => {
    const info = LAYER_INFO[k];
    const card = el('article', { class: 'layer-card' });
    card.innerHTML = `<h3>${swatch(k)} ${info.label}</h3><p>${info.general}</p>`;
    grid.appendChild(card);
  });
}

async function renderCamps() {
  const manifest = await loadManifest();
  const grid = document.getElementById('campGrid');
  const select = document.getElementById('heroCamp');
  select.innerHTML = '';
  manifest.camps.forEach((c) => select.appendChild(el('option', { value: c.id }, c.name)));

  const datasets = await Promise.all(manifest.camps.map((c) => loadCamp(c).catch(() => null)));
  const birkenau = datasets[manifest.camps.findIndex((c) => c.id === 'birkenau')];
  if (birkenau) drawHero(birkenau);

  // One scale for every card: the largest camp fills its box.
  const exts = datasets.map((d) => (d ? extent(d.features.filter((f) => f.k === 'boundary')) : null));
  const maxSpan = Math.max(...exts.filter(Boolean).map((e) => Math.max(e.w, e.h)));
  const size = 200;
  const scale = (size * 0.92) / maxSpan;

  manifest.camps.forEach((c, i) => {
    const data = datasets[i];
    if (!data) return;
    const s = data.stats;
    const card = el('a', { class: 'camp-card', href: `map.html?camp=${encodeURIComponent(c.id)}` });
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'camp-shape');
    drawFeatures(svg, data.features, exts[i], scale, size, { detail: false });
    card.appendChild(svg);
    const body = el('div', { class: 'camp-card-body' });
    body.appendChild(el('h3', {}, c.name));
    body.appendChild(el('p', { class: 'camp-meta' }, `${c.place} · ${c.years}`));
    body.appendChild(el('p', { class: 'camp-type' }, c.type));
    const stats = el('p', { class: 'camp-stats' });
    stats.innerHTML = `<strong>${s.area_km2} km²</strong> · ${s.pitches.toLocaleString('en')} pitches · ${s.walk_min} min walk around`;
    body.appendChild(stats);
    if (c.victims_short) body.appendChild(el('p', { class: 'camp-victims' }, c.victims_short));
    body.appendChild(el('span', { class: 'camp-cta' }, 'View on the map'));
    card.appendChild(body);
    grid.appendChild(card);
  });
}

renderLayerGlossary();
renderCamps().catch((err) => {
  console.error(err);
  document.getElementById('campGrid').textContent = 'Could not load the camp list.';
});
