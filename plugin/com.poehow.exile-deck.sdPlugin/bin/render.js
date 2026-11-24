'use strict';
// SVG key renderer (144x144, sent to Stream Deck as a base64 data URL).

const FONT = 'Segoe UI';
const C = {
  text: '#f3ead8', dim: '#a49883', faint: '#6f6656', up: '#62d36f', down: '#f0604f', flat: '#b3ab9c',
  bg1: '#1e1a14', bg2: '#0b0a08', gold: '#d6b56d',
};
const ACCENT = {
  Currency: '#d6b56d', DivinationCard: '#55b9ec', SkillGem: '#36c2b4', ImbuedGem: '#36c2b4',
  Unique: '#e07b39', Map: '#c9c9c9', league: '#a774f2', chat: '#5cc6a6', link: '#73a3f2', check: '#ef8f3d',
  movers: '#d6b56d', error: '#f0604f', boss: '#e39b45',
};
const accentFor = (type) => ACCENT[type] || (/^Unique/.test(type) ? ACCENT.Unique : /Map$/.test(type) ? ACCENT.Map : ACCENT.Currency);

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** Pick a font size so `text` fits `maxW` px (rough average glyph width for Segoe UI bold). */
function fit(text, maxW, maxSize, k = 0.6, min = 11) {
  const n = Math.max(1, [...String(text)].length);
  return Math.max(min, Math.min(maxSize, Math.floor(maxW / (n * k))));
}
function clip(text, maxChars) {
  const a = [...String(text)];
  return a.length <= maxChars ? a.join('') : a.slice(0, maxChars - 1).join('') + '…';
}
/** Greedy word wrap into at most `maxLines` lines of ~`width` chars (last line clipped). */
function wrap(text, width, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= width) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) lines.splice(maxLines - 1, lines.length, lines.slice(maxLines - 1).join(' '));
  return lines.map((l) => clip(l, width + 1));
}
function txt(x, y, s, size, fill, { anchor = 'middle', weight = 'bold', opacity } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}"${opacity != null ? ` fill-opacity="${opacity}"` : ''}>${esc(s)}</text>`;
}
function img(href, x, y, w, h, opacity) {
  return `<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"${opacity != null ? ` opacity="${opacity}"` : ''} href="${href}" xlink:href="${href}"/>`;
}

function frame(accent, inner, { glowY = 48, glow = 0.3 } = {}) {
  return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="144" height="144" viewBox="0 0 144 144">' +
    '<defs>' +
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.bg1}"/><stop offset="1" stop-color="${C.bg2}"/></linearGradient>` +
    `<radialGradient id="gl" cx="72" cy="${glowY}" r="74" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${accent}" stop-opacity="${glow}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>` +
    '</defs>' +
    '<rect width="144" height="144" fill="url(#bg)"/><rect width="144" height="144" fill="url(#gl)"/>' +
    `<rect x="3" y="3" width="138" height="138" rx="16" fill="none" stroke="${accent}" stroke-opacity="0.5" stroke-width="2.5"/>` +
    inner + '</svg>';
}

function toDataUrl(svg) {
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

// ---------- numbers ----------
function trimNum(s) { return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s; }
function fmtNum(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return trimNum((v / 1e6).toFixed(a >= 1e7 ? 0 : 1)) + 'M';
  if (a >= 1e4) return trimNum((v / 1e3).toFixed(a >= 1e5 ? 0 : 1)) + 'k';
  if (a >= 1000) return Math.round(v).toLocaleString('en-US');
  if (a >= 100) return String(Math.round(v));
  if (a >= 10) return trimNum(v.toFixed(1));
  if (a >= 1) return trimNum(v.toFixed(2));
  return trimNum(v.toFixed(a >= 0.1 ? 2 : 3));
}
/** Main + secondary price strings. Shows divines once the value passes ~1 div. */
function priceText(chaos, divPrice, { preferChaos = false } = {}) {
  if (chaos == null) return { main: '—', sub: '' };
  const c = (v) => { const s = fmtNum(v); return /[kM]$/.test(s) ? s + ' c' : s + 'c'; };
  if (!preferChaos && divPrice && chaos >= divPrice * 0.95) {
    return { main: fmtNum(chaos / divPrice) + ' div', sub: c(chaos) };
  }
  return { main: c(chaos), sub: divPrice ? fmtNum(chaos / divPrice) + ' div' : '' };
}
function changeText(ch) {
  if (ch == null) return { s: '', col: C.flat };
  const a = Math.abs(ch);
  const v = a >= 100 ? Math.round(a) : a >= 10 ? Math.round(a) : trimNum(a.toFixed(1));
  if (a < 0.5) return { s: '±0%', col: C.flat };
  return ch > 0 ? { s: '▲' + v + '%', col: C.up } : { s: '▼' + v + '%', col: C.down };
}

// ---------- sparkline ----------
function spark(data, x0, y0, w, h, color, { strokeW = 3, fillOpacity = 0.2 } = {}) {
  let pts = (data || []).filter((v) => v != null && isFinite(v)).map(Number);
  if (!pts.length) return '';
  if (pts[0] !== 0) pts = [0, ...pts];
  if (pts.length < 2) return '';
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const xy = pts.map((v, i) => [x0 + (i * w) / (pts.length - 1), y0 + h - ((v - min) / span) * h]);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `M${x0},${y0 + h} L${line.replace(/ /g, ' L')} L${x0 + w},${y0 + h} Z`;
  return `<path d="${area}" fill="${color}" fill-opacity="${fillOpacity}"/>` +
    `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

// ---------- glyphs (64x64 line art) ----------
const G = {
  home: '<path d="M8 30 L32 9 L56 30"/><path d="M15 25 V55 H49 V25"/><path d="M27 55 V40 H37 V55"/>',
  ship: '<path d="M32 6 V44"/><path d="M34 9 L52 38 H34 Z"/><path d="M30 15 L14 38 H30"/><path d="M7 45 H57 L48 57 H16 Z"/>',
  paw: '<ellipse cx="32" cy="43" rx="13" ry="11"/><circle cx="15" cy="27" r="5.5"/><circle cx="26" cy="16" r="5.5"/><circle cx="38" cy="16" r="5.5"/><circle cx="49" cy="27" r="5.5"/>',
  pick: '<path d="M9 23 Q32 3 55 23"/><path d="M14 24 Q32 12 50 24"/><path d="M32 15 V58"/>',
  skull: '<path d="M32 7 C18 7 10 16 10 28 C10 36 14 40 18 42 V52 H46 V42 C50 40 54 36 54 28 C54 16 46 7 32 7 Z"/><circle cx="23" cy="29" r="5"/><circle cx="41" cy="29" r="5"/><path d="M26 52 V45 M32 52 V45 M38 52 V45"/>',
  bell: '<path d="M18 44 V30 C18 21 24 14 32 14 C40 14 46 21 46 30 V44 L51 49 H13 Z"/><path d="M27 54 C28 58 36 58 37 54"/><path d="M10 10 L54 56"/>',
  tree: '<path d="M32 12 L16 32 M32 12 L48 32 M16 32 L32 52 M48 32 L32 52 M16 32 H48"/><circle cx="32" cy="12" r="6"/><circle cx="16" cy="32" r="6"/><circle cx="48" cy="32" r="6"/><circle cx="32" cy="52" r="6"/>',
  door: '<path d="M38 12 V8 H12 V56 H38 V52"/><path d="M28 32 H58"/><path d="M49 22 L59 32 L49 42"/>',
  chart: '<path d="M9 9 V55 H57"/><path d="M15 44 L27 30 L37 37 L53 16"/><path d="M44 16 H53 V25"/>',
  sword: '<path d="M54 10 L26 38"/><path d="M54 10 L46 11 L23 34 M54 10 L53 18 L30 41"/><path d="M16 30 L34 48"/><path d="M22 42 L10 54"/>',
  person: '<circle cx="32" cy="21" r="11"/><path d="M11 57 C11 41 20 35 32 35 C44 35 53 41 53 57"/>',
  scales: '<path d="M32 8 V54"/><path d="M20 54 H44"/><path d="M10 16 H54"/><path d="M10 16 L4 34 H16 Z"/><path d="M54 16 L48 34 H60 Z"/>',
  book: '<path d="M32 15 C25 9 15 9 7 11 V53 C15 51 25 51 32 57 C39 51 49 51 57 53 V11 C49 9 39 9 32 15 Z"/><path d="M32 15 V57"/>',
  db: '<ellipse cx="32" cy="14" rx="21" ry="7"/><path d="M11 14 V50 C11 54 20 57 32 57 C44 57 53 54 53 50 V14"/><path d="M11 32 C11 36 20 39 32 39 C44 39 53 36 53 32"/>',
  anvil: '<path d="M6 22 H50 C54 22 58 26 58 30 H40 C38 34 36 36 36 40 V46 H44 V54 H18 V46 H26 V40 C26 36 22 32 14 30 C8 29 6 26 6 22 Z"/><path d="M40 6 L34 14 M50 8 L46 16 M30 4 L30 12"/>',
  scroll: '<path d="M18 8 H50 C54 8 56 10 56 14 V18 H48"/><path d="M48 14 V52 C48 56 46 58 42 58 H12 C8 58 6 56 6 52 V48 H38 V52 C38 56 40 58 42 58"/><path d="M18 8 C14 8 12 10 12 14 V48"/><path d="M22 22 H40 M22 31 H40 M22 40 H34"/>',
  magnifier: '<circle cx="27" cy="27" r="17"/><path d="M40 40 L56 56"/><path d="M21 27 H33 M27 21 V33"/>',
  up: '<path d="M8 50 L24 34 L34 42 L56 18"/><path d="M44 18 H56 V30"/>',
  down: '<path d="M8 18 L24 34 L34 26 L56 50"/><path d="M44 50 H56 V38"/>',
  crown: '<path d="M10 46 L6 18 L22 32 L32 12 L42 32 L58 18 L54 46 Z"/><path d="M10 54 H54"/>',
  question: '<path d="M22 22 C22 14 28 10 33 10 C40 10 44 15 44 21 C44 30 33 30 33 40"/><circle cx="33" cy="52" r="2.5"/>',
  link: '<path d="M27 37 L37 27"/><path d="M22 30 L16 36 C11 41 11 48 16 53 C21 58 28 58 33 53 L39 47"/><path d="M42 34 L48 28 C53 23 53 16 48 11 C43 6 36 6 31 11 L25 17"/>',
  chat: '<path d="M10 12 H54 V42 H30 L18 54 V42 H10 Z"/><path d="M20 24 H44 M20 32 H36"/>',
  card: '<rect x="13" y="5" width="38" height="54" rx="4"/><rect x="19" y="11" width="26" height="20" rx="1"/><path d="M19 39 H45 M19 46 H45 M23 53 H41"/>',
  orb: '<circle cx="32" cy="32" r="22"/><path d="M22 26 C24 20 29 17 34 17"/>',
};
const GLYPHS = Object.keys(G);

function glyph(name, color, x, y, size, { width = 4.5 } = {}) {
  const g = G[name] || G.question;
  const s = size / 64;
  return `<g transform="translate(${x},${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${g}</g>`;
}

// ---------- keys ----------
function priceKey({ name, icon, chaos, divPrice, change, sparkData, type, isDivine, missing, stale }) {
  const accent = accentFor(type);
  if (missing) {
    return frame(C.faint, glyph('question', C.dim, 44, 14, 56) +
      txt(72, 100, clip(name || 'Unknown', 16), fit(clip(name || 'Unknown', 16), 128, 18), C.dim) +
      txt(72, 126, 'no price', 15, C.faint, { weight: 'normal' }));
  }
  const ch = changeText(change);
  const p = priceText(chaos, divPrice, { preferChaos: isDivine });
  let inner = spark(sparkData, 10, 72, 124, 28, ch.col, { strokeW: 3, fillOpacity: 0.18 });
  if (icon) {
    inner += img(icon, 8, 6, 62, 62);
    if (ch.s) {
      inner += txt(134, 34, ch.s, fit(ch.s, 66, 21, 0.62), ch.col, { anchor: 'end' });
      inner += txt(134, 56, '7 days', 13, C.faint, { anchor: 'end', weight: 'normal' });
    }
  } else {
    // No icon available (e.g. divination cards): draw a glyph and put the name on the right.
    inner += glyph(type === 'DivinationCard' ? 'card' : 'orb', accent, 4, 6, 58, { width: 4 });
    if (ch.s) inner += txt(136, 28, ch.s, fit(ch.s, 70, 19, 0.62), ch.col, { anchor: 'end' });
    wrap(name, 11, 2).forEach((l, i) => { inner += txt(136, 46 + i * 15, l, 13, C.text, { anchor: 'end', weight: 'normal' }); });
  }
  inner += txt(72, 134, p.main, fit(p.main, 132, 38, 0.58), C.text);
  if (stale) inner += '<circle cx="15" cy="15" r="5" fill="#f0604f"/>';
  return frame(accent, inner);
}

function chartKey({ name, chaos, divPrice, change, sparkData, type }) {
  const ch = changeText(change);
  const p = priceText(chaos, divPrice);
  const title = clip(name, 18);
  let inner = txt(72, 24, title, fit(title, 128, 16), C.dim);
  inner += spark(sparkData, 10, 32, 124, 58, ch.col, { strokeW: 3.5, fillOpacity: 0.22 });
  inner += txt(72, 112, ch.s ? '7d ' + ch.s : '7d n/a', 18, ch.col);
  const line = p.sub ? `${p.main} · ${p.sub}` : p.main;
  inner += txt(72, 134, line, fit(line, 130, 17), C.text);
  return frame(accentFor(type), inner, { glow: 0.18 });
}

function leagueKey({ league, day, divPrice, divIcon, offline }) {
  const accent = ACCENT.league;
  const nm = String(league || '').toUpperCase();
  let inner = txt(72, 36, nm, fit(nm, 128, 26, 0.68), '#cdb3fb');
  inner += day ? txt(72, 90, 'DAY ' + day, fit('DAY ' + day, 130, 40, 0.62), C.text) : txt(72, 88, 'LEAGUE', 30, C.text);
  if (divPrice) {
    const s = fmtNum(divPrice) + 'c';
    if (divIcon) inner += img(divIcon, 30, 106, 30, 30) + txt(64, 130, s, 22, C.gold, { anchor: 'start' });
    else inner += txt(72, 130, '1 div = ' + s, 18, C.gold);
  }
  if (offline) inner += '<circle cx="15" cy="15" r="5" fill="#f0604f"/>';
  return frame(accent, inner, { glowY: 70, glow: 0.34 });
}

function checkIdle({ hint = 'hover + press' } = {}) {
  const a = ACCENT.check;
  return frame(a, glyph('magnifier', a, 38, 8, 68, { width: 5 }) +
    txt(72, 106, 'Price check', 21, C.text) + txt(72, 128, hint, 14, C.dim, { weight: 'normal' }));
}
function checkBusy() {
  const a = ACCENT.check;
  return frame(a, glyph('magnifier', a, 38, 8, 68, { width: 5 }) + txt(72, 112, 'checking…', 20, C.dim));
}
function checkResult({ name, variant, icon, chaos, divPrice, stack, type, isDivine }) {
  const accent = accentFor(type);
  const p = priceText(chaos, divPrice, { preferChaos: isDivine });
  let inner = icon ? img(icon, 44, 6, 56, 56) : glyph(type === 'DivinationCard' ? 'card' : 'orb', accent, 44, 6, 56, { width: 4 });
  const nm = clip(name, 17);
  inner += txt(72, 80, nm, fit(nm, 130, 16), C.dim);
  inner += txt(72, 114, p.main, fit(p.main, 132, 34, 0.58), C.text);
  let sub = isDivine ? '' : p.sub;
  if (variant) sub = sub ? `${variant} · ${sub}` : variant;
  if (stack && stack > 1 && chaos) {
    const t = priceText(chaos * stack, divPrice);
    sub = `×${fmtNum(stack)} = ${t.main}`;
  }
  if (sub) inner += txt(72, 135, sub, fit(sub, 130, 16), C.gold);
  return frame(accent, inner);
}
function checkMessage(title, detail, color = C.down) {
  return frame(color, glyph('question', color, 44, 8, 52) +
    txt(72, 96, clip(title, 14), fit(clip(title, 14), 130, 21), C.text) +
    (detail ? txt(72, 122, clip(detail, 18), fit(clip(detail, 18), 130, 14), C.dim, { weight: 'normal' }) : ''));
}

function moversKey({ direction, entry, icon, rank, total, divPrice }) {
  const up = direction !== 'down';
  const head = up ? 'TOP RISER' : 'TOP FALLER';
  if (!entry) {
    return frame(C.faint, glyph(up ? 'up' : 'down', C.dim, 40, 24, 64) + txt(72, 22, head, 14, C.dim) + txt(72, 122, 'no data', 16, C.faint));
  }
  const ch = changeText(entry.change);
  let inner = txt(14, 22, head, 13, C.dim, { anchor: 'start' }) + txt(132, 22, `${rank}/${total}`, 13, C.faint, { anchor: 'end' });
  inner += icon ? img(icon, 46, 28, 52, 52) : glyph(up ? 'up' : 'down', ch.col, 46, 28, 52);
  inner += txt(72, 110, ch.s, fit(ch.s, 130, 30, 0.6), ch.col);
  const p = priceText(entry.chaos, divPrice);
  const nm = clip(entry.name, 13) + ' ' + p.main;
  inner += txt(72, 132, nm, fit(nm, 132, 14), C.text, { weight: 'normal' });
  return frame(ch.col, inner, { glow: 0.22 });
}

function glyphKey({ glyphName, label, sub, accent }) {
  let inner = glyph(glyphName, accent, 40, 12, 64, { width: 4.5 });
  const l = clip(label || '', 14);
  inner += txt(72, sub ? 104 : 114, l, fit(l, 130, 22), C.text);
  if (sub) { const s = clip(sub, 20); inner += txt(72, 127, s, fit(s, 130, 14), C.dim, { weight: 'normal' }); }
  return frame(accent, inner, { glowY: 44, glow: 0.26 });
}

// ---------- bossing (poe.how) ----------
const QUALITY = {
  complete: null,
  missing_prices: { col: '#e8b04a', label: 'some prices missing' },
  partial: { col: '#e8b04a', label: 'partial data' },
  no_user_data: { col: '#8a8270', label: 'no drop data yet' },
};
function signedPrice(chaos, divPrice) {
  if (chaos == null) return '—';
  const p = priceText(Math.abs(chaos), divPrice);
  return (chaos > 0.5 ? '+' : chaos < -0.5 ? '−' : '') + p.main;
}
function bossKey({ boss, art, divPrice, rank }) {
  if (!boss) return frame(C.faint, glyph('crown', C.dim, 40, 14, 64) + txt(72, 124, 'no boss', 16, C.faint));
  const q = QUALITY[boss.completeness];
  const noData = boss.completeness === 'no_user_data' || (!boss.realData && !boss.ev) || (!boss.ev && !boss.cost);
  const col = noData ? C.flat : boss.profit > 0.5 ? C.up : boss.profit < -0.5 ? C.down : C.flat;
  let inner = art ? img(art, 34, 2, 76, 76) : glyph('crown', ACCENT.boss, 42, 10, 60, { width: 4 });
  if (rank) inner += `<rect x="9" y="9" width="${rank >= 10 ? 38 : 30}" height="22" rx="11" fill="#000" fill-opacity="0.55"/>` + txt(rank >= 10 ? 28 : 24, 26, '#' + rank, 15, C.gold);
  let base = boss.short;
  const uber = /^Uber /.test(base);
  if (uber) base = base.slice(5);
  base = base.replace(/^The /, '').replace(/Incarnation of /, 'Inc. of ');
  if (uber) inner += '<rect x="92" y="9" width="44" height="20" rx="10" fill="#ff8a5c" fill-opacity="0.9"/>' + txt(114, 24, 'UBER', 12, '#1a0f08');
  if (q) inner += `<circle cx="${uber ? 129 : 129}" cy="${uber ? 40 : 17}" r="6" fill="${q.col}"/>`;
  const nm = clip(base, 16);
  inner += txt(72, 96, nm, fit(nm, 130, 16), C.text);
  const main = noData ? (boss.missingPrices ? 'no price' : 'no data') : signedPrice(boss.profit, divPrice);
  inner += txt(72, 130, main, fit(main, 132, 30, 0.6), col);
  return frame(noData ? C.faint : col, inner, { glowY: 40, glow: noData ? 0.12 : 0.24 });
}
function bossDetail({ boss, divPrice }) {
  const row = (y, label, value, color = C.text) =>
    txt(14, y, label, 14, C.dim, { anchor: 'start', weight: 'normal' }) + txt(132, y, value, fit(value, 80, 16, 0.58), color, { anchor: 'end' });
  const nm = clip(boss.short, 18);
  let inner = txt(72, 24, nm, fit(nm, 128, 16), C.gold);
  const p = (v) => priceText(v, divPrice).main;
  inner += row(48, 'Cost', p(boss.cost));
  inner += row(68, 'Loot', p(boss.ev));
  const col = boss.profit > 0.5 ? C.up : boss.profit < -0.5 ? C.down : C.flat;
  inner += row(90, 'Profit', signedPrice(boss.profit, divPrice), col);
  inner += row(112, 'Runs', String(boss.runs));
  const be = boss.breakEvenRuns != null ? boss.breakEvenRuns + ' runs' : boss.profit > 0 ? '—' : 'never';
  inner += row(132, 'Payback', be, C.dim);
  return frame(ACCENT.boss, inner, { glow: 0.14 });
}
function bossSummary({ total, profitable, best, divPrice, offline }) {
  const a = ACCENT.boss;
  let inner = txt(72, 30, 'BOSSING', 22, '#f1c27a') + txt(72, 48, 'poe.how', 13, C.dim, { weight: 'normal' });
  inner += txt(72, 84, `${profitable}/${total}`, 30, C.text) + txt(72, 102, 'profitable', 13, C.dim, { weight: 'normal' });
  if (best) {
    const s = `${clip(best.short, 9)} ${signedPrice(best.profit, divPrice)}`;
    inner += txt(72, 128, s, fit(s, 130, 15), C.up);
  }
  if (offline) inner += '<circle cx="15" cy="15" r="5" fill="#f0604f"/>';
  return frame(a, inner, { glowY: 70, glow: 0.3 });
}

function errorKey(kind, msg) {
  return checkMessage(kind || 'Error', msg || '', C.down);
}

module.exports = {
  toDataUrl, priceKey, chartKey, leagueKey, checkIdle, checkBusy, checkResult, checkMessage, moversKey,
  glyphKey, errorKey, fmtNum, priceText, changeText, accentFor, ACCENT, GLYPHS, bossKey, bossDetail, bossSummary,
};
