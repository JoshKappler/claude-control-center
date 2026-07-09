#!/usr/bin/env node
// home-pane.mjs — the supervisor that OWNS the Home pane.
//
// Why this exists (the 2026-07-08 incident):
//
//   The Home tab used to run `node home.mjs` as the pane's command directly. The
//   moment that process exited — a stray `q`, a Ctrl+C, an uncaught exception —
//   the dashboard was gone. Worse, and this is the part that made it permanent:
//   with `session_serialization true`, zellij re-serializes the session and writes
//   an EXITED command pane back out WITHOUT its `command=` line. The saved layout
//   for the Home tab degraded to a bare
//
//       pane focus=true borderless=true      // no command — nothing to re-run
//
//   so every subsequent `zellij attach -c claude-cc` resurrected Home as an EMPTY
//   pane. No dashboard, no project list, no way back, across every future launch.
//   The tab strip survived only because it is a plugin pane, not a process — which
//   is exactly why the window looked like "the tabs are fine, Home is gone".
//
// The fix is structural: the pane's command is THIS process, and this process
// never exits. home.mjs becomes a child we can restart at will. zellij therefore
// never sees the pane's command exit, never drops `command=`, and Home always
// comes back — on relaunch, on resurrection, after a crash, after a stray key.
//
// Crashes are not swallowed: every abnormal exit is appended to
// <stateRoot>/home-crash.log with its code/signal, and the reason is printed into
// the pane before the restart, so a repeating failure is visible instead of
// looking like a flicker. (That log is also how we will finally catch whatever
// keystroke has been killing Home — it records the exit, every time.)
//
// Zero deps, self-locating: run it as `node home-pane.mjs`; it finds home.mjs next
// to itself and forwards any extra argv straight through.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME_SCRIPT = path.join(HERE, 'home.mjs');

function stateRoot() { return path.join(os.homedir(), '.claude', 'state', 'cc'); }
function crashLog() { return path.join(stateRoot(), 'home-crash.log'); }

function logCrash(line) {
  try {
    fs.mkdirSync(stateRoot(), { recursive: true });
    fs.appendFileSync(crashLog(), new Date().toISOString() + '  ' + line + '\n', 'utf8');
  } catch { /* a broken log must never take Home down with it */ }
}

// Restarting instantly forever would spin the CPU if home.mjs dies on startup (a
// syntax error, a missing dep). A run that survives at least this long is treated
// as healthy and resets the backoff; anything shorter escalates the wait.
const HEALTHY_MS = 4000;
const BACKOFF_MS = [0, 250, 1000, 3000, 8000, 15000];

// The supervisor must outlive the signals that kill the dashboard. Ctrl+C in the
// pane reaches home.mjs as a raw 0x03 byte (it runs in raw mode), not as a signal,
// so ignoring these here costs nothing and stops a stray signal from orphaning the
// pane. SIGTERM is honoured: that is zellij deliberately closing the pane.
process.on('SIGINT', () => { /* never die on Ctrl+C */ });
process.on('SIGHUP', () => { /* never die on a client detach */ });

let strike = 0;
for (;;) {
  const startedAt = Date.now();

  // stdio 'inherit': home.mjs owns the pane's real tty directly, so raw mode,
  // process.stdout.rows and the resize signal all behave exactly as they did when
  // it was the pane's command. The supervisor is invisible.
  const r = spawnSync(process.execPath, [HOME_SCRIPT, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, CC_SUPERVISED: '1' },
  });

  const ranFor = Date.now() - startedAt;
  const how = r.signal ? `signal ${r.signal}` : `exit code ${r.status}`;
  const clean = !r.signal && r.status === 0;

  if (r.error) logCrash(`spawn failed: ${r.error.message}`);
  else logCrash(`home.mjs ended after ${ranFor}ms (${how})`);

  strike = ranFor >= HEALTHY_MS ? 0 : Math.min(strike + 1, BACKOFF_MS.length - 1);
  const wait = BACKOFF_MS[strike];

  // Leave the alternate screen home.mjs may have died inside, so the notice below
  // lands on the pane's normal buffer instead of a screen that is about to vanish.
  try { process.stdout.write('\x1b[?1049l\x1b[?25h'); } catch { /* */ }

  if (!clean || wait > 0) {
    const why = clean ? 'closed' : `CRASHED (${how})`;
    try {
      process.stdout.write(
        `\r\n\x1b[33mHome ${why}. Restarting${wait ? ` in ${Math.round(wait / 1000)}s` : ' now'}...\x1b[0m\r\n` +
        `\x1b[2;33mLogged to ${crashLog()}\x1b[0m\r\n`);
    } catch { /* */ }
  }

  if (wait > 0) {
    // Block without a dependency and without a busy loop: Atomics.wait on a
    // throwaway buffer is the built-in sleep. (spawnSync already blocks, so the
    // event loop is not doing anything useful here anyway.)
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait); } catch { /* */ }
  }
}
