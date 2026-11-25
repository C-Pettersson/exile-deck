'use strict';
// Parses the text Path of Exile puts on the clipboard (Ctrl+C on a hovered item)
// and matches it against the price lists.
const { EXCHANGE_TYPES, eq, norm } = require('./api');

function parseNumber(s) {
  if (s == null) return null;
  const n = Number(String(s).replace(/[\s,. ](?=\d{3}\b)/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

function parseItem(text) {
  if (!text || typeof text !== 'string') return null;
  const lines = text.replace(/\r/g, '').split('\n').map((s) => s.trim());
  const sections = [];
  let cur = [];
  for (const l of lines) {
    if (/^-{4,}$/.test(l)) { sections.push(cur); cur = []; }
    else if (l) cur.push(l);
  }
  sections.push(cur);
  const head = sections[0] || [];
  let itemClass = null;
  let rarity = null;
  const names = [];
  for (const l of head) {
    let m;
    if ((m = /^Item Class:\s*(.+)$/i.exec(l))) itemClass = m[1];
    else if ((m = /^Rarity:\s*(.+)$/i.exec(l))) rarity = m[1];
    else names.push(l);
  }
  // Viscera have an item class but no rarity line.
  if (!rarity && !/^viscera$/i.test(itemClass || '')) return null;
  // Advanced descriptions put the roll range after a value: 47(35-50)% becomes 47%.
  const all = lines.map((l) => l.replace(/(\d)\(-?[\d.]+--?[\d.]+\)/g, '$1')).join('\n');
  const grab = (re) => { const m = re.exec(all); return m ? m[1] : null; };
  const stack = parseNumber(grab(/^Stack Size:\s*([\d\s,. ]+?)\s*\//m));
  const gemLevel = parseNumber(grab(/^Level:\s*(\d+)/m));
  const quality = parseNumber(grab(/^Quality(?: \([^)]*\))?:\s*\+?(\d+)%/m));
  const mapTier = parseNumber(grab(/^Map Tier:\s*(\d+)/m));
  const sockets = grab(/^Sockets:\s*(.+)$/m);
  let links = 0;
  if (sockets) for (const g of sockets.trim().split(/\s+/)) links = Math.max(links, g.split('-').filter(Boolean).length);
  let name = names[0] || null;
  let base = names[1] || null;
  if (rarity === 'Normal' && name) name = name.replace(/^Superior\s+/, '');
  return {
    itemClass, rarity, name, base, names, stack, gemLevel, quality, mapTier, links,
    corrupted: /^Corrupted$/m.test(all), unidentified: /^Unidentified$/m.test(all), raw: all,
  };
}

const WEAPON = /bow|claw|dagger|one hand|two hand|stave|staff|wand|sceptre|warstaff|fishing rod|quiver/;
const ARMOUR = /body armour|helmet|glove|boot|shield|quiver/;
const ACCESSORY = /amulet|ring|belt|trinket/;

function guessExchangeOrder(name) {
  const n = norm(name);
  const first = [];
  const add = (t) => { if (!first.includes(t)) first.push(t); };
  if (/fossil/.test(n)) add('Fossil');
  if (/resonator/.test(n)) add('Resonator');
  if (/essence|remnant of corruption/.test(n)) add('Essence');
  if (/\boil\b/.test(n)) add('Oil');
  if (/delirium orb/.test(n)) add('DeliriumOrb');
  if (/^omen\b/.test(n)) add('Omen');
  if (/tattoo/.test(n)) add('Tattoo');
  if (/scarab/.test(n)) add('Scarab');
  if (/allflame|ember/.test(n)) add('AllflameEmber');
  if (/runegraft/.test(n)) add('Runegraft');
  if (/astrolabe/.test(n)) add('Astrolabe');
  if (/\bthread\b/.test(n)) add('Thread');
  if (/enshrouding crystal/.test(n)) add('EnshroudingCrystal');
  if (/\bducat\b/.test(n)) add('Ducat');
  if (/coin/.test(n)) add('DjinnCoin');
  if (/splinter|fragment|emblem|key|crest|invitation|offering|sacrifice|mortal|reliquary|breachstone|simulacrum/.test(n)) add('Fragment');
  add('Currency');
  add('Fragment');
  for (const t of EXCHANGE_TYPES) add(t);
  return first;
}

/** Ordered list of price categories to search for this item. */
function candidateTypes(item) {
  const r = item.rarity || '';
  const c = norm(item.itemClass);
  if (r === 'Divination Card' || /divination card/.test(c)) return ['DivinationCard'];
  if (r === 'Gem' || /gem/.test(c)) return ['SkillGem', 'ImbuedGem'];
  if (/^maps?$/.test(c)) {
    if (r === 'Unique') return ['UniqueMap'];
    if (/blight-ravaged/i.test(item.raw)) return ['BlightRavagedMap', 'Map'];
    if (/^blighted /i.test(item.name || '') || /blighted/i.test(item.base || '')) return ['BlightedMap', 'Map'];
    return ['Map', 'ValdoMap'];
  }
  if (/viscera/.test(c)) return ['Viscera'];
  if (r === 'Unique') {
    if (/jewel/.test(c)) return ['UniqueJewel', 'ForbiddenJewel', 'ClusterJewel'];
    if (/flask/.test(c)) return ['UniqueFlask'];
    if (/tincture/.test(c)) return ['UniqueTincture'];
    if (/relic/.test(c)) return ['UniqueRelic'];
    const out = [];
    if (ACCESSORY.test(c)) out.push('UniqueAccessory');
    if (WEAPON.test(c)) out.push('UniqueWeapon');
    if (ARMOUR.test(c)) out.push('UniqueArmour');
    for (const t of ['UniqueAccessory', 'UniqueArmour', 'UniqueWeapon', 'UniqueJewel', 'UniqueFlask']) if (!out.includes(t)) out.push(t);
    return out;
  }
  if (/incubator/.test(c)) return ['Incubator'];
  if (/memor/.test(c)) return ['Memory'];
  if (/wombgift/.test(c)) return ['Wombgift'];
  if (/vial/.test(norm(item.name))) return ['Vial'];
  if (/captured beast|beast/.test(c)) return ['Beast'];
  if (/map fragment|misc map item|fragment/.test(c)) {
    const order = guessExchangeOrder(item.name);
    // A name that gives its category away is looked up there first.
    return [...(order[0] === 'Currency' ? [] : [order[0]]), 'Fragment', 'Scarab', 'Invitation', 'Memory', ...order];
  }
  return guessExchangeOrder(item.name);
}

function modRegex(text) {
  const src = String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\(\s*-?[\d.]+\s*-\s*-?[\d.]+\s*\\\)/g, '[-+]?[\\d.]+');
  try { return new RegExp('^' + src + '$', 'im'); } catch (_) { return null; }
}

/**
 * Viscera share a name and differ by their modifier, so a price only counts when that modifier is on the item. Several
 * modifiers are listed as one variant, joined with ' / '.
 */
function hasVariantMod(variant, raw) {
  return String(variant).split(' / ').every((mod) => {
    const src = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/#/g, '-?[\\d.,]+');
    return new RegExp('^' + src + '(?: \\([a-z ]+\\))?$', 'im').test(raw);
  });
}

function pickUnique(cands, item) {
  if (cands.length <= 1) return cands[0] || null;
  const linked = item.links >= 5 ? item.links : 0;
  let best = null;
  let bestScore = -Infinity;
  for (const x of cands) {
    let score = 0;
    const l = Number(x.links) || 0;
    score += l === linked ? 40 : -40;
    if (x.variant && x.mods.length) {
      let hits = 0;
      for (const m of x.mods) { const re = modRegex(m); if (re && re.test(item.raw)) hits++; }
      score += hits * 10 - (x.mods.length - hits) * 10;
    }
    score += Math.log10(1 + (x.count || 0));
    if (score > bestScore) { bestScore = score; best = x; }
  }
  return best;
}

function pickGem(cands, item) {
  let best = null;
  let bestScore = Infinity;
  const lvl = item.gemLevel || 1;
  const q = item.quality || 0;
  for (const x of cands) {
    const score = Math.abs((x.gemLevel || 1) - lvl) * 10 + Math.abs((x.gemQuality || 0) - q) * 0.5 +
      (x.corrupted !== item.corrupted ? 25 : 0) - Math.log10(1 + (x.count || 0)) * 0.1;
    if (score < bestScore) { bestScore = score; best = x; }
  }
  return best;
}

function matchLines(lines, item, type) {
  if (type === 'SkillGem' || type === 'ImbuedGem') {
    const c = lines.filter((x) => eq(x.name, item.name));
    return c.length ? pickGem(c, item) : null;
  }
  if (/Map$/.test(type) && type !== 'UniqueMap') {
    const hay = item.names.map(norm);
    let c = lines.filter((x) => hay.some((h) => h.includes(norm(x.name))));
    if (item.mapTier) { const t = c.filter((x) => x.mapTier === item.mapTier); if (t.length) c = t; }
    c.sort((a, b) => b.name.length - a.name.length || (b.count || 0) - (a.count || 0));
    return c[0] || null;
  }
  if (/^Unique|Jewel$/.test(type)) {
    let c = lines.filter((x) => eq(x.name, item.name) && (!item.base || !x.baseType || eq(x.baseType, item.base)));
    if (!c.length) c = lines.filter((x) => eq(x.name, item.name));
    if (!c.length && item.unidentified && item.name) {
      const byBase = lines.filter((x) => eq(x.baseType, item.name));
      const uniq = [...new Set(byBase.map((x) => x.name))];
      if (uniq.length === 1) c = byBase;
    }
    return pickUnique(c, item);
  }
  let c = lines.filter((x) => eq(x.name, item.name));
  if (type === 'Viscera') c = c.filter((x) => !x.variant || hasVariantMod(x.variant, item.raw));
  return c.sort((a, b) => (b.count || 0) - (a.count || 0))[0] || null;
}

/** Find a price for a parsed item. Returns { entry, type } or null. */
async function priceItem(api, league, item) {
  if (!item || !item.name) return null;
  if (['Rare', 'Magic'].includes(item.rarity) && !/^maps?$/.test(norm(item.itemClass))) return null;
  for (const type of candidateTypes(item)) {
    try {
      const list = await api.priceList(league, type);
      if (EXCHANGE_TYPES.includes(type)) {
        const hit = list.find((x) => eq(x.name, item.name));
        if (hit) return { entry: hit, type };
      } else {
        const hit = matchLines(list, item, type);
        if (hit) return { entry: hit, type };
      }
    } catch (_) { /* try next category */ }
  }
  return null;
}

module.exports = { parseItem, candidateTypes, priceItem, matchLines, modRegex };
