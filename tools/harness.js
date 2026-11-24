// Fake Stream Deck app: WebSocket server that loads the 32-key layout into the plugin and records images.
const http = require('http'); const crypto = require('crypto'); const fs = require('fs'); const path = require('path');
const { spawn } = require('child_process');
const { pages } = require('./layout');
const keys = pages.flat().filter((k) => k.action);
const OUT = path.join(__dirname, 'out'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'keys'), { recursive: true });
const PLUGIN = path.join(__dirname, '..', 'plugin', 'com.poehow.exile-deck.sdPlugin');
const DATA = path.join(OUT, 'data');
const images = {}; const events = [];
let sock; let buf = Buffer.alloc(0);
function sendFrame(obj) { const p = Buffer.from(JSON.stringify(obj)); let h; if (p.length < 126) { h = Buffer.from([0x81, p.length]); } else if (p.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(p.length, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(p.length), 2); } sock.write(Buffer.concat([h, p])); }
function parse() { for (;;) { if (buf.length < 2) return; let len = buf[1] & 0x7f, off = 2; if (len === 126) { len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); off = 10; } const masked = buf[1] & 0x80; if (!masked) throw new Error('client frame not masked'); if (buf.length < off + 4 + len) return; const mask = buf.subarray(off, off + 4); const p = Buffer.from(buf.subarray(off + 4, off + 4 + len)); for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3]; buf = buf.subarray(off + 4 + len); if ((buf[0] & 0x0f) === 8) return; onMsg(JSON.parse(p.toString())); } }
const ctx = (k) => `ctx-${k.page}-${k.col}-${k.row}`;
function onMsg(m) {
  events.push(m.event);
  if (m.event === 'registerPlugin') {
    sendFrame({ event: 'didReceiveGlobalSettings', payload: { settings: {} } });
    sendFrame({ event: 'sendToPlugin', action: 'com.poehow.exile-deck.price', context: 'ctx-0-3-1', payload: { req: 'names', type: 'UniqueAccessory' } });
    sendFrame({ event: 'sendToPlugin', action: 'com.poehow.exile-deck.league', context: 'ctx-0-0-0', payload: { req: 'meta' } });
    for (const k of keys) sendFrame({ event: 'willAppear', action: k.action, context: ctx(k), device: 'dev', payload: { settings: k.settings, coordinates: { column: k.col, row: k.row }, isInMultiAction: false } });
  }
  if (m.event === 'setImage') { images[m.context] = (images[m.context] || []); images[m.context].push(m.payload.image); }
  if (m.event === 'openUrl') fs.appendFileSync(path.join(OUT, 'urls.log'), m.payload.url + '\n');
  if (m.event === 'sendToPropertyInspector') fs.writeFileSync(path.join(OUT, 'pi-' + Object.keys(m.payload)[0] + '.json'), JSON.stringify(m.payload).slice(0, 4000));
}
const server = http.createServer();
server.on('upgrade', (req, s) => { sock = s; const acc = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'); s.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`); s.on('data', (d) => { buf = Buffer.concat([buf, d]); parse(); }); });
const press = (k, held = 80) => { sendFrame({ event: 'keyDown', action: k.action, context: ctx(k), payload: {} }); setTimeout(() => sendFrame({ event: 'keyUp', action: k.action, context: ctx(k), payload: {} }), held); };
const find = (col, row, page = 0) => keys.find((k) => k.page === page && k.col === col && k.row === row);
function dump(tag) {
  for (const k of keys) { const arr = images[ctx(k)]; if (!arr) continue; const last = arr[arr.length - 1]; const svg = Buffer.from(last.split(',')[1], 'base64').toString(); fs.writeFileSync(path.join(OUT, 'keys', `${tag}_p${k.page}_${k.row}_${k.col}.svg`), svg); }
}
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  fs.writeFileSync(path.join(__dirname, 'out', 'clip.txt'), fs.readFileSync(path.join(__dirname, 'clip_' + (process.env.CLIP || 'mageblood') + '.txt')));
  const child = spawn(process.execPath, ['--require', path.join(__dirname, 'mockfetch.js'), path.join(PLUGIN, 'bin', 'plugin.js'), '-port', String(port), '-pluginUUID', 'com.poehow.exile-deck', '-registerEvent', 'registerPlugin', '-info', '{}'], { env: { ...process.env, EXILE_DECK_DATA: DATA, EXILE_DECK_STUB_CLIP: path.join(OUT, 'clip.txt'), EXILE_DECK_STUB_LOG: path.join(OUT, 'input.log') }, stdio: 'inherit' });
  setTimeout(() => { dump('a');
    press(find(1, 0));              // Divine -> chart view
    press(find(1, 1));              // movers up -> next
    press(find(0, 1));              // price check
    press(find(0, 2));              // chat /hideout
    press(find(3, 3));              // trade link
    press(find(2, 3));              // regex -> paste into search
    setTimeout(() => press(find(2, 3), 800), 400); // regex -> copy
    press(find(0, 0));              // league -> open poe.how
    press(find(3, 1), 800);         // Mageblood long press -> trade search
    press(find(0, 1, 1));           // Uber Shaper -> detail
    press(find(1, 2, 1), 800);      // Aul long press -> poe.how page
    press(find(0, 0, 1));           // summary -> poe.how
  }, 2500);
  setTimeout(() => { dump('b'); fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify(events.reduce((a, e) => (a[e] = (a[e] || 0) + 1, a), {}))); child.kill(); server.close(); process.exit(0); }, 5000);
});
