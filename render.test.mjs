#!/usr/bin/env node
// Layout regression test for the Home dashboard.
//
// Pins the two guarantees the folder-list rework introduced:
//   1. The folder list FILLS the available height (no fixed 8-row cap) so as many
//      folders as fit are shown, and the frame never exceeds the screen (the
//      MOVE/DO/WINDOW cheat sheet stays on-screen at the bottom — nothing tiles off).
//   2. The duplicate top "Use the ARROW KEYS …" guide is gone; the cheat sheet
//      lives only at the bottom.
//
// Run: node render.test.mjs   (zero deps; exits non-zero on failure)

import { __renderFrame } from './home.mjs';

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); failures++; }
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
function frameLines(rows, cols) {
  const raw = __renderFrame(rows, cols);
  // The frame is HOME + line1 + CR/LF + line2 … + trailing CRLF + clear-below.
  const lines = stripAnsi(raw).split('\n').map((l) => l.replace(/\r/g, ''));
  // Drop a trailing empty element produced by the final CRLF.
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// The dashboard's fixed sections (header, launch, sync, limits, subagents, system,
// cheat sheet) total ~30 rows, so it needs a realistic terminal height. The real
// window is a tall vertical monitor, so these are the sizes that matter.
for (const rows of [70, 50, 40]) {
  const cols = 100;
  const lines = frameLines(rows, cols);
  const text = lines.join('\n');

  // (1) Fits the screen: rendered height never exceeds the viewport (leave the
  //     bottom row clear so the trailing newline can't scroll the header away).
  check(`rows=${rows}: frame fits (${lines.length} <= ${rows - 1})`, lines.length <= rows - 1, `${lines.length} lines`);

  // (2) Cheat sheet is present and is the LAST content (pinned to the bottom).
  const windowIdx = lines.findIndex((l) => l.startsWith('WINDOW'));
  check(`rows=${rows}: WINDOW cheat-sheet row present`, windowIdx !== -1);
  check(`rows=${rows}: cheat sheet is the bottom-most content`, windowIdx === lines.length - 1, `WINDOW at ${windowIdx}/${lines.length - 1}`);
  check(`rows=${rows}: MOVE + DO + WINDOW all present`,
    lines.some((l) => l.startsWith('MOVE')) && lines.some((l) => l.startsWith('DO')) && windowIdx !== -1);

  // (3) The duplicate top guide is gone.
  check(`rows=${rows}: no duplicate top "Use the ARROW KEYS" guide`, !text.includes('Use the ARROW KEYS'));

  // (4) Folder list grows with height: a taller screen shows strictly more folders.
  const folderStart = lines.findIndex((l) => l.includes('FOLDERS'));
  const launchIdx = lines.findIndex((l) => l.startsWith('LAUNCH'));
  const folderCount = (folderStart !== -1 && launchIdx !== -1)
    ? lines.slice(folderStart + 1, launchIdx).filter((l) => l.trim() && !l.includes('---')).length
    : 0;
  check(`rows=${rows}: folder list is non-empty`, folderCount > 0, `${folderCount} rows`);
  if (rows === 50) check('rows=50: folder list exceeds the old 8-row cap', folderCount > 8, `${folderCount} folder rows`);
}

// Graceful floor: on an unrealistically short terminal the folder list collapses to
// its 3-row minimum (rather than vanishing or throwing). Full fit isn't possible
// when the fixed sections alone exceed the height — that's an inherent minimum.
{
  const lines = frameLines(24, 100);
  const fs = lines.findIndex((l) => l.includes('FOLDERS'));
  const li = lines.findIndex((l) => l.startsWith('LAUNCH'));
  const fc = (fs !== -1 && li !== -1) ? lines.slice(fs + 1, li).filter((l) => l.trim() && !l.includes('---')).length : 0;
  check('rows=24: folder list holds at its 3-row floor', fc === 3, `${fc} rows`);
}

// A tall screen must show more folders than a short one (the list truly fills).
const tall = frameLines(50, 100);
const short = frameLines(24, 100);
const countFolders = (lines) => {
  const fs = lines.findIndex((l) => l.includes('FOLDERS'));
  const li = lines.findIndex((l) => l.startsWith('LAUNCH'));
  return (fs !== -1 && li !== -1) ? lines.slice(fs + 1, li).filter((l) => l.trim() && !l.includes('---')).length : 0;
};
check('taller screen shows more folders than a short one', countFolders(tall) > countFolders(short),
  `tall=${countFolders(tall)} short=${countFolders(short)}`);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
