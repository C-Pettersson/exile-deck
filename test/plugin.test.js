'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PLUGIN = path.join(ROOT, 'plugin', 'com.poehow.exile-deck.sdPlugin');
const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'manifest.json'), 'utf8'));
const { DeckApi, safeIcon, safePage } = require(path.join(PLUGIN, 'bin', 'api.js'));
const { parseItem, priceItem } = require(path.join(PLUGIN, 'bin', 'itemtext.js'));
const { cleanRegex, regexProblem } = require(path.join(PLUGIN, 'bin', 'regex.js'));
const { VERSION } = require(path.join(PLUGIN, 'bin', 'version.js'));
const fixture = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', f), 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'exile-deck-test-'));

function withFetch(fn) {
  const real = globalThis.fetch;
  return async () => { try { await fn(); } finally { globalThis.fetch = real; } };
}
const reply = (body, { status = 200, etag } = {}) => new Response(status === 304 ? null : JSON.stringify(body), { status, headers: etag ? { etag } : {} });
function serveFixtures() {
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/meta')) return reply(fixture('meta.json'));
    if (u.pathname.endsWith('/strategies')) return reply(fixture('strategies_bosses.json'));
    const f = `prices_${u.searchParams.get('type')}.json`;
    return reply(fs.existsSync(path.join(ROOT, 'tools', 'fixtures', f)) ? fixture(f) : { items: [] });
  };
}

test('manifest: IDs, version and image files', () => {
  assert.equal(manifest.UUID, 'com.poehow.exile-deck');
  assert.equal(manifest.Version, VERSION + '.0');
  const images = [[manifest.Icon, true], [manifest.CategoryIcon]];
  for (const a of manifest.Actions) {
    assert.ok(a.UUID.startsWith(manifest.UUID + '.'), a.UUID);
    assert.ok(a.Name.length <= 30);
    images.push([a.Icon], [a.States[0].Image]);
  }
  for (const [p] of images) for (const s of ['.png', '@2x.png']) assert.ok(fs.existsSync(path.join(PLUGIN, p + s)), p + s);
});

test('actions that send input cannot be chained in a Multi Action', () => {
  for (const id of ['chat', 'pricecheck', 'regex']) {
    assert.equal(manifest.Actions.find((a) => a.UUID.endsWith('.' + id)).SupportedInMultiActions, false, id);
  }
});

test('only poe.how pages and known image hosts are accepted from API data', () => {
  assert.ok(safeIcon('https://web.poecdn.com/x.png'));
  for (const bad of ['http://web.poecdn.com/x.png', 'https://example.com/x.png', 'file:///c:/x.png', 'https://poe.how.example.com/x', null]) assert.equal(safeIcon(bad), null);
  assert.equal(safePage('javascript:alert(1)', 'F'), 'F');
  assert.equal(safePage('https://poe.how/economy/bosses/aul', 'F'), 'https://poe.how/economy/bosses/aul');
});

test('api: league, prices and bosses from the contract shapes', withFetch(async () => {
  serveFixtures();
  const api = new DeckApi(tmp());
  assert.equal(await api.league(), 'Covens');
  assert.equal(await api.leagueStart('Covens'), Date.parse('2026-11-13T19:00:00Z'));
  assert.equal(await api.leagueStart('Standard'), null);
  assert.equal(await api.divinePrice('Covens'), 197.7);
  assert.equal((await api.findPrice('Covens', 'UniqueAccessory', 'Mageblood', '3 Flasks')).chaos, 32888);
  const bosses = await api.bosses('Covens');
  assert.ok(bosses.length > 10);
  const ranked = DeckApi.ranked(bosses);
  assert.ok(ranked.every((b, i) => i === 0 || ranked[i - 1].profit >= b.profit));
  assert.ok(ranked.every((b) => b.completeness === 'complete'));
  assert.equal(DeckApi.findBoss(bosses, 'uber shaper').title, 'Uber Shaper');
}));

test('api: revalidates with the ETag and serves stale data when offline', withFetch(async () => {
  const dir = tmp();
  const api = new DeckApi(dir);
  const seen = [];
  globalThis.fetch = async (url, o) => { seen.push(o.headers['If-None-Match']); return seen.length === 1 ? reply({ n: 1 }, { etag: '"a"' }) : reply(null, { status: 304 }); };
  const url = api.url('meta');
  assert.deepEqual(await api.json(url, 0), { n: 1 });
  assert.deepEqual(await api.json(url, 0), { n: 1 });
  assert.deepEqual(seen, [undefined, '"a"']);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual(await api.json(url, 0), { n: 1 });
  assert.equal(api.lastError, 'offline');
}));

test('price check: matches clipboard text to the right entry', withFetch(async () => {
  serveFixtures();
  const api = new DeckApi(tmp());
  const check = async (f) => (await priceItem(api, 'Covens', parseItem(fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8')))).entry;
  assert.equal((await check('clip_mageblood.txt')).variant, '4 Flasks');
  assert.equal((await check('clip_divine.txt')).name, 'Divine Orb');
  assert.equal((await check('clip_gem.txt')).name, 'Awakened Empower Support');
  assert.equal((await check('clip_card.txt')).type, 'DivinationCard');
  assert.equal(parseItem('hello'), null);
}));

test('regex: kept as is, never shortened', () => {
  assert.equal(cleanRegex('  "!reflect|no regen" "m q"\n'), '"!reflect|no regen" "m q"');
  assert.equal(cleanRegex(' \n '), null);
  assert.equal(regexProblem(''), 'empty');
  assert.equal(regexProblem('x'.repeat(250)), null);
  assert.equal(regexProblem('x'.repeat(251)), 'too long');
});

test('regex: only a hold saves the clipboard to an empty key', () => {
  const clip = path.join(tmp(), 'clip.txt');
  fs.writeFileSync(clip, '"!reflect|no regen"\n');
  const script = `
    const p = require(process.argv[1]);
    const on = (event, payload = {}) => p.onMessage(JSON.stringify({ event, action: 'com.poehow.exile-deck.regex', context: 'c', payload }));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      on('willAppear', { settings: {} });
      on('keyDown'); on('keyUp'); await wait(50);
      const afterPress = p.keys.get('c').settings.regex;
      on('keyDown'); await wait(650); on('keyUp'); await wait(50);
      console.log(JSON.stringify([afterPress, p.keys.get('c').settings.regex]));
      process.exit(0);
    })();`;
  const out = execFileSync(process.execPath, ['-e', script, path.join(PLUGIN, 'bin', 'plugin.js')],
    { encoding: 'utf8', env: { ...process.env, EXILE_DECK_DATA: tmp(), EXILE_DECK_STUB_CLIP: clip } });
  assert.deepEqual(JSON.parse(out.trim()), ['', '"!reflect|no regen"']);
});

test('end to end: plugin against a fake Stream Deck', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'harness.js')], { timeout: 30000 });
  const out = path.join(ROOT, 'tools', 'out');
  const keys = fs.readdirSync(path.join(out, 'keys')).filter((f) => f.startsWith('a_'));
  assert.equal(keys.length, 62); // two pages of 32 keys minus the two page-navigation keys
  for (const f of keys) assert.doesNotMatch(fs.readFileSync(path.join(out, 'keys', f), 'utf8'), />Error</, f);
  const hosts = new Set(fs.readFileSync(path.join(out, 'fetch.log'), 'utf8').trim().split('\n').map((l) => new URL(JSON.parse(l).url).hostname));
  assert.deepEqual([...hosts].sort(), ['poe.how', 'web.poecdn.com']);
  const sent = fs.readFileSync(path.join(out, 'input.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => /search|setclip/.test(x.cmd));
  assert.deepEqual(sent, [{ cmd: 'search', text: '"!reflect|no regen"' }, { cmd: 'setclip', text: '"!reflect|no regen"' }]);
  assert.match(fs.readFileSync(path.join(out, 'urls.log'), 'utf8'), /pathofexile\.com\/trade\/search\/Covens\?q=.*Mageblood/);
});
