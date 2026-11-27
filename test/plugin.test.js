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
const { DeckApi, tradeLeague, activeLeague, EXCHANGE_TYPES, safeIcon, safePage } = require(path.join(PLUGIN, 'bin', 'api.js'));
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
  // Maker Console refuses anything lower. They also turn on DRM, which makes the plugin folder read-only.
  assert.equal(manifest.SDKVersion, 3);
  assert.equal(manifest.Software.MinimumVersion, '6.9');
  const images = [[manifest.Icon, true], [manifest.CategoryIcon]];
  for (const a of manifest.Actions) {
    assert.ok(a.UUID.startsWith(manifest.UUID + '.'), a.UUID);
    assert.ok(a.Name.length <= 30);
    images.push([a.Icon], [a.States[0].Image]);
  }
  for (const [p] of images) for (const s of ['.png', '@2x.png']) assert.ok(fs.existsSync(path.join(PLUGIN, p + s)), p + s);
});

test('the GGG disclaimer is in the README, manifest and settings page', () => {
  const line = "This product isn't affiliated with or endorsed by Grinding Gear Games in any way.";
  assert.ok(manifest.Description.includes(line));
  for (const f of ['README.md', 'plugin/com.poehow.exile-deck.sdPlugin/pi/index.html']) assert.ok(fs.readFileSync(path.join(ROOT, f), 'utf8').includes(line), f);
});

test('actions that send input cannot be chained in a Multi Action', () => {
  for (const id of ['chat', 'pricecheck', 'regex']) {
    assert.equal(manifest.Actions.find((a) => a.UUID.endsWith('.' + id)).SupportedInMultiActions, false, id);
  }
});

test('the poe.how logo is an icon choice for keys and draws in gold', () => {
  const R = require(path.join(PLUGIN, 'bin', 'render.js'));
  assert.equal(R.GLYPHS[0], 'poehow');
  const svg = R.glyphKey({ glyphName: 'poehow', label: 'poe.how', sub: 'poe.how', accent: R.ACCENT.link });
  for (const d of R.LOGO_FIGURE) assert.ok(svg.includes(d));
  assert.ok(!svg.includes(R.ACCENT.link), 'the frame uses gold, not the link colour');
  assert.ok(fs.readFileSync(path.join(PLUGIN, 'pi', 'index.html'), 'utf8').includes("GLYPHS_FALLBACK = ['poehow'"));
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

test('leagues: SSF uses its trade league and Ruthless is not offered', withFetch(async () => {
  serveFixtures();
  const api = new DeckApi(tmp());
  assert.ok(!(await api.choices()).some((id) => /Ruthless/.test(id)));
  for (const [chosen, priced] of [['SSF Covens', 'Covens'], ['HC SSF Covens', 'Hardcore Covens'], ['Covens', 'Covens'], ['Standard', 'Standard']]) {
    api.leagueOverride = chosen;
    assert.equal(await api.league(), priced);
    assert.equal(await api.selectedLeague(), chosen);
  }
  // Unlisted SSF ids still map when the trade league is known, and an unknown league is left alone.
  assert.equal(tradeLeague('SSF Standard', await api.leagues()), 'Standard');
  assert.equal(tradeLeague('SSF Hardcore', await api.leagues()), 'Hardcore');
  assert.equal(tradeLeague('SSF Nowhere', await api.leagues()), 'SSF Nowhere');
}));

const league = (id, flags = {}) => ({ id, hardcore: false, ssf: false, ruthless: false, current: false, ...flags });
const LIVE_LEAGUES = [
  league('Standard'), league('Hardcore', { hardcore: true }), league('Solo Self-Found', { ssf: true }),
  league('Hardcore SSF', { hardcore: true, ssf: true }),
  league('Covens', { current: true }), league('Hardcore Covens', { current: true, hardcore: true }),
  league('SSF Covens', { current: true, ssf: true }), league('HC SSF Covens', { current: true, hardcore: true, ssf: true }),
  league('Ruthless Covens', { current: true, ruthless: true }),
];

test('leagues: the permanent solo leagues use Standard and Hardcore prices', () => {
  for (const [chosen, priced] of [['Solo Self-Found', 'Standard'], ['Hardcore SSF', 'Hardcore'], ['SSF Covens', 'Covens'], ['HC SSF Covens', 'Hardcore Covens'], ['Standard', 'Standard'], ['Hardcore', 'Hardcore']]) {
    assert.equal(tradeLeague(chosen, LIVE_LEAGUES), priced);
  }
});

test('leagues: an ended league falls back to the current one in the same mode', withFetch(async () => {
  const active = (id) => activeLeague(id, LIVE_LEAGUES, 'Covens');
  for (const [chosen, used] of [['Mirage', 'Covens'], ['Hardcore Mirage', 'Hardcore Covens'], ['SSF Mirage', 'SSF Covens'], ['HC SSF Mirage', 'HC SSF Covens'], ['Ruthless Covens', 'Covens']]) {
    assert.equal(active(chosen), used);
  }
  for (const id of ['Standard', 'Solo Self-Found', 'Hardcore Covens', 'SSF Standard', 'HC SSF Covens']) assert.equal(active(id), id);
  // Between leagues there is no current one: use what the API names. Without a list, keep the choice.
  assert.equal(activeLeague('Hardcore Mirage', LIVE_LEAGUES.filter((l) => !l.current), 'Standard'), 'Standard');
  assert.equal(activeLeague('Mirage', [], undefined), 'Mirage');

  globalThis.fetch = async () => reply({ leagues: LIVE_LEAGUES, currentLeague: 'Covens' });
  const api = new DeckApi(tmp());
  api.leagueOverride = 'HC SSF Mirage';
  assert.equal(await api.selectedLeague(), 'HC SSF Covens');
  assert.equal(await api.league(), 'Hardcore Covens');
  globalThis.fetch = async () => { throw new Error('offline'); };
  const offline = new DeckApi(tmp());
  offline.leagueOverride = 'Mirage';
  assert.equal(await offline.league(), 'Mirage');
}));

test('bosses: unknown values stay unknown instead of becoming zero', withFetch(async () => {
  globalThis.fetch = async () => reply({ items: [{ id: 1, title: 'Test Boss', cost: null, ev: 5, profit: null, runs: 500, completeness: 'complete', realData: true }] });
  const [boss] = await new DeckApi(tmp()).bosses('Covens');
  assert.equal(boss.profit, null);
  assert.deepEqual(DeckApi.ranked([boss]), []);
  const R = require(path.join(PLUGIN, 'bin', 'render.js'));
  assert.match(R.bossKey({ boss, art: null, divPrice: 200 }), />no data</);
  assert.doesNotMatch(R.bossDetail({ boss, divPrice: 200 }), />0c</);
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

test('price check: threads, crystals and ducats are looked up in their own category first', withFetch(async () => {
  const names = { Thread: 'Abyss Thread', EnshroudingCrystal: 'Afarud Enshrouding Crystal', Ducat: "Merrick's Ducat" };
  const seen = [];
  globalThis.fetch = async (url) => {
    const type = new URL(url).searchParams.get('type');
    seen.push(type);
    return reply({ items: names[type] ? [{ id: type, name: names[type], value: 5 }] : [] });
  };
  for (const [type, name] of Object.entries(names)) {
    assert.ok(EXCHANGE_TYPES.includes(type));
    for (const itemClass of ['Map Fragments', 'Stackable Currency']) {
      seen.length = 0;
      const hit = await priceItem(new DeckApi(tmp()), 'Covens', parseItem(`Item Class: ${itemClass}\nRarity: Currency\n${name}\n--------\nStack Size: 1/10\n`));
      assert.equal(hit.type, type);
      assert.deepEqual(seen, [type]);
    }
  }
}));

test('price check: viscera only match with the modifier on the item', withFetch(async () => {
  const items = [
    { id: 'a', name: "Coven Queen's Crown", variant: '+# to maximum number of Spectres', value: 33411, count: 31 },
    { id: 'b', name: "Coven Queen's Crown", variant: '#% more Maximum Life', value: 1807, count: 371 },
  ];
  globalThis.fetch = async () => reply({ items });
  const check = (mod) => priceItem(new DeckApi(tmp()), 'Covens', parseItem(`Item Class: Viscera\nCoven Queen's Crown\n--------\nCrown\n--------\n{ Implicit Modifier }\n${mod}\n`));
  assert.equal((await check('+1 to maximum number of Spectres')).entry.id, 'a');
  assert.equal((await check('12% more Maximum Life (implicit)')).entry.id, 'b');
  assert.equal((await check('12(10-15)% more Maximum Life')).entry.id, 'b');
  assert.equal(await check('8% more Maximum Life and Mana'), null);
}));

test('price check: viscera text as the game copies it', withFetch(async () => {
  const items = [
    { id: 'greater', name: 'Greater Dessicated Head', variant: '+# to maximum number of Raised Zombies', value: 1, count: 2 },
    { id: 'head', name: 'Dessicated Head', variant: 'Raised Zombies deal #% increased Damage', value: 1, count: 3 },
    { id: 'legs', name: 'Two Legs', variant: '#% reduced bonuses gained from Equipped Boots / #% increased bonuses gained from Equipped Gloves', value: 9, count: 1 },
  ];
  globalThis.fetch = async () => reply({ items });
  const check = (text) => priceItem(new DeckApi(tmp()), 'Covens', parseItem(text));
  assert.equal((await check(fs.readFileSync(path.join(ROOT, 'tools', 'clip_viscera.txt'), 'utf8'))).entry.id, 'head');
  const legs = 'Item Class: Viscera\nTwo Legs\n--------\n50(40-60)% reduced bonuses gained from Equipped Boots\n';
  assert.equal(await check(legs), null);
  assert.equal((await check(legs + '25(-10--30)% increased bonuses gained from Equipped Gloves\n')).entry.id, 'legs');
  // Text without a rarity is still not an item in any other class.
  assert.equal(parseItem('Item Class: Belts\nHeavy Belt\n'), null);
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
