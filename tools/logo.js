'use strict';
// Plugin logo: the poe.how figure in front of a 3 x 3 grid of keys.
const FIGURE = [
  'm135.6 211.9c-6 2.7-22.9 9.6-27.3 3 0.7-15.4-12.2-18.2-12.2-18.2l3.1-9.1-9.1-3.1v-9.1c0 0-28.1 0.1-30.4-3-2.3-3.1 13.4-32.2 18.2-45.5 19 4 64.4 3 70.4 2.5 1.1-0.1 23.1-3.2 33.7-4.5 10.5-1.3 46.2-2.9 51.6-1.4-0.7 18.3 11.3 42.8 11.3 42.8l-82 51.6c-0.9-3.8-21.3-8.7-27.3-6z',
  'm117.5 295.9l-66.8-48.6 48.6-21.3c0 0 7.2 4.2 18.2 0 23-9.1 33.4-3 33.4-3l-57.7 36.4 30.3 33.4z',
  'm109.3 262.4l157.9-97.1c0 0 17 32.8 12.1 45.5 11.6 6.6 33.4 6.1 33.4 6.1 0 0-94.7 23.1-167 109.3-9.7-4.3-24.3-15.2-24.3-15.2l15.2-12.1z',
  'm269.2 88.5c0 0 46.6 23.3-75.9 27.3-38.4 1.2-61.2 9.5-106.3 3.1-45.1-6.3-102.8-1.6-48.5-18.3 78.9-24.3 81.4 18.8 188.2-21.2 23.8-0.1 42.5 9.1 42.5 9.1z',
  'm81 79.4l9.1-60.7c0 0 9.1-19 27.3-15.2 18.2 3.7 20.5 19.4 36.4 18.2 16-1.2 65.3-18.2 66.8 12.1 1.5 30.4 0 36.5 0 36.5 0 0-55.4 20.9-88 15.2-32.7-5.8-51.6-6.1-51.6-6.1z',
];
const SIZE = 256;
const FIGURE_BOX = 330;
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
