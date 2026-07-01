#!/usr/bin/env node
// cheatsheet.mjs — the EXPANDED shortcut overlay. Opened as a floating pane by Alt+S
// (bound in workspace/zellij/config.kdl) from any tab. It lists EVERYTHING you can do
// in plain English — one line per shortcut, a dotted leader tying each key to its
// description, grouped by where it applies and split into sub-sections. All text comes
// from shortcuts.mjs (the single source of truth), so it can never drift from the real
// bindings. Zero deps.
//
// Toggle, not stack: Alt+S is a global Zellij bind, so while the overlay is focused
// Zellij intercepts Alt+S BEFORE our stdin — pressing it again would spawn ANOTHER
// overlay on top. To make Alt+S close as well as open, the first overlay drops a
// session-scoped marker file; a second Alt+S sees that marker, deletes it (which the
// open overlay polls for and reacts to), and exits — so the two cancel out and the
// overlay collapses. Any other key still dismisses it too.
//
// Closing is by `zellij action close-pane` (as the original did): it closes the pane
// that ran this script. That is safe here because both close paths act within the
// floating-pane layer — a keypress means WE are focused, and after a toggle Zellij
// returns focus to the remaining floating overlay, never to a tiled agent. Agents
// still only die from a deliberate Ctrl+Alt+W / Ctrl+Alt+Q.

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { IN_TAB, DASHBOARD } from './shortcuts.mjs';

const ESC = '\x1b';
const RESET = ESC + '[0m';
const BOLD = ESC + '[1m';
const GREEN = ESC + '[38;5;47m';
const DGREEN = ESC + '[38;5;28m';
const CYAN = ESC + '[38;5;51m';
const CLEAR = ESC + '[2J' + ESC + '[H';
const HIDE = ESC + '[?25l';
const SHOW = ESC + '[?25h';

// Greedy word-wrap to `width` columns. Returns at least one (possibly empty) line.
// A safety net for narrow overlays; the descriptions are written to fit one line on a
// normally-sized window.
function wrap(text, width) {
  const lines = [];
  let cur = '';
  for (const word of String(text).split(/\s+/)) {
    if (cur && cur.length + 1 + word.length > width) { lines.push(cur); cur = word; }
    else cur = cur ? cur + ' ' + word : word;
  }
  lines.push(cur);
  return lines;
}

// Distinct `section` values in first-seen order.
function sectionsOf(items) {
  const seen = [];
  for (const it of items) if (it.section && !seen.includes(it.section)) seen.push(it.section);
  return seen;
}

// Build the overlay as an array of lines. Pure (the only input is `width`) so a test
// can assert the structure and that every shortcut is present. `width` controls where
// an over-long description would wrap; the live draw() passes the real terminal width.
export function buildSheet(width = 100) {
  const all = IN_TAB.concat(DASHBOARD.flatMap((g) => g.items));
  const keyW = Math.max(...all.map((i) => i.keys.length)) + 3;   // key + dotted-leader field
  const INDENT = '    ';
  const GAP = '  ';
  const descCol = INDENT.length + keyW + GAP.length;             // column where text starts
  const descW = Math.max(30, width - descCol - 1);               // wrap width for descriptions
  const hang = ' '.repeat(descCol);

  // One shortcut → one line: the key, a dotted leader filling a fixed-width field so
  // every description lines up in the same column, then the plain-English text.
  const row = (it) => {
    const dots = '.'.repeat(Math.max(2, keyW - it.keys.length - 1));
    const lead = INDENT + CYAN + it.keys + RESET + ' ' + DGREEN + dots + RESET + GAP;
    const wrapped = wrap(it.desc || it.label, descW);
    const head = lead + GREEN + wrapped[0] + RESET;
    const rest = wrapped.slice(1).map((l) => hang + GREEN + l + RESET);
    return [head, ...rest];
  };
  const ctx = (s) => BOLD + GREEN + '  ' + s + RESET;            // big context header
  const sub = (s) => '   ' + BOLD + DGREEN + s + RESET;         // dim sub-section header

  const L = [];
  L.push(BOLD + GREEN + '  KEYBOARD SHORTCUTS' + RESET);
  L.push('  ' + DGREEN + 'press Alt+S again, or any other key, to close' + RESET);
  L.push('');
  L.push(ctx('IN AN AGENT WINDOW'));
  for (const sec of sectionsOf(IN_TAB)) {
    L.push(sub(sec));
    for (const it of IN_TAB.filter((i) => i.section === sec)) L.push(...row(it));
  }
  L.push('');
  L.push(ctx('ON THE HOME DASHBOARD'));
  for (const grp of DASHBOARD) {
    L.push(sub(grp.row));
    for (const it of grp.items) L.push(...row(it));
  }
  return L;
}

function cols() { return (process.stdout.columns && process.stdout.columns > 0) ? process.stdout.columns : 100; }
function draw() { try { process.stdout.write(CLEAR + HIDE + buildSheet(cols()).join('\r\n') + '\r\n'); } catch { /* */ } }

// --- Toggle marker -----------------------------------------------------------------
// One marker file per Zellij session holds the PID of the open overlay.
const SESSION = process.env.ZELLIJ_SESSION_NAME || 'default';
const MARKER = path.join(os.tmpdir(), 'fleetview-cheatsheet-' + SESSION + '.lock');

function markerPid() { try { return parseInt(fs.readFileSync(MARKER, 'utf8').trim(), 10) || 0; } catch { return 0; } }
function alive(pid) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
// Remove the marker only if it is still OURS, so we never clobber a newer overlay's.
function dropMarker() { try { if (markerPid() === process.pid) fs.unlinkSync(MARKER); } catch { /* */ } }

// The argv that closes our own floating pane, or null when we are NOT under Zellij
// (a test / bare terminal), where exiting is all we can do. Exported so a test can pin
// that a close command IS issued under Zellij — dropping it was the bug that left the
// overlay un-closable. `env` is injectable for that test.
export function closePaneCommand(env = process.env) {
  return env.ZELLIJ ? ['zellij', 'action', 'close-pane'] : null;
}
function closePane() { const c = closePaneCommand(); if (c) { try { spawnSync(c[0], c.slice(1), { stdio: 'ignore' }); } catch { /* */ } } }

// Collapse this overlay: restore the cursor, release the marker, and close the pane
// that ran us. Under Zellij `close-pane` targets this pane; without Zellij we just exit.
function closeSelf() {
  try { process.stdout.write(SHOW); } catch { /* */ }
  dropMarker();
  closePane();
  process.exit(0);
}

function isDirectRun() {
  try { return !!process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); }
  catch { return true; }
}
if (isDirectRun()) {
  const open = markerPid();
  if (open && open !== process.pid && alive(open)) {
    // An overlay is already open → this Alt+S is a TOGGLE-CLOSE. Delete the marker
    // (the open overlay polls for this and collapses itself) and close this freshly
    // spawned pane. We draw nothing, so the flash is momentary.
    try { fs.unlinkSync(MARKER); } catch { /* */ }
    closePane();
    process.exit(0);
  }
  // We are the overlay (a stale/dead marker is simply overwritten). Claim it and draw.
  try { fs.writeFileSync(MARKER, String(process.pid)); } catch { /* */ }
  draw();
  process.stdout.on('resize', draw);
  try { process.stdin.setRawMode(true); } catch { /* */ }
  process.stdin.resume();
  process.stdin.on('data', closeSelf);   // ANY key dismisses the overlay
  // Poll the marker: if a later Alt+S (or anything else) removes it, collapse.
  const watch = setInterval(() => { if (markerPid() !== process.pid) closeSelf(); }, 150);
  if (watch.unref) watch.unref();
  process.on('SIGINT', closeSelf);
  process.on('SIGTERM', () => { dropMarker(); process.exit(0); });
  process.on('exit', dropMarker);
}
