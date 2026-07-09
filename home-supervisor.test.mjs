#!/usr/bin/env node
// Pins the rule that came out of the 2026-07-08 incident:
//
//   NOTHING the user can type may end the Home process, and if Home dies anyway,
//   something must bring it back.
//
// Why it matters: the Home tab's pane ran `node home.mjs` directly. When that
// process exited, zellij (session_serialization true) rewrote the saved layout for
// the tab WITHOUT its `command=` line — so Home resurrected as an empty pane on
// every subsequent attach, forever. The tab strip survived (it is a plugin pane),
// which is why the window looked like "tabs fine, Home gone, can't get it back".
//
// Run: node home-supervisor.test.mjs   (zero deps; exits non-zero on failure)

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = path.join(HERE, 'home.mjs');
const SUPERVISOR = path.join(HERE, 'home-pane.mjs');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); failures++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Feed `bytes` to a fresh `node home.mjs` and report whether it exited.
// The dashboard drops input for the first ~1.5s (the terminal's startup
// query-response burst), so wait past that hard cap before typing.
async function typeInto(bytes, env) {
  const p = spawn(process.execPath, [HOME], { stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, ...env } });
  let exited = false;
  p.on('exit', () => { exited = true; });
  await sleep(1900);
  try { p.stdin.write(Buffer.from(bytes, 'latin1')); } catch { /* */ }
  await sleep(900);
  const alive = !exited;
  try { p.kill('SIGKILL'); } catch { /* */ }
  return alive;
}

console.log('home.mjs cannot be closed by a keystroke:');
// `q` used to call cleanupAndExit(0). It sat on the same cheat-sheet row as `g`
// (push) and `c` (pull) — one slip from destroying the dashboard permanently.
check('[q] no longer quits (supervised)', await typeInto('q', { CC_SUPERVISED: '1' }));
check('[q] no longer quits (standalone)', await typeInto('q', { CC_SUPERVISED: '' }));
check('Ctrl+C does not quit when supervised', await typeInto('\x03', { CC_SUPERVISED: '1' }));
// Standalone (`node home.mjs` in a plain terminal) it must still be interruptible,
// or the process would be unkillable from the keyboard outside the pane.
check('Ctrl+C still quits when standalone', !(await typeInto('\x03', { CC_SUPERVISED: '' })));
// A lone Esc was never a quit path, but it is the key the user reported. Pin it.
check('Esc does not quit', await typeInto('\x1b', { CC_SUPERVISED: '1' }));

console.log('\nthe Home pane is supervised, not bare:');
const layout = fs.readFileSync(path.join(HERE, 'workspace', 'zellij', 'layouts', 'cc-default.kdl'), 'utf8');
check('cc-default.kdl runs home-pane.mjs', /home-pane\.mjs/.test(layout));
check('cc-default.kdl does NOT run home.mjs directly',
  !/args\s+"[^"]*\/home\.mjs"/.test(layout), 'a bare home.mjs pane is the bug');
check('home-pane.mjs exists', fs.existsSync(SUPERVISOR));

const sup = fs.readFileSync(SUPERVISOR, 'utf8');
check('supervisor loops forever (never exits)', /for\s*\(;;\)/.test(sup));
check('supervisor logs crashes', /home-crash\.log/.test(sup));
check('supervisor backs off on rapid crash loops', /BACKOFF_MS/.test(sup));

console.log('\nthe cheat sheet no longer advertises a quit key:');
const shortcuts = fs.readFileSync(path.join(HERE, 'shortcuts.mjs'), 'utf8');
check("shortcuts.mjs has no 'quit' item", !/label:\s*'quit'/.test(shortcuts));

console.log('\nhome.mjs records crashes instead of dying silently:');
const home = fs.readFileSync(HOME, 'utf8');
check('uncaughtException is handled', /uncaughtException/.test(home));
check('unhandledRejection is handled', /unhandledRejection/.test(home));
check('tick() guards redraw()', /try\s*\{\s*redraw\(\);\s*\}\s*catch/.test(home));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
