#!/usr/bin/env node
// Tests for the orientation-aware agent-tab layout generator.
//
// The old layouts tiled N agents as N side-by-side columns regardless of monitor
// orientation, so on a PORTRAIT monitor everything came out as tall narrow slivers.
// home.mjs now sizes a balanced grid to the current window: stacked rows when the
// window is taller than wide, side-by-side columns when it is wider. chooseGrid is
// the pure decision; these lock in the behavior the user asked for.
//
// Run: node layout-grid.test.mjs   (zero deps; exits non-zero on failure)

import { chooseGrid, rowCounts, genLayout } from './home.mjs';

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('  ok   ' + name); }
  else { console.log('  FAIL ' + name); failures++; }
}

// A realistic portrait monitor (1080x1920 px ~= 135 cols x 120 rows of ~8x16 cells).
const PORTRAIT = [135, 120];
// A realistic landscape monitor (2560x1440 px ~= 320 cols x 90 rows).
const LANDSCAPE = [320, 90];

// --- Portrait: the case the user hit. 2 agents must STACK (squares), not column. ---
check('portrait 2 agents -> 2 rows (stacked squares), 1 per row',
  (() => { const g = chooseGrid(2, ...PORTRAIT); return g.rows === 2 && g.cols === 1; })());
check('portrait 4 agents -> 2x2 grid',
  (() => { const g = chooseGrid(4, ...PORTRAIT); return g.rows === 2 && g.cols === 2; })());
check('portrait 1 agent -> single pane',
  (() => { const g = chooseGrid(1, ...PORTRAIT); return g.rows === 1 && g.cols === 1; })());

// --- Landscape: the same counts should lay out side-by-side instead. ---
check('landscape 2 agents -> 1 row, 2 columns',
  (() => { const g = chooseGrid(2, ...LANDSCAPE); return g.rows === 1 && g.cols === 2; })());
check('landscape 4 agents -> 2 rows x 2 cols',
  (() => { const g = chooseGrid(4, ...LANDSCAPE); return g.rows === 2; })());

// --- rowCounts distributes evenly, earlier rows take the remainder, sums to n. ---
check('rowCounts(5,3) = [2,2,1]', JSON.stringify(rowCounts(5, 3)) === '[2,2,1]');
check('rowCounts(8,4) = [2,2,2,2]', JSON.stringify(rowCounts(8, 4)) === '[2,2,2,2]');
for (let n = 1; n <= 8; n++) {
  const g = chooseGrid(n, ...PORTRAIT);
  const counts = rowCounts(n, g.rows);
  check(`n=${n}: rows hold exactly n agents`, counts.reduce((a, b) => a + b, 0) === n);
  check(`n=${n}: no empty rows`, counts.every((c) => c >= 1));
}

// --- genLayout output is structurally sound: one pane per agent + the top hint row
//     (hintbar), no bottom strip, and every node is properly terminated. ---
for (let n = 1; n <= 8; n++) {
  const kdl = genLayout(n, '/x'); // window read from process.stdout (defaults are fine here)
  const agents = (kdl.match(/command="claude"/g) || []).length;
  check(`genLayout(${n}) emits ${n} claude panes`, agents === n);
  check(`genLayout(${n}) puts the hintbar row at the top`, kdl.includes('/x/hintbar.mjs'));
  check(`genLayout(${n}) has no bottom shortcut strip (removed)`,
    !kdl.includes('agentbar.mjs') && !kdl.includes('separator.mjs'));
  // every `args "..."` child node must end in a terminator before its closing brace
  check(`genLayout(${n}) terminates inline args nodes (the parse bug)`,
    !/\.mjs"\s+\}/.test(kdl));
}

if (failures) { console.log('\n' + failures + ' FAILURE(S)'); process.exit(1); }
console.log('\nALL PASS');
