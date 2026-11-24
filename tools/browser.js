'use strict';
// Renders SVG to PNG with an installed Edge/Chrome (headless), so no image tools are needed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const CANDIDATES = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function run(html) {
  const exe = CANDIDATES.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('No Edge/Chrome found; set BROWSER_PATH');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exile-deck-render-'));
  try {
    const page = path.join(dir, 'page.html');
    fs.writeFileSync(page, html);
    return execFileSync(exe, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${path.join(dir, 'profile')}`,
      '--force-device-scale-factor=1', '--virtual-time-budget=10000', '--dump-dom', pathToFileURL(page).href],
    { encoding: 'utf8', maxBuffer: 256e6, stdio: ['ignore', 'pipe', 'ignore'], timeout: 90000 });
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch (_) { /* profile still locked */ }
  }
}

/** jobs: [{ svg, width, height, file }] rendered to exact-size transparent PNGs. */
function renderPngs(jobs) {
  const data = jobs.map((j) => ({ src: 'data:image/svg+xml;base64,' + Buffer.from(j.svg).toString('base64'), w: j.width, h: j.height }));
  const html = `<!doctype html><meta charset="utf-8"><pre id="o">pending</pre><script>
  (async () => {
    const out = [];
    for (const j of ${JSON.stringify(data)}) {
      const i = new Image(); i.src = j.src; await i.decode();
      const c = document.createElement('canvas'); c.width = j.w; c.height = j.h;
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(i, 0, 0, j.w, j.h);
      out.push(c.toDataURL('image/png'));
    }
    document.getElementById('o').textContent = 'BEGIN' + out.join(' ') + 'FINISH';
  })();
  </script>`;
  const m = /BEGIN(data:[^<]*)FINISH/.exec(run(html));
  if (!m) throw new Error('render failed');
  const parts = m[1].trim().split(' ');
  if (parts.length !== jobs.length) throw new Error(`expected ${jobs.length} images, got ${parts.length}`);
  jobs.forEach((j, i) => {
    fs.mkdirSync(path.dirname(j.file), { recursive: true });
    fs.writeFileSync(j.file, Buffer.from(parts[i].split(',')[1], 'base64'));
  });
}

module.exports = { renderPngs };
