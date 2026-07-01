#!/usr/bin/env node
// Tests that the Alt+S overlay actually CLOSES — the regression the buildSheet() unit
// test can't catch.
//
// cheatsheet.mjs closes its floating pane with `zellij action close-pane`. A previous
// version dropped that call and relied on a not-yet-deployed config flag, so the
// overlay stopped closing at all. Two guards here:
//   1. closePaneCommand() issues a close-pane under Zellij (the exact dropped call).
//   2. The marker-based toggle collapses the open overlay instead of stacking, and
//      every close path exits cleanly and cleans the marker up.
//
// Run: node overlay-close.test.mjs   (zero deps; exits non-zero on failure)

import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePaneCommand } from './cheatsheet.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (n, c, extra) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (!c && extra ? '  [' + extra + ']' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 1) The close command itself (platform-independent — no spawning). --------------
// Real Zellij sets ZELLIJ=0 (a truthy string). Under it we MUST issue close-pane;
// without it, closing is just process exit (null).
check('under Zellij, close issues `zellij action close-pane`',
  JSON.stringify(closePaneCommand({ ZELLIJ: '0' })) === JSON.stringify(['zellij', 'action', 'close-pane']));
check('outside Zellij, there is no pane to close (null)', closePaneCommand({}) === null);

// --- 2) Toggle + close lifecycle (real child processes; no Zellij needed). ----------
const SESSION = 'closetest';
const MARKER = path.join(os.tmpdir(), 'fleetview-cheatsheet-' + SESSION + '.lock');
try { fs.unlinkSync(MARKER); } catch { /* */ }
const env = { ...process.env, ZELLIJ_SESSION_NAME: SESSION };
delete env.ZELLIJ;   // no real zellij on this host; exercise the exit/marker paths
const open = () => spawn(process.execPath, ['cheatsheet.mjs'], { cwd: HERE, env, stdio: ['pipe', 'ignore', 'ignore'] });
const exists = () => fs.existsSync(MARKER);

// Keypress close: overlay opens (marker), a key dismisses it, marker is cleaned up.
const A = open();
await sleep(500);
check('overlay opened and wrote its marker', exists());
A.stdin.write('x');                                   // any key dismisses
check('overlay exits on a keypress', (await new Promise((r) => A.on('exit', r))) === 0);
await sleep(150);
check('marker cleaned up after a keypress close', !exists());

// Toggle: a second Alt+S collapses the open overlay instead of stacking a new one.
const B = open();                                     // first press → opens
await sleep(500);
check('second overlay opened', exists());
const C = open();                                     // second press → toggle-close
check('toggle press (C) exits cleanly', (await new Promise((r) => C.on('exit', r))) === 0);
check('open overlay (B) collapses on toggle', (await new Promise((r) => B.on('exit', r))) === 0);
await sleep(150);
check('marker gone after toggle (no stacking)', !exists());

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
