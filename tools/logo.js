'use strict';
// Plugin logo: the poe.how figure in front of a 3 x 3 grid of keys.
const { LOGO_FIGURE: FIGURE, LOGO_BOX: FIGURE_BOX } = require('../plugin/com.poehow.exile-deck.sdPlugin/bin/render.js');
const SIZE = 256;
const FIGURE_SIZE = 196;
const PAD = 24;
const GAP = 12;
const KEY = (SIZE - 2 * PAD - 2 * GAP) / 3;

const keys = [0, 1, 2].flatMap((y) => [0, 1, 2].map((x) =>
  `<rect x="${PAD + x * (KEY + GAP)}" y="${PAD + y * (KEY + GAP)}" width="${KEY}" height="${KEY}" rx="13" fill="#15120d" stroke="#6f5c33" stroke-width="3"/>`));
const offset = (SIZE - FIGURE_SIZE) / 2;

const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2318"/><stop offset="1" stop-color="#0b0a08"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbeec6"/><stop offset=".5" stop-color="#e2bf6b"/><stop offset="1" stop-color="#a9813a"/></linearGradient>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000" flood-opacity=".9"/></filter></defs>
<rect width="${SIZE}" height="${SIZE}" rx="48" fill="url(#bg)"/><rect x="6" y="6" width="${SIZE - 12}" height="${SIZE - 12}" rx="42" fill="none" stroke="#d6b56d" stroke-opacity=".55" stroke-width="5"/>
${keys.join('')}
<g transform="translate(${offset} ${offset}) scale(${FIGURE_SIZE / FIGURE_BOX})" fill="url(#gold)" filter="url(#shadow)">${FIGURE.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`;

module.exports = { logo };
