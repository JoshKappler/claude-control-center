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
    desc: 'move focus between the Claude agents in this window' },
  { keys: 'Alt+[ / Alt+]',    label: 'previous / next window',     section: 'MOVE & RESIZE',
    desc: 'jump to the previous / next agent window (a whole job)' },
  { keys: 'Alt+H',            label: 'jump to the Home dashboard', section: 'MOVE & RESIZE',
    desc: 'go back to the Home dashboard (always the first window)' },
  { keys: 'Alt+Shift+Arrows', label: 'resize the focused agent',  section: 'MOVE & RESIZE',
    desc: 'resize the focused agent, growing it toward that edge' },
  { keys: 'Alt+A',            label: 'add another agent here',     section: 'AGENTS & WINDOWS',
    desc: 'add another Claude agent alongside the ones already here' },
  { keys: 'Ctrl+Alt+W',       label: 'close this one agent',       section: 'AGENTS & WINDOWS',
    desc: 'close just the focused agent (the deliberate way)' },
  { keys: 'Ctrl+Alt+Q',       label: 'close this whole window',    section: 'AGENTS & WINDOWS',
    desc: 'close this whole window and every agent inside it at once' },
  { keys: 'Alt+I',            label: 'subagent monitor',           section: 'DISCOVER & ESCAPE',
    desc: 'open the subagent monitor for this window' },
  { keys: 'Ctrl+G',           label: 'pass all keys to Claude',    section: 'DISCOVER & ESCAPE',
    desc: 'send keys straight to Claude; Ctrl+G again to unlock' },
  { keys: 'Alt+S',            label: 'show / hide this list',      section: 'DISCOVER & ESCAPE',
    desc: 'show or hide this list — press Alt+S again to close it' },
];

// Dashboard (home.mjs) keys — parser-bound inside home.mjs itself. Short `label` for
// the Home footer; a one-line `desc` for the Alt+S overlay.
export const DASHBOARD = [
  { row: 'MOVE', items: [
    { keys: 'Up/Dn', label: 'move bar',    desc: 'move the selection bar up and down the list' },
    { keys: '->',    label: 'open folder', desc: 'open the highlighted folder to see what is inside' },
    { keys: '<-',    label: 'back',        desc: 'go back up to the parent folder' },
    { keys: 'Tab',   label: 'switch list', desc: 'switch between the folder list and the subagents list' },
  ] },
  { row: 'DO', items: [
    { keys: '1-8',   label: '#agents',    desc: 'choose how many agents to launch (1 to 8, one working tree)' },
    { keys: 'Enter', label: 'launch',     desc: 'launch that many agents into the selected folder' },
    { keys: 'n',     label: 'new folder', desc: 'create a new sub-folder inside the current one' },
    { keys: 'g',     label: 'push',       desc: 'push every repo to GitHub, each on its current branch' },
    { keys: 'c',     label: 'pull',       desc: 'pull every repo — clone what is missing, fast-forward the rest' },
    { keys: '?',     label: 'help',       desc: 'show the built-in Home dashboard help' },
    { keys: 'q',     label: 'quit',       desc: 'quit — closes the session and every agent in it' },
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
