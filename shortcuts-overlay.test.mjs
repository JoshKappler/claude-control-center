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

// --- Hint never overflows its row and names the reveal key. ---
for (const w of [20, 80, 200]) {
  check(`buildHint(${w}) fits within ${w} cols`, buildHint(w).length <= w, `${buildHint(w).length}`);
}
check('hint names Alt+S', buildHint(80).includes('Alt+S'));

// --- Overlay lists BOTH contexts, every key, grouped into sub-sections. ---
const sheet = buildSheet();
const text = stripAnsi(sheet.join('\n'));
check('overlay has the agent-window section', text.includes('IN AN AGENT WINDOW'));
check('overlay has the home-dashboard section', text.includes('ON THE HOME DASHBOARD'));
// Closing is now a toggle — the header must say Alt+S (also) closes it.
check('overlay says Alt+S closes it', /alt\+s/i.test(text) && /close/i.test(text));
// Every agent-window key is listed and carries a fuller plain-English description.
for (const it of IN_TAB) {
  check(`overlay lists agent key "${it.keys}"`, text.includes(it.keys));
  check(`agent "${it.keys}" has a thorough description`, !!it.desc && it.desc.length >= 20);
}
const homeItems = DASHBOARD.flatMap((g) => g.items);
for (const it of homeItems) {
  check(`overlay lists home key "${it.keys}"`, text.includes(it.keys));
  check(`home "${it.keys}" has a thorough description`, !!it.desc && it.desc.length >= 20);
}
// Sub-section headers separate the agent-window keys into groups.
for (const sec of [...new Set(IN_TAB.map((i) => i.section))]) {
  check(`overlay shows the "${sec}" sub-section`, sec && text.includes(sec));
}
// Long descriptions wrap to the requested width (no line blows past it once ANSI is
// stripped), so a narrow overlay stays readable instead of running off the edge.
const narrow = stripAnsi(buildSheet(64).join('\n')).split('\n');
check('descriptions wrap to the overlay width', narrow.every((l) => l.length <= 64), `${Math.max(...narrow.map((l) => l.length))}`);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
