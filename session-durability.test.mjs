#!/usr/bin/env node
// Tests for SESSION DURABILITY — the 2026-07-01 incident rule.
//
// Four hours into a refactor, the zellij client kicked the user out; within
// seconds the session-watchdog force-deleted the live session, and relaunching
// would have too (launch.cmd deleted any existing session before attaching).
// With session_serialization off there was nothing to resurrect: every agent and
// the whole working session were unrecoverably gone.
//
// The rule these tests pin: NO keystroke, client crash, or window close may ever
// irrecoverably destroy a session. Launchers REATTACH; deletion happens only as a
// deliberate, prompted recovery choice. Any edit that reintroduces an automatic
// kill must fail here.
//
// Run: node session-durability.test.mjs   (zero deps; exits non-zero on failure)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(APP, ...p), 'utf8');

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('  ok   ' + name); }
  else { console.log('  FAIL ' + name); failures++; }
}

// --- the watchdog (killed sessions 4s after the client dropped) is gone -------
check('session-watchdog.mjs no longer exists',
  !fs.existsSync(path.join(APP, 'session-watchdog.mjs')));

for (const ahk of ['claude-cc.ahk', 'open-control-center.ahk']) {
  // Comments may (and do) mention these to document the rule — strip them first.
  const code = read('workspace', 'windows', ahk).replace(/^\s*;.*$/gm, '');
  check(ahk + ' spawns no watchdog', !/watchdog/i.test(code));
  check(ahk + ' never deletes a session', !code.includes('delete-session'));
}

// --- launch.cmd reattaches; deletion only in the prompted recovery branch -----
{
  const src = read('workspace', 'windows', 'launch.cmd');
  const attachAt = src.indexOf('zellij attach -c claude-cc');
  const deleteAt = src.indexOf('delete-session');
  check('launch.cmd attaches to (resumes) an existing session', attachAt !== -1);
  check('launch.cmd has NO delete-session before the attach',
    deleteAt === -1 || deleteAt > attachAt);
  check('any delete-session sits behind an explicit keypress prompt',
    deleteAt === -1 || (src.indexOf('choice ') !== -1 && src.indexOf('choice ') < deleteAt));
}

// --- the root launch.cmd is a trampoline, not a second launcher ---------------
{
  const src = read('launch.cmd');
  check('root launch.cmd defers to workspace\\windows\\launch.cmd',
    src.includes('workspace\\windows\\launch.cmd'));
  check('root launch.cmd runs no zellij commands of its own', !/^\s*zellij/m.test(src));
}

// --- zellij config keeps sessions durable --------------------------------------
{
  const kdl = read('workspace', 'zellij', 'config.kdl');
  check('window close detaches instead of quitting', /on_force_close\s+"detach"/.test(kdl));
  check('sessions are serialized to disk (resurrectable)', /session_serialization\s+true/.test(kdl));
  check('copy_command is a per-OS token, not hardcoded pbcopy',
    kdl.includes('{{COPY_COMMAND}}') && !/^\s*copy_command/m.test(kdl));
}

// --- install.mjs renders the copy token per OS ---------------------------------
{
  const src = read('install.mjs');
  check('install.mjs renders {{COPY_COMMAND}}', src.includes("'{{COPY_COMMAND}}'"));
  check('pbcopy is macOS-only in the render', /MAC\s*\?\s*'copy_command "pbcopy"'/.test(src));
}

if (failures) { console.log('\n' + failures + ' FAILURE(S)'); process.exit(1); }
console.log('\nALL PASS');
