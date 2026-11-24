'use strict';
// Bridge to a long-running PowerShell helper that sends keystrokes to the Path of Exile window
// and reads/restores the clipboard. Kept warm so a key press reacts in well under a second.
const { spawn } = require('child_process');
const readline = require('readline');

class InputHelper {
  constructor(script, log) {
    this.script = script;
    this.log = log || (() => {});
    this.proc = null;
    this.pending = new Map();
    this.seq = 0;
    this.stub = process.platform !== 'win32' || !!process.env.EXILE_DECK_STUB_CLIP;
    this.stubHandler = null; // set by the test harness
    if (this.stub && process.env.EXILE_DECK_STUB_CLIP) {
      // Test hook: serve clipboard text from a file instead of the game.
      const fs = require('fs');
      const sent = process.env.EXILE_DECK_STUB_LOG;
      this.stubHandler = (cmd, extra) => {
        if (sent) fs.appendFileSync(sent, JSON.stringify({ cmd, ...extra }) + '\n');
        if (cmd === 'copy') {
          try { return { ok: true, text: fs.readFileSync(process.env.EXILE_DECK_STUB_CLIP, 'utf8') }; }
          catch (_) { return { ok: false, error: 'empty' }; }
        }
        if (cmd === 'getclip') return { ok: true, text: fs.readFileSync(process.env.EXILE_DECK_STUB_CLIP, 'utf8') };
        if (cmd === 'chat' || cmd === 'search' || cmd === 'setclip') return { ok: true };
        return { ok: true, version: 'stub' };
      };
    }
  }

  _start() {
    const p = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', this.script], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    readline.createInterface({ input: p.stdout }).on('line', (line) => {
      let m;
      try { m = JSON.parse(line.replace(/^﻿/, '')); } catch (_) { if (line.trim()) this.log('helper:', line.slice(0, 300)); return; }
      const cb = this.pending.get(m.id);
      if (cb) { this.pending.delete(m.id); clearTimeout(cb.t); cb.resolve(m); }
    });
    p.stderr.on('data', (d) => this.log('helper stderr:', String(d).trim().slice(0, 500)));
    p.on('error', (e) => this.log('helper spawn error', e.message));
    p.on('exit', (code) => {
      this.log('helper exited', code);
      if (this.proc === p) this.proc = null;
      for (const [id, cb] of this.pending) { clearTimeout(cb.t); cb.resolve({ id, ok: false, error: 'helper-exit' }); }
      this.pending.clear();
    });
    this.proc = p;
  }

  call(cmd, extra = {}, timeoutMs = 6000) {
    if (this.stub) return Promise.resolve(this.stubHandler ? this.stubHandler(cmd, extra) : { ok: false, error: 'unsupported' });
    if (!this.proc) { this._start(); timeoutMs = Math.max(timeoutMs, 20000); }
    const id = ++this.seq;
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.pending.delete(id); resolve({ id, ok: false, error: 'timeout' }); }, timeoutMs);
      this.pending.set(id, { resolve, t });
      try { this.proc.stdin.write(JSON.stringify({ id, cmd, ...extra }) + '\n'); }
      catch (e) { clearTimeout(t); this.pending.delete(id); resolve({ id, ok: false, error: e.message }); }
    });
  }

  warm() {
    this.call('ping', {}, 20000).then((r) => this.log('input helper', r.ok ? 'ready (PowerShell ' + r.version + ')' : 'failed: ' + r.error));
  }

  stop() { if (this.proc) { try { this.proc.stdin.end(); this.proc.kill(); } catch (_) {} this.proc = null; } }
}

module.exports = { InputHelper };
