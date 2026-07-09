#!/usr/bin/env node
// tabbar.mjs — the tab strip, drawn by us instead of zellij's `zellij:tab-bar`.
//
// Why replace the built-in plugin:
//   - It renders chevrons ("Zellij (claude-cc) > Home > jobhunt >"), not tabs, and
//     prefixes every strip with the session name.
//   - It has no close affordance at all, so closing a window meant remembering
//     Ctrl+Alt+Q — and after a restart, session_serialization brings every old tab
//     back, so you had to do that chord once per stale tab.
//   - It cannot be restyled without a third-party WASM plugin, and this repo is
//     Node built-ins only.
//
// So: a one-row pane that draws real tab pills with a clickable ✕. The rounded caps
// are the half-block trick — ▐ and ▌ painted in the pill's own colour, so the block
// fills the half of the cell facing the label and the pill appears to have round
// ends. Works in any truecolor terminal; no Nerd Font, no glyph gamble.
//
// Mouse: the pane asks for SGR mouse reporting (DECSET 1000 + 1006). Zellij forwards
// mouse events to a pane that requests tracking — the same path that makes vim and
// htop clickable inside zellij — so clicks land here as `ESC [ < b ; col ; row M`.
// Click a pill to switch to it; click its ✕ to close that window. Home has no ✕:
// it is the dashboard and closing it is exactly the bug we just fixed.
//
// Tab state comes from zellij's own live session metadata (name/position/active and
// the STABLE tab_id, which is what `close-tab-by-id` wants — closing by position
// would race with the focus change). If that file can't be located on this platform
// we fall back to the CLI (`query-tab-names` + `current-tab-info`) and close by
// position instead. Zero deps; the pane never exits.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentTheme } from './themes.mjs';

const ESC = '\x1b';
const RESET = ESC + '[0m';
const CLOSE_GLYPH = '✕';

// Button events, SGR-encoded, plus focus in/out reports (1004).
const MOUSE_ON = ESC + '[?1000h' + ESC + '[?1006h' + ESC + '[?1004h';
const MOUSE_OFF = ESC + '[?1004l' + ESC + '[?1006l' + ESC + '[?1000l';

const rgbFg = ([r, g, b]) => `${ESC}[38;2;${r};${g};${b}m`;
const rgbBg = ([r, g, b]) => `${ESC}[48;2;${r};${g};${b}m`;

function cols() { return (process.stdout.columns && process.stdout.columns > 0) ? process.stdout.columns : 80; }
function session() { return process.env.ZELLIJ_SESSION_NAME || ''; }

// ---------- zellij CLI ----------
function zellij(args) {
  try {
    const r = spawnSync('zellij', args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    return r.status === 0 ? String(r.stdout || '') : null;
  } catch { return null; }
}

// ---------- tab state ----------
// Zellij writes live session metadata into its cache dir. The layout of that dir
// differs per platform (and carries a `contract_version_N` level), so probe rather
// than hardcode; a miss just means we use the slower CLI path.
function metadataPath() {
  const s = session();
  if (!s) return null;
  const home = os.homedir();
  const roots = [];
  if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, 'Zellij', 'cache'));
  if (process.env.XDG_CACHE_HOME) roots.push(path.join(process.env.XDG_CACHE_HOME, 'zellij'));
  roots.push(path.join(home, '.cache', 'zellij'));
  roots.push(path.join(home, 'Library', 'Caches', 'org.Zellij-Contributors.zellij'));
  for (const root of roots) {
    const direct = path.join(root, 'session_info', s, 'session-metadata.kdl');
    try { if (fs.existsSync(direct)) return direct; } catch { /* */ }
    let kids = [];
    try { kids = fs.readdirSync(root); } catch { continue; }
    for (const k of kids) {
      const p = path.join(root, k, 'session_info', s, 'session-metadata.kdl');
      try { if (fs.existsSync(p)) return p; } catch { /* */ }
    }
  }
  return null;
}

// Pull the `tab { … }` blocks out of session-metadata.kdl. Exported for tests.
export function parseTabs(kdl) {
  const tabs = [];
  const re = /\n {4}tab \{([\s\S]*?)\n {4}\}/g;
  let m;
  while ((m = re.exec(kdl)) !== null) {
    const b = m[1];
    const name = (b.match(/\n\s+name "((?:[^"\\]|\\.)*)"/) || [])[1];
    const pos = (b.match(/\n\s+position (\d+)/) || [])[1];
    const id = (b.match(/\n\s+tab_id (\d+)/) || [])[1];
    if (name == null || pos == null) continue;
    tabs.push({
      name: name.replace(/\\(.)/g, '$1'),
      position: Number(pos),
      id: id == null ? null : Number(id),
      active: /\n\s+active true/.test(b),
    });
  }
  tabs.sort((a, b) => a.position - b.position);
  return tabs;
}

function readTabsFromCli() {
  const names = zellij(['action', 'query-tab-names']);
  if (names == null) return [];
  const info = zellij(['action', 'current-tab-info']) || '';
  const activePos = Number((info.match(/position:\s*(\d+)/) || [])[1] ?? 0);
  return names.split(/\r?\n/).filter((l) => l.length).map((name, i) => ({
    name, position: i, id: null, active: i === activePos,
  }));
}

let metaPath = null, metaProbed = false;
function readTabs() {
  if (!metaProbed) { metaPath = metadataPath(); metaProbed = true; }
  if (metaPath) {
    try {
      const tabs = parseTabs(fs.readFileSync(metaPath, 'utf8'));
      if (tabs.length) return tabs;
    } catch { /* fall through to the CLI */ }
  }
  return readTabsFromCli();
}

// ---------- rendering ----------
// A tab is closable unless it is the Home dashboard (position 0).
const closable = (t) => t.position !== 0;

// Lay the pills out left to right, recording where each one — and each ✕ — lives,
// so a click can be resolved back to a tab. Pure, so it can be unit-tested without
// a terminal. Columns are 1-based, matching what SGR mouse reports send.
export const GAP = 1;                                     // blank column between pills

export function layout(tabs, width) {
  const segs = [];
  let col = 1;
  for (const t of tabs) {
    const label = ' ' + t.name + ' ' + (closable(t) ? CLOSE_GLYPH + ' ' : '');
    const cells = label.length + 2;                       // + the two half-block caps
    if (col + cells - 1 > width) break;                   // no room; overflow marker below
    const closeCol = closable(t) ? col + 1 + label.length - 2 : null;
    segs.push({ tab: t, start: col, end: col + cells - 1, closeCol, label });
    col += cells + GAP;
  }
  return { segs, used: segs.length ? segs[segs.length - 1].end : 0, hidden: tabs.length - segs.length };
}

function paint(tabs) {
  const th = currentTheme().zellij;
  const { segs, hidden } = layout(tabs, cols());
  let out = ESC + '[2K\r';                                 // clear the row, home the cursor
  for (const s of segs) {
    // Active pill: solid `strong` block, background ink. Inactive: muted `dim`.
    const pill = s.tab.active ? th.strong : th.dim;
    const ink = s.tab.active ? th.bg : th.fg;
    out += rgbFg(pill) + '▐' + rgbBg(pill) + rgbFg(ink) + (s.tab.active ? ESC + '[1m' : '') + s.label + RESET;
    out += rgbFg(pill) + '▌' + RESET + ' '.repeat(GAP);
  }
  if (hidden > 0) out += rgbFg(th.dim) + ' +' + hidden + RESET;   // too narrow to draw them all
  process.stdout.write(out);
  return segs;
}

// Resolve a click column against the laid-out pills. Pure, so the whole
// click→action mapping is unit-testable without a terminal or a zellij session.
//   'close'  — the ✕ (or the forgiving column just after it)
//   'switch' — anywhere else on an inactive pill
//   null     — the active pill (already there), a gap, or past the last tab
export function resolveClick(segs, col) {
  const hit = segs.find((s) => col >= s.start && col <= s.end);
  if (!hit) return { action: null, tab: null };
  if (hit.closeCol != null && (col === hit.closeCol || col === hit.closeCol + 1)) return { action: 'close', tab: hit.tab };
  if (!hit.tab.active) return { action: 'switch', tab: hit.tab };
  return { action: null, tab: hit.tab };
}

// ---------- actions ----------
function goToTab(t) { zellij(['action', 'go-to-tab', String(t.position + 1)]); }
function closeTab(t) {
  if (!closable(t)) return;
  if (t.id != null) { zellij(['action', 'close-tab-by-id', String(t.id)]); return; }
  // CLI fallback: no stable id available, so focus then close.
  goToTab(t);
  zellij(['action', 'close-tab']);
}

// ---------- main ----------
let segs = [];
let lastKey = '';

function refresh(force) {
  const tabs = readTabs();
  // Re-paint only when something actually changed — this row redraws on a timer and
  // a needless write per tick makes the strip flicker.
  const key = cols() + '|' + tabs.map((t) => `${t.position}:${t.id}:${t.active ? 1 : 0}:${t.name}`).join(',');
  if (!force && key === lastKey) return;
  lastKey = key;
  segs = paint(tabs);
}

// This strip must never HOLD focus. It is one row tall with nothing to type into, so
// landing on it (Alt+Up from the top of a tab, or a click) looks like the keyboard
// died. The old `zellij:tab-bar` was a plugin and could declare itself unselectable;
// terminal panes cannot, and zellij's layout format has no `selectable` key. So we
// bounce: stdin only reaches a FOCUSED pane, and 1004 reports focus directly — either
// signal means focus is here, and we hand it straight back to the content pane.
let lastBounce = 0;
function bounceFocus() {
  const now = Date.now();
  if (now - lastBounce < 400) return;                      // never ping-pong
  lastBounce = now;
  zellij(['action', 'focus-next-pane']);
}

// SGR mouse press: ESC [ < btn ; col ; row M   (release ends with `m`)
// Focus reports:   ESC [ I  (focus in)   ESC [ O  (focus out)
function onInput(buf) {
  let clicked = false, switchedTab = false;

  const re = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
  let m;
  while ((m = re.exec(buf)) !== null) {
    const [btn, col, , kind] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]];
    if (kind !== 'M' || (btn & 3) !== 0) continue;         // left-button press only
    const { action, tab } = resolveClick(segs, col);
    if (!action) continue;
    clicked = true;
    if (action === 'close') { closeTab(tab); switchedTab = true; }
    else { goToTab(tab); switchedTab = true; }
    setTimeout(() => refresh(true), 120);                  // let zellij apply it first
  }

  // Whatever is left after removing mouse reports and focus-out: a real keystroke.
  const rest = buf.replace(/\x1b\[<\d+;\d+;\d+[Mm]/g, '').replace(/\x1b\[O/g, '');
  const focusIn = rest.includes('\x1b[I');
  const typed = rest.replace(/\x1b\[I/g, '').length > 0;

  // Clicking a pill that switches or closes a tab already moves focus somewhere
  // sensible — bouncing on top of that would cycle the DESTINATION tab's panes.
  if (switchedTab) return;
  if (focusIn || typed || clicked) bounceFocus();
}

function isDirectRun() {
  try { return !!process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); }
  catch { return true; }
}

if (isDirectRun()) {
  const shutdown = () => { try { process.stdout.write(MOUSE_OFF); } catch { /* */ } process.exit(0); };
  process.stdout.write(MOUSE_ON);
  try { if (typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(true); } catch { /* */ }
  try { process.stdin.resume(); } catch { /* */ }
  process.stdin.on('data', (b) => { try { onInput(b.toString('latin1')); } catch { /* */ } });
  process.stdin.on('error', () => { /* */ });
  process.stdout.on('resize', () => refresh(true));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', () => { /* the pane must not close on a stray Ctrl+C */ });
  process.on('uncaughtException', () => { /* a bad frame must never kill the strip */ });
  refresh(true);
  setInterval(() => { try { refresh(false); } catch { /* */ } }, 350);
}
