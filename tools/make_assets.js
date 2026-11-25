const path = require('path');
const R = require('../plugin/com.poehow.exile-deck.sdPlugin/bin/render.js');
const P = path.join(__dirname, '..', 'plugin', 'com.poehow.exile-deck.sdPlugin', 'imgs');
const { renderPngs } = require('./browser'); const jobs = [];
function png(svg, file, size) { jobs.push({ svg, width: size, height: size, file }); }
function both(svg, base, size) { png(svg, base + '.png', size); png(svg, base + '@2x.png', size * 2); }
// Monochrome white list icons (Stream Deck action list + category)
const G = {
  price: '<circle cx="32" cy="32" r="22"/><path d="M32 18 V46 M24 25 C24 20 40 20 40 26 C40 32 24 32 24 38 C24 44 40 44 40 39"/>',
  pricecheck: '<circle cx="27" cy="27" r="17"/><path d="M40 40 L56 56"/><path d="M21 27 H33 M27 21 V33"/>',
  movers: '<path d="M8 50 L24 34 L34 42 L56 18"/><path d="M44 18 H56 V30"/>',
  league: '<path d="M10 46 L6 18 L22 32 L32 12 L42 32 L58 18 L54 46 Z"/><path d="M10 54 H54"/>',
  regex: '<path d="M32 10 V34 M22 16 L42 28 M42 16 L22 28"/><circle cx="14" cy="50" r="4" fill="#ffffff"/><path d="M26 50 H54"/>',
  chat: '<path d="M10 12 H54 V42 H30 L18 54 V42 H10 Z"/><path d="M20 24 H44 M20 32 H36"/>',
  boss: '<path d="M10 46 L6 18 L22 32 L32 12 L42 32 L58 18 L54 46 Z"/><path d="M10 54 H54"/>',
  link: '<path d="M27 37 L37 27"/><path d="M22 30 L16 36 C11 41 11 48 16 53 C21 58 28 58 33 53 L39 47"/><path d="M42 34 L48 28 C53 23 53 16 48 11 C43 6 36 6 31 11 L25 17"/>',
};
const mono = (g, w = 5) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g fill="none" stroke="#ffffff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${g}</g></svg>`;
for (const [k, g] of Object.entries(G)) both(mono(g), path.join(P, 'actions', k), 20);
both(mono('<path d="M32 6 L50 20 L50 44 L32 58 L14 44 L14 20 Z"/><path d="M32 20 L40 32 L32 44 L24 32 Z"/>', 5), path.join(P, 'category'), 28);
// Plugin icon (marketplace / plugin list)
const { logo: plugin } = require('./logo');
both(plugin, path.join(P, 'plugin'), 256);
// Default key images
both(R.glyphKey({ glyphName: 'chart', label: 'Price', sub: 'live', accent: R.ACCENT.Currency }), path.join(P, 'keys', 'price'), 72);
both(R.checkIdle(), path.join(P, 'keys', 'pricecheck'), 72);
both(R.glyphKey({ glyphName: 'up', label: 'Movers', sub: '7-day change', accent: R.ACCENT.movers }), path.join(P, 'keys', 'movers'), 72);
both(R.leagueKey({ league: 'Path of Exile', day: null }), path.join(P, 'keys', 'league'), 72);
both(R.glyphKey({ glyphName: 'chat', label: 'Chat', sub: '/hideout', accent: R.ACCENT.chat }), path.join(P, 'keys', 'chat'), 72);
both(R.glyphKey({ glyphName: 'magnifier', label: 'Regex', sub: 'saved search', accent: R.ACCENT.check }), path.join(P, 'keys', 'regex'), 72);
both(R.glyphKey({ glyphName: 'link', label: 'Link', sub: 'website', accent: R.ACCENT.link }), path.join(P, 'keys', 'link'), 72);
both(R.glyphKey({ glyphName: 'crown', label: 'Boss', sub: 'profit', accent: R.ACCENT.boss }), path.join(P, 'keys', 'boss'), 72);
module.exports = { plugin };
if (require.main === module) { renderPngs(jobs); console.log('assets ok', jobs.length); }
