#!/usr/bin/env node
// hintbar.mjs — a SUBTLE one-row hint pinned at the bottom of each agent window,
// advertising the single key that reveals the full plain-English shortcut list
// (Alt+S → cheatsheet.mjs). Rendered as dim green text on black — NOT a solid
// reversed bar (that read as a "strange green bar") — so it's a quiet footnote, not
// chrome. Stays alive (the pane would close if it exited) and re-renders on resize.
// Zero deps.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ESC = '\x1b';
const RESET = ESC + '[0m';
const DIM = ESC + '[2m' + ESC + '[38;5;28m';   // dim, dark-green — quiet on black

function cols() { return (process.stdout.columns && process.stdout.columns > 0) ? process.stdout.columns : 80; }

const HINT = ' Press Alt+S for keyboard shortcuts';

// Build the hint text, clipped to the row width (no padding — dim text, not a bar).
export function buildHint(width) {
  const W = Math.max(1, width);
  return HINT.length > W ? HINT.slice(0, W) : HINT;
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
