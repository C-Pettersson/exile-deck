'use strict';
// node tools/render.js [mageblood|divine|gem|card]
// Runs the harness, then writes tools/out/deck_<a|b>_p<0|1>.png (a = first load, b = after key presses).
const path = require('path');
const { execFileSync } = require('child_process');

const clip = process.argv[2] || 'mageblood';
execFileSync(process.execPath, [path.join(__dirname, 'harness.js')], { env: { ...process.env, CLIP: clip }, stdio: 'inherit' });

const { renderPngs } = require('./browser');
const { deck, size } = require('./sheet');
const { w, h } = size();
const jobs = [];
for (const tag of ['a', 'b']) {
  for (const page of [0, 1]) {
    jobs.push({
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 40}" height="${h + 40}"><rect width="100%" height="100%" fill="#000"/>${deck({ tag, page, x: 20, y: 20 })}</svg>`,
      width: w + 40, height: h + 40, file: path.join(__dirname, 'out', `deck_${tag}_p${page}.png`),
    });
  }
}
renderPngs(jobs);
