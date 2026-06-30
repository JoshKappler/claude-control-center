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
    desc: 'Move the focus between the Claude agents inside this window. The highlighted border shows which agent your typing goes to; focus never leaves the window.' },
  { keys: 'Alt+[ / Alt+]',    label: 'previous / next window',     section: 'MOVE & RESIZE',
    desc: 'Step to the previous or next agent window (a Zellij tab). Each window is a separate job, so this flips between them without disturbing the agents inside.' },
  { keys: 'Alt+H',            label: 'jump to the Home dashboard', section: 'MOVE & RESIZE',
    desc: 'Jump straight back to the Home dashboard — always the first window — where you browse folders, sync repos, and launch new agents.' },
  { keys: 'Alt+Shift+Arrows', label: 'resize the focused agent',  section: 'MOVE & RESIZE',
    desc: 'Resize the focused agent, growing it toward that edge. Same fingers as Alt+Arrows for moving focus — just add Shift to resize instead of move.' },
  { keys: 'Alt+A',            label: 'add another agent here',     section: 'AGENTS & WINDOWS',
    desc: 'Add another Claude agent in this window, splitting the space with the agents already here. Every agent in a window shares one working tree.' },
  { keys: 'Ctrl+Alt+W',       label: 'close this one agent',       section: 'AGENTS & WINDOWS',
    desc: 'Deliberately close just the focused agent. Closing is the ONLY way an agent dies — moving between agents or adding one can never kill it by accident.' },
  { keys: 'Ctrl+Alt+Q',       label: 'close this whole window',    section: 'AGENTS & WINDOWS',
    desc: 'Close this entire window and every agent in it at once. Use Ctrl+Alt+W instead when you only want to close the single focused agent.' },
  { keys: 'Alt+I',            label: 'subagent monitor',           section: 'DISCOVER & ESCAPE',
    desc: 'Open the subagent monitor for this window in a floating overlay, so you can see what each agent has spawned. Press a key to close it.' },
  { keys: 'Ctrl+G',           label: 'pass all keys to Claude',    section: 'DISCOVER & ESCAPE',
    desc: 'Lock the window so every keystroke passes straight to Claude and Zellij stops intercepting shortcuts. Press Ctrl+G again to unlock and get the shortcuts back.' },
  { keys: 'Alt+S',            label: 'show / hide this list',      section: 'DISCOVER & ESCAPE',
    desc: 'Show or hide this shortcut list from any window. Press Alt+S again — or any other key — to close it. It works on the Home dashboard too.' },
];

// Dashboard (home.mjs) keys — parser-bound inside home.mjs itself. Short `label` for
// the Home footer; fuller `desc` for the Alt+S overlay.
export const DASHBOARD = [
  { row: 'MOVE', items: [
    { keys: 'Up/Dn', label: 'move bar',    desc: 'Move the selection bar up and down the focused list.' },
    { keys: '->',    label: 'open folder', desc: 'Open the highlighted folder to browse the projects inside it.' },
    { keys: '<-',    label: 'back',        desc: 'Go back up to the parent folder.' },
    { keys: 'Tab',   label: 'switch list', desc: 'Switch focus between the folder list and the running-subagents list.' },
  ] },
  { row: 'DO', items: [
    { keys: '1-8',   label: '#agents',    desc: 'Pick how many Claude agents to launch into the selected folder — 1 through 8, all sharing one working tree.' },
    { keys: 'Enter', label: 'launch',     desc: 'Launch the chosen number of agents into the selected folder, opening them in a new window.' },
    { keys: 'n',     label: 'new folder', desc: 'Create a new sub-folder inside the current folder.' },
    { keys: 'g',     label: 'push',       desc: 'Push every repo under the projects root to GitHub, each on its own current branch.' },
    { keys: 'c',     label: 'pull',       desc: 'Pull every repo under the projects root — cloning what is missing, fast-forwarding the rest.' },
    { keys: '?',     label: 'help',       desc: 'Show the built-in help for the Home dashboard.' },
    { keys: 'q',     label: 'quit',       desc: 'Quit the control center, closing the whole session and every agent running in it.' },
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
