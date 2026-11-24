'use strict';
// The 8x4 Stream Deck XL layout for the PoE profile: [column, row, action, settings]
const P = 'com.poehow.exile-deck.';
const price = (type, name, variant = '') => ['price', { type, name, variant }];
const chat = (command, label, glyph) => ['chat', { command, label, glyph }];
const link = (url, label, glyph) => ['link', { url, label, glyph }];

const rows = [
  // Row 0: league + headline currency
  [['league', {}], price('Currency', 'Divine Orb'), price('Currency', 'Exalted Orb'), price('Currency', 'Orb of Annulment'),
    price('Currency', 'Ancient Orb'), price("Currency", "Hinekora's Lock"), price('Currency', 'Mirror Shard'), price('Currency', 'Mirror of Kalandra')],
  // Row 1: price check, market movers, chase items
  [['pricecheck', {}], ['movers', { direction: 'up', type: 'Currency', minVolume: 50000 }],
    ['movers', { direction: 'down', type: 'Currency', minVolume: 50000 }],
    price('UniqueAccessory', 'Mageblood', '4 Flasks'), price('UniqueAccessory', 'Headhunter'),
    price('DivinationCard', 'The Apothecary'), price('DivinationCard', 'House of Mirrors'), price('DivinationCard', 'The Doctor')],
  // Row 2: chat commands
  [chat('/hideout', 'Hideout', 'home'), chat('/kingsmarch', 'Kingsmarch', 'ship'), chat('/menagerie', 'Menagerie', 'paw'),
    chat('/delve', 'Delve', 'pick'), chat('/remaining', 'Remaining', 'skull'), chat('/dnd', 'Do not disturb', 'bell'),
    chat('/passives', 'Passives', 'tree'), chat('/exit', 'Char select', 'door')],
  // Row 3: links
  [link('https://poe.how/economy', 'Economy', 'chart'), link('https://poe.ninja/poe1/builds', 'Builds', 'sword'),
    ['regex', { label: 'Bad map mods', regex: '"!reflect|no regen"', glyph: 'magnifier' }],
    link('https://www.pathofexile.com/trade/search/{league}', 'Trade', 'scales'), link('https://www.poewiki.net/', 'Wiki', 'book'),
    link('https://poedb.tw/us/', 'poedb', 'db'), link('https://www.craftofexile.com/', 'Craft of Exile', 'anvil'),
    ['nav-next', {}]],
];

// Page 2: Bossing (poe.how)
const boss = (name) => ['boss', { mode: 'boss', boss: name }];
const rank = (n) => ['boss', { mode: 'rank', rank: n }];
const rows2 = [
  [['boss', { mode: 'summary' }], rank(1), rank(2), rank(3), rank(4), rank(5), rank(6), rank(7)],
  [boss('Uber Shaper'), boss('Uber Uber Elder'), boss('Uber Maven'), boss('Uber Sirus'), boss('Uber Cortex'),
    boss('Uber Eater of Worlds'), boss('Uber Searing Exarch'), boss('Uber Atziri')],
  [boss('Zorath, Vile Assembled'), boss('Aul, the Crystal King'), boss('Saresh, of the Weeping Black'), boss('Velka, the Tide Witch'),
    boss('Hive Colony'), boss('The King in the Mists'), boss('Uber Incarnation of Fear'), boss('Uber Incarnation of Neglect')],
  [boss('Shaper'), boss('Elder'), boss('Maven'), boss('Sirus'), boss('Searing Exarch'), boss('The Eater of Worlds'),
    boss('The Black Star'), ['nav-prev', {}]],
];

const NAMES = { price: 'Price', pricecheck: 'Price check', movers: 'Market movers', league: 'League', chat: 'Chat command', link: 'PoE link', regex: 'Regex search', boss: 'Boss profit' };

function build(rs, page) {
  const out = [];
  rs.forEach((r, row) => r.forEach(([kind, settings], col) => out.push({ page, col, row, kind, action: kind.startsWith('nav-') ? null : P + kind, name: NAMES[kind], settings })));
  return out;
}
const pages = [build(rows, 0), build(rows2, 1)];
const keys = pages[0];

module.exports = { keys, pages, PREFIX: P };
