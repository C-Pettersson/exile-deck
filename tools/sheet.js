'use strict';
// Builds an SVG drawing of one Stream Deck page from the harness output.
const fs = require('fs');
const path = require('path');

const KEYS = path.join(__dirname, 'out', 'keys');
let seq = 0;

function deck({ tag = 'a', page = 0, cols = 8, rows = 4, x = 0, y = 0, key = 144, gap = 18 }) {
  let s = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const f = path.join(KEYS, `${tag}_p${page}_${r}_${c}.svg`);
      const px = x + c * (key + gap);
      const py = y + r * (key + gap);
      const rect = `<rect x="${px}" y="${py}" width="${key}" height="${key}" rx="${key * 0.11}"`;
      if (fs.existsSync(f)) {
        const id = 'k' + seq++;
        s += `<clipPath id="${id}">${rect}/></clipPath>` +
          `<image clip-path="url(#${id})" x="${px}" y="${py}" width="${key}" height="${key}" href="data:image/svg+xml;base64,${fs.readFileSync(f).toString('base64')}"/>`;
      } else {
        s += `${rect} fill="#111"/><text x="${px + key / 2}" y="${py + key / 2 + 8}" text-anchor="middle" font-family="Segoe UI" font-size="${key * 0.18}" fill="#666">page</text>`;
      }
    }
  }
  return s;
}

function size({ cols = 8, rows = 4, key = 144, gap = 18 } = {}) {
  return { w: cols * (key + gap) - gap, h: rows * (key + gap) - gap };
}

module.exports = { deck, size };
