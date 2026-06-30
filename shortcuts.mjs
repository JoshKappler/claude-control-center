#!/usr/bin/env node
// shortcuts.mjs — the ONE source of truth for every advertised keyboard shortcut.
// cheatsheet.mjs (the Alt+S overlay) and home.mjs (footer + help overlay) both render
// from this data, so the hints can never drift apart again. The actual
// in-tab key BINDINGS live in workspace/zellij/config.kdl (Zellij can't import JS),
// which install.mjs deploys to ~/.config/zellij/config.kdl; keep that file's
// keybinds in sync with IN_TAB below. Zero deps.

// In-tab shortcuts (bound by zellij in workspace/zellij/config.kdl), in priority
// order — the Home footer's WINDOW row keeps as many as fit from the FRONT. The full
// list always shows, untruncated, in the Alt+S overlay (cheatsheet.mjs).
export const IN_TAB = [
  { keys: 'Alt+Arrows',       label: 'move between agents' },
  { keys: 'Alt+[ / Alt+]',    label: 'previous / next window' },
  { keys: 'Alt+H',            label: 'jump to the Home dashboard' },
  { keys: 'Alt+A',            label: 'add another agent here' },
  { keys: 'Alt+Shift+Arrows', label: 'resize the focused agent' },
  { keys: 'Ctrl+Alt+W',       label: 'close this one agent' },
  { keys: 'Ctrl+Alt+Q',       label: 'close this whole window' },
  { keys: 'Alt+I',            label: 'subagent monitor' },
  { keys: 'Ctrl+G',           label: 'pass all keys to Claude (Esc frees)' },
];

// Dashboard (home.mjs) keys — parser-bound inside home.mjs itself.
export const DASHBOARD = [
  { row: 'MOVE', items: [
    { keys: 'Up/Dn', label: 'move bar' },
    { keys: '->',    label: 'open folder' },
    { keys: '<-',    label: 'back' },
    { keys: 'Tab',   label: 'switch list' },
  ] },
  { row: 'DO', items: [
    { keys: '1-8',   label: '#agents' },
    { keys: 'Enter', label: 'launch' },
    { keys: 'n',     label: 'new folder' },
    { keys: 'g',     label: 'push' },
    { keys: 'c',     label: 'pull' },
    { keys: '?',     label: 'help' },
    { keys: 'q',     label: 'quit' },
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
