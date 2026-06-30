#!/usr/bin/env node
// Tests for the expandable shortcut overlay (Alt+S) and the collapsed top hint.
//
// The overlay (cheatsheet.mjs) and the hint (hintbar.mjs) both exist so the in-tab
// shortcuts are DISCOVERABLE without truncation. These pin: the hint fills its row,
// the overlay lists BOTH contexts with one line per shortcut, and the source-of-truth
// list still carries the keys users were missing (resize, home).
//
// Run: node shortcuts-overlay.test.mjs   (zero deps; exits non-zero on failure)

import { IN_TAB, DASHBOARD } from './shortcuts.mjs';
import { buildHint } from './hintbar.mjs';
import { buildSheet } from './cheatsheet.mjs';

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); failures++; }
}
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

// --- IN_TAB carries the keys the user was missing, every entry has keys + label. ---
const labels = IN_TAB.map((i) => i.label).join(' | ');
check('IN_TAB has a "resize" shortcut', /resize/i.test(labels));
check('IN_TAB has a "Home" shortcut', IN_TAB.some((i) => /home/i.test(i.label)));
check('every IN_TAB entry has non-empty keys + label',
  IN_TAB.every((i) => i.keys && i.label) && IN_TAB.length >= 7);

// --- Hint fills the row exactly and names the reveal key. ---
for (const w of [20, 80, 200]) {
  const line = buildHint(w);
  check(`buildHint(${w}) is exactly ${w} wide`, line.length === w, `${line.length}`);
}
check('hint names Alt+S', stripAnsi(buildHint(80)).includes('Alt+S'));

// --- Overlay lists BOTH contexts, one line per shortcut, untruncated. ---
const sheet = buildSheet();
const text = stripAnsi(sheet.join('\n'));
check('overlay has the agent-window section', text.includes('IN AN AGENT WINDOW'));
check('overlay has the home-dashboard section', text.includes('ON THE HOME DASHBOARD'));
check('overlay tells you how to close it', /press any key/i.test(text));
for (const it of IN_TAB) {
  check(`overlay lists agent key "${it.keys}"`, text.includes(it.keys) && text.includes(it.label));
}
const homeItems = DASHBOARD.flatMap((g) => g.items);
for (const it of homeItems) {
  check(`overlay lists home key "${it.keys}"`, text.includes(it.label));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
