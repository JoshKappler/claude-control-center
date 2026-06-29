# FleetView chrome + shortcuts consolidation — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate FleetView's keyboard-shortcut surfaces into one source of
truth, clean up the Zellij chrome (separator, no status bar, no accidental mode
overlays, Ctrl+Backspace works), and make close-agent always visible.

**Architecture:** A new `shortcuts.mjs` data module is the single source for all
advertised shortcut text; `agentbar.mjs` (now the bottom strip) and `home.mjs`
both render from it. Zellij chrome fixes live in the chezmoi dotfiles repo
(`JoshKappler/dotfiles`, branch `main`): unbind default mode keys, add a black
separator pane. Agent-tab layouts in THIS repo move the shortcut strip to the
bottom and add the separator.

**Tech Stack:** Node ESM `.mjs` (zero npm deps, Node built-ins only), raw ANSI,
Zellij 0.44.3 KDL layouts/config, chezmoi templates.

## Global Constraints

- Zero npm dependencies; Node built-ins only. Every script self-locating.
- One git branch only per repo: `master` (this repo), `main` (dotfiles). Commit +
  push there; never branch/worktree/reset/force-push.
- Match surrounding code conventions, naming, comment density. Terse comments.
- ASCII-safe terminal output (the existing `asciiSafe`/plain-text patterns).
- Re-fetch + `git pull --ff-only` before each push (MacBook commits may land).

---

### Task 1: `shortcuts.mjs` — single source of truth

**Files:**
- Create: `shortcuts.mjs`

**Interfaces:**
- Produces: `export const IN_TAB` — array of `{ keys, label, essential }`.
  `export const DASHBOARD` — array of `{ row, items: [{keys, label}] }` for the
  cheatsheet. `export function fitGroups(items, width, sep)` — returns the subset
  of `items` (objects with `.essential`) that fits in `width`, always keeping
  `essential:true` ones, dropping non-essential from the end first.

- [ ] **Step 1:** Create `shortcuts.mjs`:

```js
#!/usr/bin/env node
// shortcuts.mjs — the ONE source of truth for every advertised keyboard shortcut.
// agentbar.mjs (the bottom in-tab strip) and home.mjs (cheatsheet + help overlay)
// both render from this data, so the hints can never drift apart again. The actual
// in-tab key BINDINGS live in the chezmoi zellij config.kdl (Zellij can't import
// JS); keep that file's keybinds in sync with IN_TAB below. Zero deps.

// In-tab shortcuts (bound by zellij in the dotfiles repo's config.kdl).
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
// non-essential from the END first (least important last). Each rendered group is
// `keys + ' ' + label`, joined by `sep`. Pure + deterministic (unit-testable).
export function fitGroups(items, width, sep = '   .   ') {
  const text = (g) => g.keys + ' = ' + g.label;
  // Start with everything, drop trailing non-essential groups until it fits.
  let chosen = items.slice();
  const widthOf = (gs) => gs.map(text).join(sep).length;
  while (widthOf(chosen) > width && chosen.some((g) => !g.essential)) {
    // remove the LAST non-essential group
    let idx = -1;
    for (let i = chosen.length - 1; i >= 0; i--) { if (!chosen[i].essential) { idx = i; break; } }
    if (idx === -1) break;
    chosen.splice(idx, 1);
  }
  return chosen;
}
```

- [ ] **Step 2:** Sanity-run: `node -e "import('./shortcuts.mjs').then(m=>console.log(m.fitGroups(m.IN_TAB, 40).map(g=>g.keys)))"`
  Expected: a short list that still includes `Ctrl+Alt+w`, `Ctrl+Alt+q`, `Ctrl+g`.

- [ ] **Step 3:** Commit `git add shortcuts.mjs && git commit -m "feat: shortcuts.mjs single source of truth for shortcut hints"`

---

### Task 2: `agentbar.test.mjs` + refactor `agentbar.mjs` to use `shortcuts.mjs`

**Files:**
- Create: `agentbar.test.mjs`
- Modify: `agentbar.mjs`

**Interfaces:**
- Consumes: `IN_TAB`, `fitGroups` from `shortcuts.mjs`.
- Produces: `export function buildBar(width)` returning the padded bar string
  (for testing); `draw()` uses it.

- [ ] **Step 1: Write failing test** `agentbar.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBar } from './agentbar.mjs';

test('close-agent + lock survive a narrow bar', () => {
  const bar = buildBar(40);
  assert.match(bar, /Ctrl\+Alt\+w/, 'close agent must always show');
  assert.match(bar, /Ctrl\+g/, 'lock must always show');
});

test('wide bar shows everything', () => {
  const bar = buildBar(200);
  assert.match(bar, /Alt\+Arrows/);
  assert.match(bar, /Alt\+i/);
});

test('bar is padded to the width', () => {
  assert.equal(buildBar(80).length, 80);
});
```

- [ ] **Step 2:** Run `node --test agentbar.test.mjs` → FAIL (`buildBar` not exported).

- [ ] **Step 3:** Rewrite `agentbar.mjs` to:

```js
#!/usr/bin/env node
// agentbar.mjs — the one-line shortcut strip pinned at the BOTTOM of every agent
// tab. Rendered as a solid reversed strip (green bar, dark text) so it is obvious
// among the agents' own green UIs. Text comes from shortcuts.mjs (the single
// source of truth); essential groups (close agent, close window, lock) never drop
// even on a narrow window. Stays alive (the pane would close if it exited) and
// re-renders on resize. Zero deps.

import { IN_TAB, fitGroups } from './shortcuts.mjs';

const ESC = '\x1b';
const RESET = ESC + '[0m';
const BOLD = ESC + '[1m';
const REV = ESC + '[7m';

function cols() { return (process.stdout.columns && process.stdout.columns > 0) ? process.stdout.columns : 80; }

const SEP = '   .   ';
export function buildBar(width) {
  const W = width;
  const groups = fitGroups(IN_TAB, W - 2, SEP);   // -2 for the leading space + margin
  let line = ' ' + groups.map((g) => g.keys + ' = ' + g.label).join(SEP);
  if (line.length > W) line = line.slice(0, W);
  if (line.length < W) line += ' '.repeat(W - line.length);
  return line;
}

function draw() {
  try { process.stdout.write(ESC + '[2K\r' + REV + BOLD + buildBar(cols()) + RESET); } catch { /* */ }
}

// Only run the live loop when executed directly (stay importable for tests).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
function isDirectRun() {
  try { return !!process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); }
  catch { return true; }
}
if (isDirectRun()) {
  draw();
  process.stdout.on('resize', draw);
  setInterval(draw, 5000);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}
```

- [ ] **Step 4:** Run `node --test agentbar.test.mjs` → PASS.

- [ ] **Step 5:** Commit `git add agentbar.mjs agentbar.test.mjs && git commit -m "feat: agentbar renders from shortcuts.mjs; close-agent never truncated"`

---

### Task 3: `separator.mjs` — black separator row

**Files:**
- Create: `separator.mjs`

- [ ] **Step 1:** Create `separator.mjs`:

```js
#!/usr/bin/env node
// separator.mjs — a one-row, borderless pane that renders as a black gap, used to
// break the green chevron tab-bar away from the content beneath it (so the top of
// the window is not one solid blob of green). It just clears its single row and
// stays alive (the pane would close if the process exited). Zero deps.

const ESC = '\x1b';
function draw() { try { process.stdout.write(ESC + '[2K\r'); } catch { /* */ } }
draw();
process.stdout.on('resize', draw);
setInterval(draw, 5000);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
```

- [ ] **Step 2:** Commit `git add separator.mjs && git commit -m "feat: separator.mjs black gap pane under the tab bar"`

---

### Task 4: Restructure `layouts/claude-1..8.kdl`

**Files:**
- Modify: `layouts/claude-1.kdl` … `layouts/claude-8.kdl`

Each layout becomes: `tab-bar (top) → separator → agents → agentbar (bottom)`.
The `{{APP}}` token is rendered to the live app dir by `home.mjs`.

- [ ] **Step 1:** For `claude-1.kdl` write:

```kdl
// 1 Claude agent (full window).
layout {
    default_tab_template {
        pane size=1 borderless=true { plugin location="zellij:tab-bar"; }
        pane size=1 borderless=true command="node" { args "{{APP}}/separator.mjs" }
        children
    }
    tab {
        // Agent fills the tab; the shortcut strip sits at the BOTTOM.
        pane split_direction="horizontal" {
            pane command="claude" name="Claude 1"
            pane size=1 borderless=true command="node" { args "{{APP}}/agentbar.mjs" }
        }
    }
}
```

- [ ] **Step 2:** For `claude-2.kdl` … `claude-8.kdl`, keep each file's existing
  agent split (vertical columns / the 2-row column-heavy splits) but: (a) add the
  separator pane line to `default_tab_template` right after the tab-bar line, and
  (b) move the `agentbar.mjs` pane from the TOP of the tab to the BOTTOM, i.e. make
  it the LAST pane of the outer `split_direction="horizontal"` block, after the
  agents block. Example `claude-2.kdl`:

```kdl
// 2 Claude agents - 2 narrow vertical columns.
layout {
    default_tab_template {
        pane size=1 borderless=true { plugin location="zellij:tab-bar"; }
        pane size=1 borderless=true command="node" { args "{{APP}}/separator.mjs" }
        children
    }
    tab {
        pane split_direction="horizontal" {
            pane split_direction="vertical" {
                pane command="claude" name="Claude 1"
                pane command="claude" name="Claude 2"
            }
            pane size=1 borderless=true command="node" { args "{{APP}}/agentbar.mjs" }
        }
    }
}
```

  For `claude-5..8` the agents live in a nested `split_direction="horizontal"`
  (top/bottom rows of columns); wrap that existing nested block as the first child
  of the outer horizontal split and append the agentbar pane as the last child,
  exactly as above.

- [ ] **Step 3:** Verify each renders via the app's generator:
  `node -e "import('./home.mjs')"` is heavy; instead sanity-check the token render:
  `node -e "const f=require('fs');for(const n of [1,2,5,8]){let s=f.readFileSync('layouts/claude-'+n+'.kdl','utf8');console.log(n, s.includes('separator.mjs'), s.lastIndexOf('agentbar.mjs')>s.indexOf('claude'))}"`
  Expected: each line `true true` (separator present; agentbar after the agents).

- [ ] **Step 4:** Commit `git add layouts && git commit -m "feat: agent layouts — separator under tab bar, shortcut strip moved to bottom"`

---

### Task 5: `home.mjs` — render cheatsheet/help from `shortcuts.mjs`, fix wording

**Files:**
- Modify: `home.mjs` (imports near top; cheatsheet block `:613-618`; help overlay
  `:677-684`; subagents header `:573`; help inspector wording).

- [ ] **Step 1:** Add import after the existing imports (around `home.mjs:27`):

```js
import { DASHBOARD, IN_TAB } from './shortcuts.mjs';
```

- [ ] **Step 2:** Replace the three hand-built cheatsheet lines (`home.mjs:616-618`)
  with a generated MOVE/DO row pair from `DASHBOARD` plus one WINDOW row from
  `IN_TAB` (essential-aware via the same `fitGroups`-style fit, but the cheatsheet
  has room — render all). Keep the existing `keyc()`/color helpers and the `C`
  separator. Concretely, build:

```js
  // Cheatsheet — generated from shortcuts.mjs so it can never drift from the strip.
  const C = BBLUE + ' | ' + RESET;
  const renderItems = (items) => items.map((it) => keyc(it.keys) + GREEN + ' ' + it.label + RESET).join(C);
  lines.push(sep);
  for (const grp of DASHBOARD) {
    lines.push(BOLD + BGREEN + pad(grp.row, 7) + RESET + renderItems(grp.items));
  }
  lines.push(BOLD + BGREEN + pad('WINDOW', 7) + RESET +
    IN_TAB.map((g) => keyc(g.keys) + GREEN + ' ' + g.label + RESET).join(C));
```

- [ ] **Step 3:** Fix the subagents header mislabel (`home.mjs:573`): change
  `'   (Tab to inspect)'` to `'   (Enter to inspect)'` (Tab only focuses the list;
  Enter opens the monitor).

- [ ] **Step 4:** In the help overlay (`renderHelp`, the SUBAGENTS / inspector
  wording and section 3), replace any "inspector" phrasing that implies reading
  feeds with the accurate "subagent monitor — a live status table (what each
  subagent is doing); it does not show their transcripts." Keep the `Alt+i` mention
  consistent with `IN_TAB`. Leave the rest of the help text intact.

- [ ] **Step 5:** Run the existing render test: `node --test render.test.mjs` →
  PASS (adjust the test's expected strings if it asserted the old literal cheatsheet
  text; update those assertions to match the generated output).

- [ ] **Step 6:** Commit `git add home.mjs render.test.mjs && git commit -m "feat: dashboard cheatsheet/help generated from shortcuts.mjs; fix Tab/inspect wording"`

---

### Task 6: Reconcile `README.md` shortcuts

**Files:**
- Modify: `README.md` (the shortcut/keybinding sections the archaeology flagged:
  `~:33-41`, `:50-57`, `:130`).

- [ ] **Step 1:** Update the in-tab shortcut list to match `IN_TAB` exactly (keys +
  labels), and the dashboard list to match `DASHBOARD`. Add one line noting:
  "Advertised shortcut text is generated from `shortcuts.mjs`; the in-tab key
  bindings live in the dotfiles repo's `~/.config/zellij/config.kdl`." Correct the
  `Alt+i` description to "subagent monitor (live status table, not feeds)".

- [ ] **Step 2:** Commit `git add README.md && git commit -m "docs: reconcile README shortcuts with shortcuts.mjs"`

---

### Task 7: Dotfiles — unbind Zellij default mode keys (fixes Ctrl+Backspace)

**Files:**
- Modify: `~/.local/share/chezmoi/home/dot_config/zellij/config.kdl.tmpl`

- [ ] **Step 1:** In the `shared_except "locked"` block, after the existing
  `unbind "Ctrl q"` line, add:

```kdl
        // Stop Zellij from eating terminal/Claude keys and popping up mode overlays.
        // Ctrl+Backspace emits Ctrl+H, which by default opens Move mode — unbind it
        // (and the other default mode-entry keys we don't use) so those keys pass
        // straight through to Claude. Only `normal` and `locked` modes remain.
        unbind "Ctrl h"
        unbind "Ctrl p"
        unbind "Ctrl n"
        unbind "Ctrl t"
        unbind "Ctrl s"
        unbind "Ctrl o"
        unbind "Ctrl b"
```

- [ ] **Step 2:** Commit in the dotfiles repo:
  `git -C ~/.local/share/chezmoi add home/dot_config/zellij/config.kdl.tmpl && git -C ~/.local/share/chezmoi commit -m "fix(zellij): unbind default mode keys so Ctrl+Backspace and Ctrl+p/n/t/s reach the terminal"`

---

### Task 8: Dotfiles — separator pane on the Home tab + apply

**Files:**
- Modify: `~/.local/share/chezmoi/home/dot_config/zellij/layouts/cc-default.kdl.tmpl`

- [ ] **Step 1:** In `default_tab_template`, after the tab-bar pane line, add:

```kdl
        pane size=1 borderless=true command="node" {
            args "{{ .chezmoi.homeDir | replace "\\" "/" }}/OneDrive/desktop/projects/claude-control-center/separator.mjs"
        }
```

- [ ] **Step 2:** Commit:
  `git -C ~/.local/share/chezmoi add home/dot_config/zellij/layouts/cc-default.kdl.tmpl && git -C ~/.local/share/chezmoi commit -m "feat(zellij): black separator pane under the Home tab bar"`

- [ ] **Step 3:** Apply so the deployed config updates:
  `chezmoi apply` (or `chezmoi apply --dry-run` first). Confirm
  `~/.config/zellij/config.kdl` now has the `unbind "Ctrl h"` lines and
  `~/.config/zellij/layouts/cc-default.kdl` has the separator pane.

---

### Task 9: Full verification + push both repos

- [ ] **Step 1:** Run the whole test suite: `node --test` (this repo). Expected: all
  pass (`input.test.mjs`, `render.test.mjs`, `launch-guard.test.mjs`,
  `agentbar.test.mjs`).

- [ ] **Step 2:** Render a frame to eyeball the cheatsheet:
  `node -e "import('./home.mjs').then(m=>process.stdout.write(m.__renderFrame(40,90)))"`
  Confirm the MOVE/DO/WINDOW rows render and WINDOW shows close-agent + lock.

- [ ] **Step 3:** This repo: `git fetch origin && git pull --ff-only origin master`
  (integrate any MacBook commits), then `git push origin master`.

- [ ] **Step 4:** Dotfiles repo:
  `git -C ~/.local/share/chezmoi fetch origin && git -C ~/.local/share/chezmoi pull --ff-only origin main && git -C ~/.local/share/chezmoi push origin main`.

- [ ] **Step 5:** Note for the owner: close & reopen the Control Center
  (Ctrl+Alt+C) so the stale Zellij session is replaced and all chrome/keybind
  changes take effect.

## Notes / deferred

- The `~/.local/share/claude-cc/` (and chezmoi `dot_local/share/claude-cc/`) tree is
  NOT deleted: its `launch.cmd` is the live AHK entry point. A separate, supervised
  cleanup can later remove the duplicate app code there.
- Deferred (owner's call): the empty-list arrow behavior, the bracketed-paste bug,
  unifying `inspector.mjs`'s parser with `decodeInput`.
