#!/usr/bin/env node
// hintbar.mjs — the one-row COLLAPSED hint pinned directly under the tab strip on
// every tab (Home and agent windows). It advertises the single key that reveals the
// full, plain-English shortcut list (Alt+S → cheatsheet.mjs). Rendered as a solid
// reversed bar so it reads as a header, not as content. Replaces the old black
// separator row — it both separates the green tab-bar from the content AND tells you
// how to get help. Stays alive (the pane would close if it exited) and re-renders on
// resize. Zero deps.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ESC = '\x1b';
const RESET = ESC + '[0m';
const BOLD = ESC + '[1m';
const REV = ESC + '[7m';   // reverse video — turns the whole row into a solid bar

function cols() { return (process.stdout.columns && process.stdout.columns > 0) ? process.stdout.columns : 80; }

const HINT = ' Alt+S  —  keyboard shortcuts';

// Build the bar text padded to fill the row (so the reversed bar is solid).
export function buildHint(width) {
  const W = Math.max(1, width);
  let line = HINT;
  if (line.length > W) line = line.slice(0, W);
  if (line.length < W) line += ' '.repeat(W - line.length);
  return line;
}

function draw() {
  try { process.stdout.write(ESC + '[2K\r' + REV + BOLD + buildHint(cols()) + RESET); } catch { /* */ }
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
