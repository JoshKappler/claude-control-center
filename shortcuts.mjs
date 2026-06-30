#!/usr/bin/env node
// shortcuts.mjs — the ONE source of truth for every advertised keyboard shortcut.
// agentbar.mjs (the bottom in-tab strip) and home.mjs (cheatsheet + help overlay)
// both render from this data, so the hints can never drift apart again. The actual
// in-tab key BINDINGS live in workspace/zellij/config.kdl (Zellij can't import JS),
// which install.mjs deploys to ~/.config/zellij/config.kdl; keep that file's
// keybinds in sync with IN_TAB below. Zero deps.

// In-tab shortcuts (bound by zellij in workspace/zellij/config.kdl).
// essential:true groups survive even on a narrow pane — close-agent and lock are
// the keys you must never lose.
export const IN_TAB = [
  { keys: 'Alt+Arrows',  label: 'switch agent',     essential: false },
  { keys: 'Alt+[ Alt+]', label: 'switch window',    essential: false },
  { keys: 'Alt+a',       label: 'add agent',        essential: false },
  { keys: 'Ctrl+Alt+w',  label: 'close agent',      essential: true  },
  { keys: 'Ctrl+Alt+q',  label: 'close window',     essential: true  },
  { keys: 'Ctrl+g',      label: 'lock to Claude',   essential: true  },
  { keys: 'Alt+i',       label: 'subagent monitor', essential: false },
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
