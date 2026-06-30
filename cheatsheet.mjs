#!/usr/bin/env node
// cheatsheet.mjs — the EXPANDED shortcut overlay. Opened as a floating pane by Alt+S
// (bound in workspace/zellij/config.kdl) from any tab, dismissed by ANY key. It lists
// EVERYTHING you can do, in plain English, grouped by where it applies — no
// truncation, no choosing what to show. All text comes from shortcuts.mjs (the single
// source of truth), so the overlay can never drift from the real bindings. Zero deps.

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

// DASHBOARD is grouped into rows of items; flatten to a single key/label list.
const HOME_ITEMS = DASHBOARD.flatMap((g) => g.items);

function pad(s, w) { return s.length >= w ? s : s + ' '.repeat(w - s.length); }

// Build the overlay as an array of lines. Pure (no ANSI-dependent logic) so a test
// can assert the structure and that every shortcut is present.
export function buildSheet() {
  const keyW = Math.max(...IN_TAB.concat(HOME_ITEMS).map((i) => i.keys.length)) + 2;
  const row = (it) => '    ' + CYAN + pad(it.keys, keyW) + RESET + DGREEN + '..  ' + RESET + GREEN + it.label + RESET;
  const head = (s) => BOLD + GREEN + '  ' + s + RESET;
  const L = [];
  L.push(BOLD + GREEN + '  KEYBOARD SHORTCUTS' + RESET + DGREEN + '     (press any key to close)' + RESET);
  L.push('');
  L.push(head('IN AN AGENT WINDOW'));
  for (const it of IN_TAB) L.push(row(it));
  L.push('');
  L.push(head('ON THE HOME DASHBOARD'));
  for (const it of HOME_ITEMS) L.push(row(it));
  return L;
}

function draw() {
  try { process.stdout.write(CLEAR + HIDE + buildSheet().join('\r\n') + '\r\n'); } catch { /* */ }
}

// Close ourselves: tell Zellij to close this floating pane, then exit. (If we are not
// running under Zellij — e.g. a test or a bare terminal — just exit.)
function closeSelf() {
  try { process.stdout.write(SHOW); } catch { /* */ }
  if (process.env.ZELLIJ) { try { spawnSync('zellij', ['action', 'close-pane'], { stdio: 'ignore' }); } catch { /* */ } }
  process.exit(0);
}

function isDirectRun() {
  try { return !!process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); }
  catch { return true; }
}
if (isDirectRun()) {
  draw();
  process.stdout.on('resize', draw);
  try { process.stdin.setRawMode(true); } catch { /* */ }
  process.stdin.resume();
  process.stdin.on('data', closeSelf);   // ANY key dismisses the overlay
  process.on('SIGINT', closeSelf);
  process.on('SIGTERM', () => process.exit(0));
}
