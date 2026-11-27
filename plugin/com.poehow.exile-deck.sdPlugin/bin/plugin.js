'use strict';
// Exile Deck: Stream Deck plugin (SDK v2, Node 20, no dependencies).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MiniWebSocket } = require('./ws');
const { DeckApi, EXCHANGE_TYPES, ITEM_TYPES, eq, SITE } = require('./api');
const { parseItem, priceItem } = require('./itemtext');
const { InputHelper } = require('./input');
const { cleanRegex, regexProblem } = require('./regex');
const { VERSION } = require('./version');
const R = require('./render');

// Runtime files live outside the plugin folder: that folder is replaced on every update.
const DATA_DIR = process.env.EXILE_DECK_DATA || path.join(process.env.LOCALAPPDATA || os.homedir(), 'ExileDeck');
const PREFIX = 'com.poehow.exile-deck.';
const LONG_PRESS_MS = 550;
const RESULT_MS = 15000;
const TICK_MS = 60000;

// ---------- logging ----------
const LOG_DIR = path.join(DATA_DIR, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, 'plugin.log');
try { if (fs.statSync(LOG_FILE).size > 1e6) fs.renameSync(LOG_FILE, LOG_FILE + '.old'); } catch (_) {}
function log(...a) {
  const line = new Date().toISOString() + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
  if (process.env.EXILE_DECK_DEBUG) console.log(line);
}
process.on('uncaughtException', (e) => log('uncaught', (e && e.stack) || String(e)));
process.on('unhandledRejection', (e) => log('unhandled', (e && e.stack) || String(e)));

// ---------- args ----------
function arg(name) { const i = process.argv.indexOf('-' + name); return i >= 0 ? process.argv[i + 1] : undefined; }
const port = Number(arg('port'));
const pluginUUID = arg('pluginUUID');
const registerEvent = arg('registerEvent');

const api = new DeckApi(path.join(DATA_DIR, 'cache'), log);
const input = new InputHelper(path.join(__dirname, 'helper.ps1'), log);
let globalSettings = {};

const DEFAULTS = {
  price: { type: 'Currency', name: 'Divine Orb', variant: '' },
  movers: { direction: 'up', type: 'Currency', minVolume: 50000 },
  chat: { command: '/hideout', label: 'Hideout', glyph: 'home' },
  link: { url: SITE, label: 'poe.how', glyph: 'poehow' },
  regex: { regex: '', label: '', glyph: 'magnifier' },
  league: {},
  pricecheck: {},
  boss: { mode: 'rank', rank: 1, boss: '' },
};

/** context -> state */
const keys = new Map();
let ws = null;

function send(obj) { if (ws) ws.send(JSON.stringify(obj)); }
function setImage(context, svg) {
  const k = keys.get(context);
  const image = R.toDataUrl(svg);
  if (k) { if (k.lastImage === image) return; k.lastImage = image; }
  send({ event: 'setImage', context, payload: { image, target: 0 } });
}
const showOk = (context) => send({ event: 'showOk', context });
const showAlert = (context) => send({ event: 'showAlert', context });
const openUrl = (url) => send({ event: 'openUrl', payload: { url } });

function kindOf(action) { return String(action || '').startsWith(PREFIX) ? action.slice(PREFIX.length) : ''; }
function settingsFor(kind, s) { return { ...(DEFAULTS[kind] || {}), ...(s || {}) }; }

async function leagueCtx() {
  const league = await api.league();
  const divPrice = await api.divinePrice(league);
  return { league, divPrice };
}

function tradeUrl(league, entry) {
  const q = { query: { status: { option: 'online' } }, sort: { price: 'asc' } };
  if (entry && entry.source === 'item' && /^Unique/.test(entry.type || '')) { q.query.name = entry.name; if (entry.baseType) q.query.type = entry.baseType; }
  else if (entry) q.query.type = entry.baseType && entry.source === 'item' && /Map$|^ScryingOrb$/.test(entry.type) ? entry.baseType : entry.name;
  return `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(q))}`;
}

function fillUrl(url, league) {
  return String(url || '')
    .replace(/\{league\}/g, encodeURIComponent(league))
    .replace(/\{leagueSlug\}/g, encodeURIComponent(String(league).toLowerCase().replace(/\s+/g, '-')));
}

// ---------- renderers per action ----------
async function renderKey(context) {
  const k = keys.get(context);
  if (!k) return;
  const s = k.settings;
  try {
    switch (k.kind) {
      case 'price': {
        const { league, divPrice } = await leagueCtx();
        const e = await api.findPrice(league, s.type, s.name, s.variant).catch(() => null);
        if (!e) return setImage(context, R.priceKey({ name: s.name, missing: true }));
        k.entry = e;
        const icon = await api.icon(e.icon);
        const args = {
          name: e.name, icon, chaos: e.chaos, divPrice, change: e.change, sparkData: e.spark, type: s.type,
          isDivine: eq(e.name, 'Divine Orb'), stale: !!api.lastError && Date.now() - api.lastSuccess > 3600e3,
        };
        return setImage(context, k.mode === 'chart' ? R.chartKey(args) : R.priceKey(args));
      }
      case 'movers': {
        const { league, divPrice } = await leagueCtx();
        const list = await api.priceList(league, s.type || 'Currency').catch(() => []);
        const minVol = Number(s.minVolume) || 0;
        const pool = list.filter((x) => x.change != null && x.chaos != null && x.chaos >= 0.5 && (x.volume == null || x.volume >= minVol) && !eq(x.name, 'Chaos Orb'));
        pool.sort((a, b) => (s.direction === 'down' ? a.change - b.change : b.change - a.change));
        const top = pool.slice(0, 5);
        if (!top.length) return setImage(context, R.moversKey({ direction: s.direction, entry: null }));
        const i = (k.idx || 0) % top.length;
        const e = top[i];
        k.entry = e;
        const icon = await api.icon(e.icon);
        return setImage(context, R.moversKey({ direction: s.direction, entry: e, icon, rank: i + 1, total: top.length, divPrice }));
      }
      case 'league': {
        const { league: priced, divPrice } = await leagueCtx();
        const league = await api.selectedLeague();
        const start = await api.leagueStart(league);
        const day = start ? Math.max(1, Math.floor((Date.now() - start) / 864e5) + 1) : null;
        let divIcon = null;
        try { const cur = await api.priceList(priced, 'Currency'); const d = cur.find((x) => eq(x.name, 'Divine Orb')); divIcon = d ? await api.icon(d.icon) : null; } catch (_) {}
        return setImage(context, R.leagueKey({ league, day, divPrice, divIcon, offline: !api.lastSuccess && !!api.lastError }));
      }
      case 'boss': {
        const { league, divPrice } = await leagueCtx();
        let list;
        try { list = await api.bosses(league); }
        catch (e) { return setImage(context, R.checkMessage('poe.how', 'unreachable', R.ACCENT.boss)); }
        if (s.mode === 'summary') {
          const ranked = DeckApi.ranked(list);
          return setImage(context, R.bossSummary({
            total: list.length, profitable: list.filter((b) => b.profit > 0.5).length, best: ranked[0], divPrice,
            offline: api.bossesOffline(league),
          }));
        }
        const rank = Math.max(1, Number(s.rank) || 1);
        const boss = s.mode === 'rank' ? DeckApi.ranked(list)[rank - 1] : DeckApi.findBoss(list, s.boss);
        k.boss = boss || null;
        if (boss && k.mode === 'detail') return setImage(context, R.bossDetail({ boss, divPrice }));
        const art = boss && boss.image ? await api.icon(boss.image) : null;
        return setImage(context, R.bossKey({ boss, art, divPrice, rank: s.mode === 'rank' ? rank : null }));
      }
      case 'pricecheck': {
        if (k.view) return setImage(context, k.view);
        return setImage(context, R.checkIdle());
      }
      case 'chat': {
        return setImage(context, R.glyphKey({ glyphName: s.glyph || 'chat', label: s.label || s.command, sub: s.command, accent: R.ACCENT.chat }));
      }
      case 'regex': {
        if (k.view) return setImage(context, k.view);
        const re = cleanRegex(s.regex);
        if (!re) return setImage(context, R.glyphKey({ glyphName: 'magnifier', label: s.label || 'Regex', sub: 'hold to save', accent: R.ACCENT.check }));
        return setImage(context, R.glyphKey({ glyphName: s.glyph || 'magnifier', label: s.label || 'Regex', sub: regexProblem(re) || re, accent: R.ACCENT.check }));
      }
      case 'link': {
        let host = '';
        try { host = new URL(fillUrl(s.url, 'x')).hostname.replace(/^www\./, ''); } catch (_) {}
        return setImage(context, R.glyphKey({ glyphName: s.glyph || 'link', label: s.label || host, sub: host, accent: R.ACCENT.link }));
      }
      default:
        return undefined;
    }
  } catch (e) {
    log('render error', k.kind, (e && e.stack) || String(e));
    setImage(context, R.errorKey('Error', e.message));
  }
}

// ---------- key presses ----------
async function onPress(context, held) {
  const k = keys.get(context);
  if (!k) return;
  const s = k.settings;
  const long = held >= LONG_PRESS_MS;
  switch (k.kind) {
    case 'price': {
      if (long) { const { league } = await leagueCtx(); openUrl(tradeUrl(league, k.entry || { name: s.name, source: 'exchange' })); return; }
      clearTimeout(k.modeTimer);
      k.mode = k.mode === 'chart' ? null : 'chart';
      if (k.mode) k.modeTimer = setTimeout(() => { k.mode = null; renderKey(context); }, 6000);
      return renderKey(context);
    }
    case 'movers': {
      if (long && k.entry) { const { league } = await leagueCtx(); openUrl(tradeUrl(league, k.entry)); return; }
      k.idx = (k.idx || 0) + 1;
      return renderKey(context);
    }
    case 'league': {
      openUrl(SITE);
      return undefined;
    }
    case 'boss': {
      if (s.mode === 'summary' || (long && !k.boss)) { openUrl(SITE + '/economy/bosses'); return undefined; }
      if (long) { openUrl(k.boss.url); return undefined; }
      if (!k.boss) { showAlert(context); return undefined; }
      clearTimeout(k.modeTimer);
      k.mode = k.mode === 'detail' ? null : 'detail';
      if (k.mode) k.modeTimer = setTimeout(() => { k.mode = null; renderKey(context); }, 8000);
      return renderKey(context);
    }
    case 'pricecheck': {
      if (long) {
        if (k.last) { const { league } = await leagueCtx(); openUrl(tradeUrl(league, k.last)); }
        else showAlert(context);
        return undefined;
      }
      return priceCheck(context);
    }
    case 'chat': {
      // One line, one command: a key press must never send more than one message.
      const text = String(s.command || '').replace(/[\p{C}\p{Zl}\p{Zp}]+/gu, ' ').trim().slice(0, 250);
      if (!text) { showAlert(context); return undefined; }
      const r = await input.call('chat', { text });
      if (r.ok) showOk(context); else { log('chat failed', r.error); showAlert(context); }
      return undefined;
    }
    case 'regex': {
      const re = cleanRegex(s.regex);
      if (!re) {
        // Only a deliberate hold stores clipboard text, so a stray press cannot save something private.
        if (!long) return showTemporary(context, R.checkMessage('Empty key', 'hold to save'), 4000);
        const c = await input.call('getclip');
        const problem = c.ok ? regexProblem(c.text) : 'empty';
        if (problem) { showAlert(context); return showTemporary(context, R.checkMessage('Not saved', problem === 'empty' ? 'copy a regex' : 'over 250 chars'), 4000); }
        k.settings = { ...s, regex: cleanRegex(c.text) };
        send({ event: 'setSettings', context, payload: k.settings });
        showOk(context);
        return renderKey(context);
      }
      if (regexProblem(re)) { showAlert(context); return showTemporary(context, R.checkMessage('Too long', 'over 250 chars'), 4000); }
      const r = await input.call(long ? 'setclip' : 'search', { text: re });
      if (r.ok) { showOk(context); return undefined; }
      log('regex failed', r.error);
      showAlert(context);
      return r.error === 'notpoe' ? showTemporary(context, R.checkMessage('Focus PoE', 'game window first'), 4000) : undefined;
    }
    case 'link': {
      const { league } = await leagueCtx();
      if (s.url) openUrl(fillUrl(s.url, league)); else showAlert(context);
      return undefined;
    }
    default:
      return undefined;
  }
}

function showTemporary(context, svg, ms = RESULT_MS) {
  const k = keys.get(context);
  if (!k) return;
  clearTimeout(k.viewTimer);
  k.view = svg;
  renderKey(context);
  k.viewTimer = setTimeout(() => { k.view = null; renderKey(context); }, ms);
}

async function priceCheck(context) {
  const k = keys.get(context);
  if (!k || k.busy) return;
  k.busy = true;
  clearTimeout(k.viewTimer);
  k.view = R.checkBusy();
  renderKey(context);
  try {
    const r = await input.call('copy');
    if (!r.ok) {
      const msg = r.error === 'notpoe' ? ['Focus PoE', 'game window first'] : r.error === 'empty' ? ['No item', 'hover an item'] : ['Copy failed', r.error];
      log('price check copy failed', r.error);
      showAlert(context);
      return showTemporary(context, R.checkMessage(msg[0], msg[1]));
    }
    const item = parseItem(r.text);
    if (!item) { showAlert(context); return showTemporary(context, R.checkMessage('Not an item', 'hover an item')); }
    if (['Rare', 'Magic'].includes(item.rarity) && !/^maps?$/i.test(item.itemClass || '')) {
      return showTemporary(context, R.checkMessage(item.rarity + ' item', 'hold key: trade'));
    }
    const { league, divPrice } = await leagueCtx();
    const found = await priceItem(api, league, item);
    if (!found) {
      log('no price for', item.rarity, item.itemClass, item.name);
      k.last = { name: item.name, baseType: item.base, source: item.rarity === 'Unique' ? 'item' : 'exchange', type: item.rarity === 'Unique' ? 'UniqueX' : '' };
      showAlert(context);
      return showTemporary(context, R.checkMessage('No price', item.name || ''));
    }
    const e = found.entry;
    k.last = e;
    log('price check', item.name, '->', e.name, e.variant || '', e.chaos);
    const icon = await api.icon(e.icon);
    showTemporary(context, R.checkResult({
      name: e.name, variant: e.variant, icon, chaos: e.chaos, divPrice, stack: item.stack, type: found.type, isDivine: eq(e.name, 'Divine Orb'),
    }));
  } catch (e) {
    log('price check error', (e && e.stack) || String(e));
    showTemporary(context, R.errorKey('Error', e.message));
  } finally {
    k.busy = false;
  }
}

// ---------- property inspector ----------
async function onSendToPlugin(msg) {
  const p = msg.payload || {};
  if (p.req === 'names') {
    const league = await api.league();
    const names = await api.names(league, p.type);
    send({ event: 'sendToPropertyInspector', action: msg.action, context: msg.context, payload: { names, type: p.type } });
  } else if (p.req === 'bosses') {
    let names = [];
    try { names = (await api.bosses(await api.league())).map((b) => b.title).sort((a, b) => a.localeCompare(b)); } catch (_) {}
    send({ event: 'sendToPropertyInspector', action: msg.action, context: msg.context, payload: { bosses: names } });
  } else if (p.req === 'meta') {
    const league = await api.league();
    const leagues = await api.choices();
    const selected = await api.selectedLeague();
    send({ event: 'sendToPropertyInspector', action: msg.action, context: msg.context, payload: {
      meta: { league: selected, priced: league, leagues, exchangeTypes: EXCHANGE_TYPES, itemTypes: ITEM_TYPES, glyphs: R.GLYPHS, override: api.leagueOverride },
    } });
  }
}

function applyGlobal(gs) {
  globalSettings = gs || {};
  const o = String(globalSettings.league || '').trim();
  if (o !== api.leagueOverride) { api.leagueOverride = o; log('league override', o || '(auto)'); refreshAll(); }
}

function refreshAll() { for (const c of keys.keys()) renderKey(c); }

// ---------- websocket ----------
function onMessage(raw) {
  let m;
  try { m = JSON.parse(raw); } catch (_) { return; }
  const { event, context, action, payload = {} } = m;
  const kind = kindOf(action);
  switch (event) {
    case 'willAppear': {
      const prev = keys.get(context) || {};
      keys.set(context, { ...prev, kind, settings: settingsFor(kind, payload.settings), coords: payload.coordinates, lastImage: null });
      renderKey(context);
      break;
    }
    case 'willDisappear': {
      const k = keys.get(context);
      if (k) { clearTimeout(k.viewTimer); clearTimeout(k.modeTimer); }
      keys.delete(context);
      break;
    }
    case 'didReceiveSettings': {
      const k = keys.get(context);
      if (k) { k.settings = settingsFor(kind, payload.settings); k.lastImage = null; k.idx = 0; renderKey(context); }
      break;
    }
    case 'keyDown': {
      const k = keys.get(context);
      if (k) k.downAt = Date.now();
      break;
    }
    case 'keyUp': {
      const k = keys.get(context);
      const held = k && k.downAt ? Date.now() - k.downAt : 0;
      onPress(context, held).catch((e) => log('press error', (e && e.stack) || String(e)));
      break;
    }
    case 'didReceiveGlobalSettings':
      applyGlobal(payload.settings);
      break;
    case 'sendToPlugin':
      onSendToPlugin(m).catch((e) => log('pi error', e.message));
      break;
    case 'systemDidWakeUp':
      setTimeout(refreshAll, 5000);
      break;
    default:
      break;
  }
}

function connect() {
  if (!port || !pluginUUID) { log('missing -port/-pluginUUID; exiting'); process.exit(1); }
  log('starting Exile Deck', VERSION, 'port', port, 'node', process.version);
  ws = new MiniWebSocket(port);
  ws.on('open', () => {
    ws.send(JSON.stringify({ event: registerEvent, uuid: pluginUUID }));
    ws.send(JSON.stringify({ event: 'getGlobalSettings', context: pluginUUID }));
    log('registered');
    input.warm();
    api.league().then((l) => api.priceList(l, 'Currency')).then(refreshAll).catch((e) => log('prefetch failed', e.message));
  });
  ws.on('message', onMessage);
  ws.on('error', (e) => log('ws error', e.message));
  ws.on('close', () => { log('ws closed; exiting'); input.stop(); process.exit(0); });
}

setInterval(() => {
  for (const [c, k] of keys) if (['price', 'movers', 'league', 'boss'].includes(k.kind) && !k.mode) renderKey(c);
}, TICK_MS);

module.exports = { onMessage, keys, api, input, renderKey, priceCheck };
if (require.main === module) connect();
