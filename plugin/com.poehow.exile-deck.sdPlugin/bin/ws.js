'use strict';
// Minimal RFC 6455 WebSocket client (text frames only) so the plugin has zero npm dependencies
// and runs on the Node 20 runtime bundled with Stream Deck.
const net = require('net');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class MiniWebSocket extends EventEmitter {
  constructor(port, host = '127.0.0.1') {
    super();
    this.host = host;
    this.port = port;
    this.buf = Buffer.alloc(0);
    this.open = false;
    this.fragments = [];
    this.fragOp = 1;
    this.key = crypto.randomBytes(16).toString('base64');
    this.sock = net.connect(port, host, () => {
      this.sock.write(
        `GET / HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${this.key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    this.sock.setNoDelay(true);
    this.sock.on('data', (d) => this._onData(d));
    this.sock.on('close', () => { const was = this.open; this.open = false; this.emit('close', was); });
    this.sock.on('error', (e) => this.emit('error', e));
  }

  _onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    if (!this.open) {
      const idx = this.buf.indexOf('\r\n\r\n');
      if (idx < 0) return;
      const head = this.buf.subarray(0, idx).toString('latin1');
      this.buf = this.buf.subarray(idx + 4);
      const expect = crypto.createHash('sha1').update(this.key + GUID).digest('base64');
      const m = /sec-websocket-accept:\s*(\S+)/i.exec(head);
      if (!/^HTTP\/1\.1 101/.test(head) || !m || m[1] !== expect) {
        this.emit('error', new Error('WebSocket handshake failed: ' + head.split('\r\n')[0]));
        this.sock.destroy();
        return;
      }
      this.open = true;
      this.emit('open');
    }
    this._parse();
  }

  _parse() {
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const op = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      let mask = null;
      if (masked) { if (b.length < off + 4) return; mask = b.subarray(off, off + 4); off += 4; }
      if (b.length < off + len) return;
      const payload = Buffer.from(b.subarray(off, off + len));
      this.buf = b.subarray(off + len);
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];

      if (op === 0x8) { try { this._frame(0x8, payload.subarray(0, 2)); } catch (_) {} this.sock.end(); return; }
      if (op === 0x9) { this._frame(0xA, payload); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        if (op !== 0x0) this.fragOp = op;
        this.fragments.push(payload);
        if (fin) {
          const data = this.fragments.length === 1 ? this.fragments[0] : Buffer.concat(this.fragments);
          this.fragments = [];
          if (this.fragOp === 0x1) this.emit('message', data.toString('utf8'));
        }
      }
    }
  }

  _frame(op, payload) {
    const len = payload.length;
    let header;
    if (len < 126) { header = Buffer.alloc(2); header[1] = 0x80 | len; }
    else if (len < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
    header[0] = 0x80 | op;
    const mask = crypto.randomBytes(4);
    const out = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
    this.sock.write(Buffer.concat([header, mask, out]));
  }

  send(str) {
    if (!this.open) return false;
    this._frame(0x1, Buffer.from(str, 'utf8'));
    return true;
  }

  close() { try { this._frame(0x8, Buffer.from([0x03, 0xe8])); } catch (_) {} this.sock.end(); }
}

module.exports = { MiniWebSocket };
