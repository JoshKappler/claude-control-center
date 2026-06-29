#!/usr/bin/env node
// agentbar.mjs — the one-line shortcut strip pinned at the BOTTOM of every agent
// tab. Rendered as a solid reversed strip (green bar, dark text) so it is obvious
// among the agents' own green UIs. Text comes from shortcuts.mjs (the single
// source of truth); essential groups (close agent, close window, lock) never drop
// even on a narrow window. Stays alive (the pane would close if it exited) and
// re-renders on resize. Zero deps.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IN_TAB, fitGroups } from './shortcuts.mjs';

const ESC = '\x1b';
const RESET = ESC + '[0m';
const BOLD = ESC + '[1m';
const REV = ESC + '[7m';   // reverse video — turns the whole row into a solid bar

function cols() { return (process.stdout.columns && process.stdout.columns > 0) ? process.stdout.columns : 80; }

const SEP = '   .   ';
const KSEP = ' / ';
// Build the bar text for a given width and pad it to fill the row (so the reversed
// bar is solid). Degrades gracefully: as many groups as fit WITH labels; if even
// the essential labels are too wide (narrow pane), fall back to keys-only so the
// essential KEYS (close agent, close window, lock) are never lost.
export function buildBar(width) {
  const W = Math.max(1, width);
  let groups = fitGroups(IN_TAB, W - 2, SEP);                          // labeled
  let body = groups.map((g) => g.keys + ' = ' + g.label).join(SEP);
  if (body.length > W - 2) {                                          // labels overflow -> keys only
    groups = fitGroups(IN_TAB, W - 2, KSEP, (g) => g.keys);
    body = groups.map((g) => g.keys).join(KSEP);
  }
  let line = ' ' + body;
  if (line.length > W) line = line.slice(0, W);
  if (line.length < W) line += ' '.repeat(W - line.length);
  return line;
}

function draw() {
  // Clear the single row and rewrite it as one solid reversed bar (no newline —
  // that would scroll the pane).
  try { process.stdout.write(ESC + '[2K\r' + REV + BOLD + buildBar(cols()) + RESET); } catch { /* */ }
}

// Run the live loop only when executed directly (stay importable for tests).
function isDirectRun() {
  try { return !!process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); }
  catch { return true; }
}
if (isDirectRun()) {
  draw();
  process.stdout.on('resize', draw);
  // Keep the process (and therefore the pane) alive. Re-draw periodically too, so
  // the bar reappears if the pane is cleared/redrawn by Zellij.
  setInterval(draw, 5000);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}
