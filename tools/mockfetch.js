// Preloaded into the plugin during tests: serves fixtures instead of the network.
const fs = require('fs'); const path = require('path');
const F = path.join(__dirname, 'fixtures');
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const h = opts.headers || {};
  fs.appendFileSync(path.join(__dirname, 'out', 'fetch.log'), JSON.stringify({ url, ua: h['User-Agent'], inm: h['If-None-Match'] || null }) + '\n');
  let file = null; let type = 'application/json';
  const q = (k) => String(u.searchParams.get(k) || '').replace(/[^A-Za-z0-9-]/g, '');
  if (u.hostname === 'poe.how' && u.pathname === '/api/deck/v1/meta') file = 'meta.json';
  else if (u.hostname === 'poe.how' && u.pathname === '/api/deck/v1/prices') file = `prices_${q('type')}.json`;
  else if (u.hostname === 'poe.how' && u.pathname === '/api/deck/v1/strategies') file = `strategies_${q('category')}.json`;
  else if (u.hostname === 'web.poecdn.com' || (u.hostname === 'poe.how' && u.pathname.startsWith('/strategy/'))) { file = path.join('icons', path.basename(u.pathname)); type = 'image/png'; }
  else return new Response('unexpected request', { status: 403 });
  file = path.join(F, file);
  if (!fs.existsSync(file)) return new Response('{"items":[]}', { status: 200, headers: { 'content-type': 'application/json', etag: '"empty"' } });
  const etag = '"' + fs.statSync(file).size + '"';
  if (h['If-None-Match'] === etag) return new Response(null, { status: 304, headers: { etag } });
  return new Response(fs.readFileSync(file), { status: 200, headers: { 'content-type': type, etag } });
};
