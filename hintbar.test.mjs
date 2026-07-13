#!/usr/bin/env node
// Tests for the agent-tab hint row (hintbar.mjs).
//
// The row exists because a user can be STRANDED in an agent tab: the tab strip's
// pills/✕ can't receive real clicks (zellij never routes mouse events to the
// never-focused strip pane), so the escape keys must be visible on screen. These
// lock in: the rescue keys are present, they derive from shortcuts.mjs (no drift),
// essentials survive narrow panes, and the row never overflows its width.
//
// Run: node hintbar.test.mjs   (zero deps; exits non-zero on failure)

import { buildHint } from './hintbar.mjs';
import { MOD } from './shortcuts.mjs';

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('  ok   ' + name); }
  else { console.log('  FAIL ' + name); failures++; }
}

const wide = buildHint(220);
check('wide hint names the Home escape', wide.includes(MOD + '+H = Home'));
check('wide hint names the shortcut overlay', wide.includes(MOD + '+S = all shortcuts'));
check('wide hint covers agent switching', wide.includes('switch agent'));
check('wide hint covers closing an agent', wide.includes('close agent'));

// Narrow pane: non-essential groups drop from the end, the two rescues survive.
const narrow = buildHint(40);
check('narrow hint keeps the Home escape', narrow.includes(MOD + '+H'));
check('narrow hint keeps the overlay key', narrow.includes(MOD + '+S'));

// The row is one line and never wider than the pane at any width.
for (const w of [10, 40, 80, 220]) {
  const h = buildHint(w);
  check(`width ${w}: fits and stays one line`, h.length <= w && !h.includes('\n'));
}

if (failures) { console.log('\n' + failures + ' FAILURE(S)'); process.exit(1); }
console.log('\nALL PASS');
