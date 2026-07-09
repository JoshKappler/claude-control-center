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

import fs2 from 'node:fs';
import os2 from 'node:os';
import path2 from 'node:path';

// Hermetic folder list: home.mjs reads state.cwd from CC_ROOT at import time, and
// __renderFrame re-lists it every frame. Without this the assertions below counted
// the REAL projects folder — on a machine with few projects, "folder list exceeds
// the old 8-row cap" failed with the layout code fully correct.
const SYNTH_ROOT = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'cc-render-test-'));
for (let i = 0; i < 40; i++) fs2.mkdirSync(path2.join(SYNTH_ROOT, 'folder-' + String(i).padStart(2, '0')));
process.env.CC_ROOT = SYNTH_ROOT;
const { __renderFrame } = await import('./home.mjs');
process.on('exit', () => { try { fs2.rmSync(SYNTH_ROOT, { recursive: true, force: true }); } catch { /* */ } });

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
// cheat sheet) total ~34 rows. SHORT heights are the ones that used to break: the
// frame was emitted at full height regardless, so the terminal scrolled and the
// title + folder list — which sit at the TOP — slid off the screen. The user saw a
// dashboard that began at LAUNCH, with no projects to pick from. Every height here
// must fit, and the top of the frame must survive; the cheat sheet at the BOTTOM is
// what gets sacrificed when there isn't room (Alt+S still shows every shortcut).
for (const rows of [70, 50, 40, 34, 30, 24]) {
  const cols = 100;
  const lines = frameLines(rows, cols);
  const text = lines.join('\n');

  // (1) Fits the screen: rendered height never exceeds the viewport (leave the
  //     bottom row clear so the trailing newline can't scroll the header away).
  //     This is THE invariant — a frame taller than the pane scrolls the top away.
  check(`rows=${rows}: frame fits (${lines.length} <= ${rows - 1})`, lines.length <= rows - 1, `${lines.length} lines`);

  // (2) The top of the frame always survives: title, the current folder path, and
  //     the FOLDERS header. If these scroll off, the dashboard looks decapitated.
  check(`rows=${rows}: title visible`, lines.some((l) => l.includes('CLAUDE CONTROL CENTER')), 'title scrolled off');
  check(`rows=${rows}: Folder path visible`, lines.some((l) => l.startsWith('Folder ')));
  check(`rows=${rows}: FOLDERS header visible`, lines.some((l) => l.includes('FOLDERS')));

  // (3) The duplicate top guide is gone.
  check(`rows=${rows}: no duplicate top "Use the ARROW KEYS" guide`, !text.includes('Use the ARROW KEYS'));

  // (4) There is ALWAYS a project list to pick from — that is the whole point of
  //     the screen. It grows with height; a taller screen shows strictly more.
  const folderStart = lines.findIndex((l) => l.includes('FOLDERS'));
  const launchIdx = lines.findIndex((l) => l.startsWith('LAUNCH'));
  const folderCount = (folderStart !== -1)
    ? lines.slice(folderStart + 1, launchIdx === -1 ? lines.length : launchIdx).filter((l) => l.trim() && !l.includes('---')).length
    : 0;
  check(`rows=${rows}: folder list is non-empty`, folderCount > 0, `${folderCount} rows`);
  if (rows === 50) check('rows=50: folder list exceeds the old 8-row cap', folderCount > 8, `${folderCount} folder rows`);

  // (5) Cheat sheet is pinned to the bottom — but only when the screen is tall
  //     enough to hold it. On short screens it is the first thing dropped.
  if (rows >= 40) {
    const windowIdx = lines.findIndex((l) => l.startsWith('WINDOW'));
    check(`rows=${rows}: WINDOW cheat-sheet row present`, windowIdx !== -1);
    check(`rows=${rows}: cheat sheet is the bottom-most content`, windowIdx === lines.length - 1, `WINDOW at ${windowIdx}/${lines.length - 1}`);
    check(`rows=${rows}: MOVE + DO + WINDOW all present`,
      lines.some((l) => l.startsWith('MOVE')) && lines.some((l) => l.startsWith('DO')) && windowIdx !== -1);
  }
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
