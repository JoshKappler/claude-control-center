#!/usr/bin/env node
// cheatsheet.mjs — the EXPANDED shortcut overlay. Opened as a big floating pane by Alt+S
// (bound in workspace/zellij/config.kdl, sized to ~90% of the screen there) from any tab.
// It lists EVERYTHING you can do as a clean two-column table — the key on the left, a
// brief description on the right, always on the same line (the key never wraps). On a
// wide pane the two contexts (agent window | dashboard) sit side by side to fill the
// screen; on a narrow one they stack. All text comes from shortcuts.mjs (the single
// source of truth), so it can never drift from the real bindings. Zero deps.
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

// Truncate `s` to `n` visible columns, marking a cut with a trailing ~. Keys are never
// fed through this — only descriptions — so a key can never be clipped or wrapped.
function truncate(s, n) {
  s = String(s == null ? '' : s);
  if (n <= 0) return '';
  if (s.length <= n) return s;
  return s.slice(0, Math.max(1, n - 1)) + '~';
}

// Distinct `section` values in first-seen order.
function sectionsOf(items) {
  const seen = [];
  for (const it of items) if (it.section && !seen.includes(it.section)) seen.push(it.section);
  return seen;
}

// Build the overlay as an array of lines: a clean two-column table — the key on the
// LEFT, a brief description on the RIGHT, always on the SAME line. The key is never
// wrapped or truncated; only an over-long description is clipped (never wrapped), so a
// line can never run off the edge. On a wide overlay the two contexts sit SIDE BY SIDE
// (agent window | dashboard) to fill the screen; on a narrow one they stack. Pure (the
// only input is `width`) so a test can assert structure + that every shortcut is present
// and that no line exceeds `width`. The live draw() passes the real pane width.
export function buildSheet(width = 100) {
  const leftGroups = sectionsOf(IN_TAB).map((sec) => ({ head: sec, items: IN_TAB.filter((i) => i.section === sec) }));
  const rightGroups = DASHBOARD.map((g) => ({ head: g.row, items: g.items }));

  // Render one titled panel to { plain, colored } rows sized to `pw` visible columns.
  // `plain` (no ANSI) is what we measure/pad against; `colored` is what we print.
  const panel = (title, groups) => (pw) => {
    const keyW = Math.max(...groups.flatMap((g) => g.items.map((i) => i.keys.length)));
    const descW = Math.max(4, pw - 2 - keyW - 2);               // 2 indent + key + 2 gap + desc
    const rows = [{ plain: title, colored: BOLD + GREEN + title + RESET }];
    for (const g of groups) {
      rows.push({ plain: '', colored: '' });
      rows.push({ plain: '  ' + g.head, colored: '  ' + BOLD + DGREEN + g.head + RESET });
      for (const it of g.items) {
        const gap = ' '.repeat(keyW - it.keys.length + 2);
        const d = truncate(it.desc || it.label, descW);
        rows.push({ plain: '  ' + it.keys + gap + d,
          colored: '  ' + CYAN + it.keys + RESET + gap + GREEN + d + RESET });
      }
    }
    return rows;
  };
  const mkLeft = panel('IN AN AGENT WINDOW', leftGroups);
  const mkRight = panel('ON THE HOME DASHBOARD', rightGroups);

  const L = [];
  L.push(BOLD + GREEN + '  KEYBOARD SHORTCUTS' + RESET);
  L.push('  ' + DGREEN + 'press Alt+S again, or any other key, to close' + RESET);
  L.push('');

  const TWO_COL_MIN = 88;
  if (width >= TWO_COL_MIN) {
    const pw = Math.floor((width - 3) / 2);                     // two panels + a 3-space gutter
    const left = mkLeft(pw), right = mkRight(pw);
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const l = left[i] || { plain: '', colored: '' };
      const r = right[i] || { plain: '', colored: '' };
      L.push(l.colored + ' '.repeat(Math.max(0, pw - l.plain.length)) + '   ' + r.colored);
    }
  } else {
    for (const row of mkLeft(width)) L.push(row.colored);
    L.push('');
    for (const row of mkRight(width)) L.push(row.colored);
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
