#!/usr/bin/env node
// shortcuts.mjs — the ONE source of truth for every advertised keyboard shortcut.
// cheatsheet.mjs (the Alt+S overlay) and home.mjs (footer + help overlay) both render
// from this data, so the hints can never drift apart again. The actual
// in-tab key BINDINGS live in workspace/zellij/config.kdl (Zellij can't import JS),
// which install.mjs deploys to ~/.config/zellij/config.kdl; keep that file's
// keybinds in sync with IN_TAB below. Zero deps.
//
// PLATFORM-AWARE LABELS: the binding is always the terminal's Alt modifier, but on a
// Mac the key that SENDS Alt is labeled Option — showing "Alt+S" on a Mac keyboard
// reads as a key that doesn't exist. osKeys() renders every advertised hint with the
// name printed on THIS machine's keyboard (Opt on macOS, Alt elsewhere). Always route
// key labels through it; never hard-code "Alt+…" in UI text.

const MAC = process.platform === 'darwin';
export const MOD = MAC ? 'Opt' : 'Alt';
export function osKeys(s) { return MAC ? String(s).replace(/\bAlt\b/g, 'Opt') : String(s); }

// In-tab shortcuts (bound by zellij in workspace/zellij/config.kdl), in priority
// order — the Home footer's WINDOW row keeps as many as fit from the FRONT (using the
// short `label`). The Alt+S overlay (cheatsheet.mjs) shows the full list, untruncated,
// grouped by `section`, with the fuller `desc` spelled out in plain English. Keep
// `label` short (it shares the cramped footer); put the detail in `desc`.
//
// Alt+Tab is only advertised on macOS/Linux — on Windows the OS owns that combo, so
// there the window-jump story is Alt+1-9 alone (the binding is harmless everywhere).
export const IN_TAB = [
  { keys: osKeys('Alt+Arrows'), label: 'move between agents', section: 'MOVE',
    desc: 'move focus between the agents in this window' },
  ...(MAC ? [{ keys: osKeys('Alt+Tab'), label: 'next window', section: 'MOVE',
    desc: 'switch to the next window (cycles around)' }] : []),
  { keys: osKeys('Alt+1-9'), label: 'jump to window 1-9', section: 'MOVE',
    desc: 'jump straight to window 1-9 (1 = Home)' },
  { keys: osKeys('Alt+H'), label: 'jump to the Home dashboard', section: 'MOVE',
    desc: 'jump to the Home dashboard (window 1)' },
  { keys: osKeys('Alt+= / Alt+-'), label: 'grow / shrink agent', section: 'RESIZE',
    desc: 'grow / shrink the focused agent' },
  { keys: 'Drag a border', label: 'resize with the mouse', section: 'RESIZE',
    desc: 'drag any pane border with the mouse — same resize, pointer-style' },
  { keys: osKeys('Alt+Shift+Arrows'), label: 'push an edge', section: 'RESIZE',
    desc: 'push the focused agent\'s edge in that direction (fine-tuning)' },
  { keys: osKeys('Alt+A'), label: 'add another agent here', section: 'AGENTS & WINDOWS',
    desc: 'add another agent here' },
  { keys: osKeys('Ctrl+Alt+W'), label: 'close this one agent', section: 'AGENTS & WINDOWS',
    desc: 'close the focused agent' },
  { keys: osKeys('Ctrl+Alt+Q'), label: 'close this whole window', section: 'AGENTS & WINDOWS',
    desc: 'close this whole window' },
  { keys: osKeys('Alt+I'), label: 'subagent monitor', section: 'DISCOVER & ESCAPE',
    desc: 'open the subagent monitor' },
  { keys: 'Ctrl+G', label: 'pass all keys to Claude', section: 'DISCOVER & ESCAPE',
    desc: 'pass all keys to Claude' },
  { keys: osKeys('Alt+S'), label: 'show / hide this list', section: 'DISCOVER & ESCAPE',
    desc: osKeys('show / hide this list (Alt+S again closes)') },
  { keys: 'Mouse Wheel', label: 'scroll the chat', section: 'SCROLL THE CHAT',
    desc: 'scroll the chat history (the pane border shows SCROLL: line/total while scrolled)' },
  { keys: osKeys('Alt+PgUp/PgDn'), label: 'page through the chat', section: 'SCROLL THE CHAT',
    desc: 'page up / down through the chat history from the keyboard' },
  { keys: osKeys('Alt+End'), label: 'snap back to live', section: 'SCROLL THE CHAT',
    desc: 'jump back to the live end of the chat (the newest output)' },
];

// Dashboard (home.mjs) keys — parser-bound inside home.mjs itself. Short `label` for
// the Home footer; a one-line `desc` for the Alt+S overlay. Items flagged
// `overlayOnly` show in the Alt+S overlay but are kept OUT of the cramped Home footer
// (they already have prominent, live controls in the LAUNCH section).
export const DASHBOARD = [
  { row: 'MOVE', items: [
    { keys: 'Up/Dn', label: 'move bar',    desc: 'move the selection bar' },
    { keys: '->',    label: 'open folder', desc: 'open the highlighted folder' },
    { keys: '<-',    label: 'back',        desc: 'go up to the parent folder' },
    { keys: 'Tab',   label: 'switch list', desc: 'switch the active list' },
  ] },
  { row: 'DO', items: [
    { keys: '1-8',   label: '#agents',    desc: 'how many agents to launch' },
    { keys: 'Enter', label: 'launch',     desc: 'launch agents in the folder' },
    { keys: 'm',     label: 'model',      desc: 'cycle the launch model', overlayOnly: true },
    { keys: 'e',     label: 'effort',     desc: 'cycle the effort level', overlayOnly: true },
    { keys: 't',     label: 'theme',      desc: 'cycle the color theme (recolors the whole terminal)', overlayOnly: true },
    { keys: 'n',     label: 'new folder', desc: 'create a new sub-folder' },
    { keys: 'g',     label: 'push',       desc: 'push every repo to GitHub' },
    { keys: 'c',     label: 'pull',       desc: 'pull every repo from GitHub' },
    { keys: '?',     label: 'help',       desc: 'show the dashboard help' },
    { keys: 'q',     label: 'quit',       desc: 'quit the dashboard (agents keep running)' },
  ] },
];

// Pick the groups that fit in `width` columns. Always keep essential ones; drop
// non-essential from the END first (least important last). Each group is rendered
// by `textFn` (default `keys = label`) and joined by `sep`. Pure + deterministic
// (unit-testable).
export function fitGroups(items, width, sep = '   .   ', textFn = (g) => g.keys + ' = ' + g.label) {
  const widthOf = (gs) => gs.map(textFn).join(sep).length;
  let chosen = items.slice();
  while (widthOf(chosen) > width && chosen.some((g) => !g.essential)) {
    let idx = -1;
    for (let i = chosen.length - 1; i >= 0; i--) { if (!chosen[i].essential) { idx = i; break; } }
    if (idx === -1) break;
    chosen.splice(idx, 1);
  }
  return chosen;
}
