'use strict';
// Client for the public poe.how deck API (https://poe.how/api/deck/v1).
// ETag-aware, disk-cached and polite: max 2 requests in flight, never refreshes faster than the
// server's own data, backs off after errors and keeps showing cached data while offline.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { VERSION } = require('./version');

const SITE = 'https://poe.how';
const BASE = SITE + '/api/deck/v1';
const UA = `ExileDeck/${VERSION} (+${SITE}/addons)`;
const ICON_HOSTS = new Set(['web.poecdn.com', 'poe.how']);

const EXCHANGE_TYPES = ['Currency', 'Fragment', 'Runegraft', 'AllflameEmber', 'Tattoo', 'Omen', 'DjinnCoin',
  'DivinationCard', 'Artifact', 'Oil', 'DeliriumOrb', 'Scarab', 'Astrolabe', 'Fossil', 'Resonator', 'Essence'];
const ITEM_TYPES = ['Wombgift', 'Incubator', 'UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask',
  'UniqueJewel', 'ForbiddenJewel', 'ShrineBelt', 'UniqueTincture', 'UniqueRelic', 'SkillGem', 'ImbuedGem',
  'ClusterJewel', 'Map', 'BlightedMap', 'BlightRavagedMap', 'UniqueMap', 'ValdoMap', 'Invitation', 'Memory',
  'IncursionTemple', 'BaseType', 'Beast', 'Vial'];

const TTL = { meta: 60 * 60e3, prices: 15 * 60e3, strategies: 30 * 60e3, icon: 30 * 86400e3 };
const RETRY_AFTER_FAIL = 5 * 60e3;

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[‘’]/g, "'");
const eq = (a, b) => norm(a) === norm(b);
const num = (v) => (v == null || !isFinite(Number(v)) ? null : Number(v));
const slugify = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 20);

/** Only https URLs on the hosts we expect are fetched as images. */
function safeIcon(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && ICON_HOSTS.has(u.hostname) ? u.href : null; }
  catch (_) { return null; }
}
/** Only poe.how pages are opened from API data. */
function safePage(url, fallback) {
  try { const u = new URL(url); if (u.protocol === 'https:' && u.hostname === 'poe.how') return u.href; } catch (_) { /* fall back */ }
  return fallback;
}

class DeckApi {
  constructor(cacheDir, log) {
    this.dir = cacheDir;
    this.iconDir = path.join(cacheDir, 'icons');
    fs.mkdirSync(this.iconDir, { recursive: true });
    this.log = log || (() => {});
    this.mem = new Map();      // url -> { etag, data, fetchedAt }
    this.failAt = new Map();   // url -> last failure time
    this.inflight = new Map(); // url -> promise
    this.normCache = new Map();
    this.iconMem = new Map();
    this.active = 0;
    this.queue = [];
    this.leagueOverride = '';
    this.lastError = null;
    this.lastSuccess = 0;
  }

  url(route, params = {}) {
    const q = new URLSearchParams({ game: 'poe1', ...params });
    return `${BASE}/${route}?${q}`;
  }

  _file(url) { return path.join(this.dir, hash(url) + '.json'); }
  _load(url) {
    if (this.mem.has(url)) return this.mem.get(url);
    try {
      const e = JSON.parse(fs.readFileSync(this._file(url), 'utf8'));
      this.mem.set(url, e);
      return e;
    } catch (_) { return null; }
  }
  _store(url, e) {
    this.mem.set(url, e);
    fs.writeFile(this._file(url), JSON.stringify(e), (err) => { if (err) this.log('cache write failed', err.message); });
  }

  async _slot(fn) {
    if (this.active >= 2) await new Promise((r) => this.queue.push(r));
    this.active++;
    try { return await fn(); } finally { this.active--; const n = this.queue.shift(); if (n) n(); }
  }

  /** GET JSON with cache. Returns cached data while fresh; revalidates with ETag; serves stale data on failure. */
  async json(url, ttl) {
    const cached = this._load(url);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < ttl) return cached.data;
    const failed = this.failAt.get(url);
    if (failed && now - failed < RETRY_AFTER_FAIL) {
      if (cached) return cached.data;
      throw new Error('recently failed');
    }
    if (this.inflight.has(url)) return this.inflight.get(url);
    const p = this._slot(async () => {
      const headers = { 'User-Agent': UA, Accept: 'application/json' };
      if (cached && cached.etag) headers['If-None-Match'] = cached.etag;
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
        if (res.status === 304 && cached) {
          this._store(url, { ...cached, fetchedAt: Date.now() });
          this.failAt.delete(url);
          this.lastError = null;
          this.lastSuccess = Date.now();
          return cached.data;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        this._store(url, { etag: res.headers.get('etag'), data, fetchedAt: Date.now() });
        this.failAt.delete(url);
        this.lastError = null;
        this.lastSuccess = Date.now();
        return data;
      } catch (e) {
        this.failAt.set(url, Date.now());
        this.lastError = e.message;
        this.log('fetch failed', url, e.message);
        if (cached) return cached.data;
        throw e;
      }
    });
    this.inflight.set(url, p);
    try { return await p; } finally { this.inflight.delete(url); }
  }

  // ---------- meta ----------
  async meta() {
    try { return (await this.json(this.url('meta'), TTL.meta)) || {}; } catch (_) { return {}; }
  }
  async leagues() {
    const ls = (await this.meta()).leagues;
    return Array.isArray(ls) ? ls : [];
  }
  async league() {
    if (this.leagueOverride) return this.leagueOverride;
    const m = await this.meta();
    if (m.currentLeague) return m.currentLeague;
    const cur = (await this.leagues()).find((l) => l.current);
    return cur ? cur.id : 'Standard';
  }
  /** Start time of a temporary league, or null for permanent leagues. */
  async leagueStart(league) {
    if (/^(hardcore|standard|ssf standard|ssf hardcore|ssf r? ?standard)$/i.test(league)) return null;
    const l = (await this.leagues()).find((x) => x.id === league);
    const t = l && l.start ? Date.parse(l.start) : NaN;
    return isFinite(t) ? t : null;
  }

  // ---------- prices ----------
  async priceList(league, type) {
    const url = this.url('prices', { league, type });
    const data = await this.json(url, TTL.prices);
    const hit = this.normCache.get(url);
    if (hit && hit.data === data) return hit.list;
    const source = EXCHANGE_TYPES.includes(type) ? 'exchange' : 'item';
    const list = (data.items || []).map((x) => ({
      id: x.id, name: x.name, baseType: x.baseType || null, variant: x.variant || null, links: x.links || null,
      corrupted: !!x.corrupted, gemLevel: num(x.gemLevel), gemQuality: num(x.gemQuality), mapTier: num(x.mapTier),
      chaos: num(x.value), change: num(x.change7d), spark: Array.isArray(x.spark) ? x.spark : [],
      volume: num(x.volume), count: num(x.count), icon: safeIcon(x.icon), mods: Array.isArray(x.mods) ? x.mods : [],
      type, source,
    }));
    list.divinePrice = num(data.divinePrice);
    this.normCache.set(url, { data, list });
    return list;
  }

  async divinePrice(league) {
    try {
      const list = await this.priceList(league, 'Currency');
      if (list.divinePrice) return list.divinePrice;
      const d = list.find((x) => eq(x.name, 'Divine Orb'));
      if (d && d.chaos) return d.chaos;
    } catch (_) { /* no data yet */ }
    return null;
  }

  /** Price for a configured key: type + exact name (+ optional variant such as "4 Flasks" or "20/20"). */
  async findPrice(league, type, name, variant) {
    const list = await this.priceList(league, type);
    if (EXCHANGE_TYPES.includes(type)) return list.find((x) => eq(x.name, name) || x.id === name) || null;
    let c = list.filter((x) => eq(x.name, name));
    if (variant) { const v = c.filter((x) => eq(x.variant, variant)); if (v.length) c = v; }
    const clean = c.filter((x) => !x.corrupted); if (clean.length) c = clean;
    const unlinked = c.filter((x) => !x.links); if (unlinked.length) c = unlinked;
    return c.sort((a, b) => (b.count || 0) - (a.count || 0))[0] || null;
  }

  async names(league, type) {
    try {
      const list = await this.priceList(league, type);
      return [...new Set(list.map((x) => x.name))].sort((a, b) => a.localeCompare(b));
    } catch (_) { return []; }
  }

  // ---------- strategies ----------
  async bosses(league) {
    const url = this.url('strategies', { league, category: 'bosses' });
    const data = await this.json(url, TTL.strategies);
    const hit = this.normCache.get(url);
    if (hit && hit.data === data) return hit.list;
    const list = (data.items || []).map((s) => ({
      id: s.id, title: s.title, short: String(s.title || '').split(',')[0].trim(), slug: s.slug || slugify(s.title),
      url: safePage(s.url, `${SITE}/economy/bosses`), image: safeIcon(s.image),
      cost: num(s.cost) || 0, ev: num(s.ev) || 0, profit: num(s.profit) || 0, runs: num(s.runs) || 0,
      breakEvenRuns: num(s.breakEvenRuns), completeness: s.completeness || 'no_user_data',
      realData: !!s.realData, missingPrices: num(s.missingPrices) || 0,
    }));
    this.normCache.set(url, { data, list });
    return list;
  }
  bossesOffline(league) { return this.failAt.has(this.url('strategies', { league, category: 'bosses' })); }

  /** Bosses worth ranking: complete data, real drop rates, a decent sample. */
  static ranked(list, minRuns = 100) {
    return list
      .filter((b) => b.completeness === 'complete' && b.realData && b.runs >= minRuns)
      .sort((a, b) => b.profit - a.profit);
  }
  static findBoss(list, key) {
    if (key == null || key === '') return null;
    const k = String(key).toLowerCase();
    return list.find((b) => String(b.id) === k || b.slug === slugify(k) || b.title.toLowerCase() === k || b.short.toLowerCase() === k) || null;
  }

  // ---------- icons ----------
  /** Item icon as a data: URL (memory + disk cache). Returns null if it can't be fetched. */
  async icon(url) {
    if (!safeIcon(url)) return null;
    if (this.iconMem.has(url)) return this.iconMem.get(url);
    const file = path.join(this.iconDir, hash(url) + '.png');
    try {
      const st = fs.statSync(file);
      if (Date.now() - st.mtimeMs < TTL.icon) {
        const d = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
        this.iconMem.set(url, d);
        return d;
      }
    } catch (_) { /* not cached */ }
    const failed = this.failAt.get(url);
    if (failed && Date.now() - failed < RETRY_AFTER_FAIL) return null;
    if (this.inflight.has(url)) return this.inflight.get(url);
    const p = this._slot(async () => {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/png' }, signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error('not a PNG');
        fs.writeFile(file, buf, () => {});
        const d = 'data:image/png;base64,' + buf.toString('base64');
        this.iconMem.set(url, d);
        return d;
      } catch (e) {
        this.failAt.set(url, Date.now());
        this.log('icon failed', url, e.message);
        return null;
      }
    });
    this.inflight.set(url, p);
    try { return await p; } finally { this.inflight.delete(url); }
  }
}

module.exports = { DeckApi, EXCHANGE_TYPES, ITEM_TYPES, eq, norm, safeIcon, safePage, SITE, UA };
