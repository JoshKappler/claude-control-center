#!/usr/bin/env node
// hintbar.mjs — a SUBTLE one-row hint pinned at the bottom of each agent window,
// advertising the single key that reveals the full plain-English shortcut list
// (Alt+S → cheatsheet.mjs). Rendered as dim green text on black — NOT a solid
// reversed bar (that read as a "strange green bar") — so it's a quiet footnote, not
// chrome. Stays alive (the pane would close if it exited) and re-renders on resize.
// Zero deps.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IN_TAB, fitGroups, osKeys } from './shortcuts.mjs';
import { tuiSgr } from './themes.mjs';

const ESC = '\x1b';
const RESET = ESC + '[0m';
const DIM = ESC + '[2m' + tuiSgr().DIM;   // dim + the theme's muted ink — a quiet footnote

function cols() { return (process.stdout.columns && process.stdout.columns > 0) ? process.stdout.columns : 80; }

// Back in every generated agent tab (2026-07-13): the Alt+S overlay only helps if
// you already know Alt+S, and the tab strip can't receive real clicks (zellij never
// routes mouse to the never-focused strip pane), so this row must name the actual
// escape keys. Keys come from shortcuts.mjs — the single source the overlay and the
// Home cheatsheet read — so the hint can never drift from the real bindings.
// `essential` groups survive any width (fitGroups drops non-essential from the end).
const PICK = [
  { label: 'jump to the Home dashboard', short: 'Home', essential: true },
  { label: 'move between agents', short: 'switch agent' },
  { label: 'jump to window 1-9', short: 'window 1-9' },
  { label: 'close this one agent', short: 'close agent' },
  { label: 'show / hide this list', short: 'all shortcuts', essential: true },
];
const GROUPS = PICK
  .map((p) => {
    const it = IN_TAB.find((g) => g.label === p.label);
    return it ? { keys: it.keys, label: p.short, essential: !!p.essential } : null;
  })
  .filter(Boolean);

// Build the hint text, clipped to the row width (no padding — dim text, not a bar).
// If shortcuts.mjs ever drifts so far that nothing matches, fall back to the old
// bare Alt+S pointer rather than rendering an empty row.
export function buildHint(width) {
  const W = Math.max(1, width);
  const line = GROUPS.length
    ? ' ' + fitGroups(GROUPS, W - 1).map((g) => g.keys + ' = ' + g.label).join('   .   ')
    : osKeys(' Press Alt+S for keyboard shortcuts');
  return line.length > W ? line.slice(0, W) : line;
}

function draw() {
  try { process.stdout.write(ESC + '[2K\r' + DIM + buildHint(cols()) + RESET); } catch { /* */ }
}

function isDirectRun() {
  try { return !!process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); }
  catch { return true; }
}
if (isDirectRun()) {
  draw();
  process.stdout.on('resize', draw);
  setInterval(draw, 5000);   // redraw periodically in case Zellij clears the row
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}
