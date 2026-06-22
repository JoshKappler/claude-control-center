#!/usr/bin/env node
// session-watchdog.mjs <sessionName>
//
// Ties the Control Center's Zellij session lifetime to its window. Spawned by the
// AHK launcher *outside* the WezTerm window's process tree, so it survives the
// window closing. It polls the session's attached-client count; once a client has
// attached and then drops to zero (the window was closed), it force-kills the
// session so it — and every CLI/agent pane in it — does not keep running in the
// background.
//
// Why this exists: zellij's `on_force_close "quit"` does NOT fire on Windows when
// the terminal window closes. WezTerm terminates the zellij *client*, but the
// detached zellij *server* breaks away from the job and survives, leaving the
// session (and its agents) running headless. This watchdog is the reliable fix.
//
// Zero npm deps; resolves zellij by full path so it works from a thin PATH.

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const session = (process.argv[2] || 'claude-cc').trim();
const POLL_MS = 2000;
const APPEAR_GRACE_MS = 30000;          // how long to wait for the session to first appear
const ZELLIJ = resolveZellij();

let seenClient = false;                 // has a client ever been attached?
let zeroStreak = 0;                     // consecutive polls with 0 clients (debounce)
const startedAt = Date.now();
let timer = null;

function resolveZellij() {
  const cands = [path.join(process.env.LOCALAPPDATA || '', 'Zellij', 'zellij.exe'), 'zellij'];
  for (const c of cands) {
    try {
      const r = spawnSync(c, ['--version'], { timeout: 4000, stdio: 'ignore' });
      if (!r.error && r.status === 0) return c;
    } catch { /* try next */ }
  }
  return 'zellij';
}

// Attached-client count for the session, or -1 if the session/server is gone.
function clientCount() {
  const r = spawnSync(ZELLIJ, ['-s', session, 'action', 'list-clients'], { encoding: 'utf8', timeout: 6000 });
  if (r.error || r.status !== 0) return -1;
  const out = (r.stdout || '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');   // strip ANSI
  return out.split('\n').filter((l) => l.trim() && !/^CLIENT_ID/i.test(l)).length;
}

function killSession() {
  try { spawnSync(ZELLIJ, ['delete-session', session, '--force'], { timeout: 8000, stdio: 'ignore' }); } catch { /* */ }
}

function finish() { if (timer) clearInterval(timer); process.exit(0); }

function poll() {
  const n = clientCount();
  if (n < 0) {
    // Session/server is gone. Done if it had been alive, or if it never appeared.
    if (seenClient || Date.now() - startedAt > APPEAR_GRACE_MS) finish();
    return;
  }
  if (n > 0) { seenClient = true; zeroStreak = 0; return; }
  // n === 0
  if (!seenClient) return;              // still starting up — no client yet
  zeroStreak += 1;
  if (zeroStreak >= 2) { killSession(); finish(); }   // 2 zeros in a row = window really closed
}

timer = setInterval(poll, POLL_MS);
poll();
setTimeout(finish, 1000 * 60 * 60 * 12);   // hard safety cap — never run forever
