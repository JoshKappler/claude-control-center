#!/usr/bin/env node
// shortcuts.mjs — the ONE source of truth for every advertised keyboard shortcut.
// cheatsheet.mjs (the Alt+S overlay) and home.mjs (footer + help overlay) both render
// from this data, so the hints can never drift apart again. The actual
// in-tab key BINDINGS live in workspace/zellij/config.kdl (Zellij can't import JS),
// which install.mjs deploys to ~/.config/zellij/config.kdl; keep that file's
// keybinds in sync with IN_TAB below. Zero deps.

// In-tab shortcuts (bound by zellij in workspace/zellij/config.kdl), in priority
// order — the Home footer's WINDOW row keeps as many as fit from the FRONT (using the
// short `label`). The Alt+S overlay (cheatsheet.mjs) shows the full list, untruncated,
// grouped by `section`, with the fuller `desc` spelled out in plain English. Keep
// `label` short (it shares the cramped footer); put the detail in `desc`.
export const IN_TAB = [
  { keys: 'Alt+Arrows',       label: 'move between agents',        section: 'MOVE & RESIZE',
    desc: 'move focus between agents' },
  { keys: 'Alt+[ / Alt+]',    label: 'previous / next window',     section: 'MOVE & RESIZE',
    desc: 'previous / next agent window' },
  { keys: 'Alt+H',            label: 'jump to the Home dashboard', section: 'MOVE & RESIZE',
    desc: 'jump to the Home dashboard' },
  { keys: 'Alt+Shift+Arrows', label: 'resize the focused agent',  section: 'MOVE & RESIZE',
    desc: 'resize the focused agent' },
  { keys: 'Alt+A',            label: 'add another agent here',     section: 'AGENTS & WINDOWS',
    desc: 'add another agent here' },
  { keys: 'Ctrl+Alt+W',       label: 'close this one agent',       section: 'AGENTS & WINDOWS',
    desc: 'close the focused agent' },
  { keys: 'Ctrl+Alt+Q',       label: 'close this whole window',    section: 'AGENTS & WINDOWS',
    desc: 'close this whole window' },
  { keys: 'Alt+I',            label: 'subagent monitor',           section: 'DISCOVER & ESCAPE',
    desc: 'open the subagent monitor' },
  { keys: 'Ctrl+G',           label: 'pass all keys to Claude',    section: 'DISCOVER & ESCAPE',
    desc: 'pass all keys to Claude' },
  { keys: 'Alt+S',            label: 'show / hide this list',      section: 'DISCOVER & ESCAPE',
    desc: 'show / hide this list (Alt+S again closes)' },
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
