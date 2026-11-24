'use strict';
// Marketplace images -> docs/marketplace/. Uses sample data. Game icons come from the folder in EXILE_DECK_ICONS,
// which is not part of this repository; without it the drawn placeholder icons are used.
// Run `node tools/render.js` first: the deck pages come from its output.
const fs = require('fs');
const path = require('path');
const { renderPngs } = require('./browser');
const { deck, size } = require('./sheet');
const { plugin } = require('./make_assets');
const R = require('../plugin/com.poehow.exile-deck.sdPlugin/bin/render.js');

const OUT = path.join(__dirname, '..', 'docs', 'marketplace');
const W = 1920;
const H = 960;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const uri = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const text = (x, y, s, px, fill = '#f3ead8', extra = '') =>
  `<text x="${x}" y="${y}" font-family="Segoe UI" font-size="${px}" font-weight="700" fill="${fill}" ${extra}>${esc(s)}</text>`;
const page = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>` +
  '<linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2318"/><stop offset="1" stop-color="#0b0a08"/></linearGradient>' +
  `</defs><rect width="${W}" height="${H}" fill="url(#pg)"/>${inner}</svg>`;
const icon = (x, y, s) => `<image x="${x}" y="${y}" width="${s}" height="${s}" href="${uri(plugin)}"/>`;
const single = (svg, x, y, s) =>
  `<clipPath id="c${x}"><rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.11}"/></clipPath>` +
  `<image clip-path="url(#c${x})" x="${x}" y="${y}" width="${s}" height="${s}" href="${uri(svg)}"/>`;
const gallery = (title, sub, inner) => page(text(120, 120, title, 64) + text(120, 180, sub, 32, '#a49883') + inner);
const fullDeck = (p) => {
  const o = { page: p, key: 148, gap: 20 };
  return deck({ ...o, x: (W - size(o).w) / 2, y: 250 });
};

const mageblood = process.env.EXILE_DECK_ICONS && path.join(process.env.EXILE_DECK_ICONS, 'Mageblood.png');
const beltIcon = mageblood && fs.existsSync(mageblood) ? 'data:image/png;base64,' + fs.readFileSync(mageblood).toString('base64') : null;
const jobs = [];
const add = (svg, width, height, name) => jobs.push({ svg, width, height, file: path.join(OUT, name) });

add(plugin, 288, 288, 'app-icon-288.png');
add(page(icon(120, 230, 220) + text(120, 570, 'Exile Deck', 104) + text(120, 640, 'Path of Exile economy', 42, '#d6b56d') +
  text(120, 696, 'on your Stream Deck', 42, '#d6b56d') + deck({ cols: 5, rows: 3, key: 176, gap: 24, x: 860, y: 192 })), W, H, 'thumbnail.png');
add(gallery('Live prices at a glance', 'Currency, uniques and divination cards with 7-day trends', fullDeck(0)), W, H, 'gallery-1-prices.png');
add(gallery('Know which boss pays', 'Cost, loot and profit per run, ranked for the current league', fullDeck(1)), W, H, 'gallery-2-bosses.png');
const result = R.checkResult({ name: 'Mageblood', variant: '4 Flasks', icon: beltIcon, chaos: 43464, divPrice: 197.7, type: 'UniqueAccessory' });
const steps = [['1. Hover an item', R.checkIdle()], ['2. Press the key', R.checkBusy()], ['3. See its price', result]];
add(gallery('One-press price check', 'Works while the game window is active. One press, one action.',
  steps.map(([t, svg], i) => single(svg, 210 + i * 540, 330, 420) + text(420 + i * 540, 840, t, 40, '#f3ead8', 'text-anchor="middle"')).join('')), W, H, 'gallery-3-price-check.png');

renderPngs(jobs);
console.log('listing images ok', jobs.length);
