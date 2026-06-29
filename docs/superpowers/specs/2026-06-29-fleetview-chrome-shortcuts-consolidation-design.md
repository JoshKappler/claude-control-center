# FleetView chrome + shortcuts consolidation — design

Date: 2026-06-29
Status: approved-for-planning

## Problem

The Claude Control Center keybinding/chrome experience has degraded into "multiple
systems with band-aids on top." Concrete symptoms reported by the owner:

1. The top `SHORTCUTS` strip advertises `Alt+[ / Alt+]` etc. but they "do nothing"
   (stale running session predating the current config).
2. The most important shortcut — **close agent** (`Ctrl+Alt+w`) — never appears in
   that strip.
3. A bottom status bar shows inconsistent tips (`Ctrl + mouse scroll … resize`).
4. A `base` chevron and a `scroll: 0/1` indicator appear with no explanation.
5. No visual separator between the chevron tab bar and the strip beneath — one
   green blob.

## Root cause

**Keybindings are *defined* in exactly one place (the Zellij config in the chezmoi
dotfiles repo) but *advertised* in four places that cannot enforce them** —
`agentbar.mjs`, the `home.mjs` cheatsheet, the `home.mjs` help overlay, and
`README.md`. Those four drifted out of sync with each other, with the real
bindings, and with a stale running session. Compounding factors:

- The bottom status bar / `base` mode / resize tips come from Zellij's
  `zellij:status-bar` plugin, which the **current** deployed config already removed.
  The owner still sees them because the running session is stale.
- `agentbar.mjs` lists `Ctrl+Alt+w` last in an ordered list that is truncated on
  narrow panes (`agentbar.mjs:36-37`), so close-agent falls off the edge.
- Four stale duplicate copies of the layouts exist (this repo, two chezmoi
  locations, one legacy `~/.local/share/claude-cc`).

## Decisions (owner-confirmed)

- **Scope:** fix BOTH repos — this repo AND the chezmoi dotfiles repo.
- **Chrome target:** minimal — chevron tab bar (which window) + a black separator +
  ONE clean bottom hint line. No Zellij status bar, no `base` mode text, no resize
  tips. Lock mode (`Ctrl+g`) keeps working; only its on-screen indicator goes away.
- **Out of scope (explicitly deferred):** the "arrow keys misbehave on an empty
  chat/list" behavior and the bracketed-paste bug. The three empty-list focus
  band-aids and the inspector's separate parser are left as-is for now.
- **Single source of truth:** build a shared `shortcuts.mjs` data module.
- **Inspector:** keep it, reachable from BOTH the dashboard (Enter on a subagent
  group) and `Alt+i` in tabs. Advertise it lightly and label it accurately as a
  status monitor (it shows a metadata table, NOT subagent feeds/transcripts).

## The canonical keymap

In-tab (Zellij-bound, dotfiles `config.kdl`):

| Key | Action |
|---|---|
| `Alt+←→↑↓` | switch agent (move focus within tab) |
| `Alt+[` / `Alt+]` | switch window (prev/next tab) |
| `Alt+a` | add agent |
| `Ctrl+Alt+w` | **close agent** (essential — always shown) |
| `Ctrl+Alt+q` | close window |
| `Ctrl+g` | lock / unlock keys to Claude (essential — always shown) |
| `Alt+i` | open subagent monitor (low priority — droppable on narrow) |

Dashboard (`home.mjs`, parser-bound here):

`↑↓`/`kj` move · `→`/`l` enter · `←`/`h` back · `Tab` switch list · `1–8` count ·
`+`/`-` adjust count · `Enter` launch (or open monitor on a subagent) · `n` new
folder · `g` push · `c` pull · `?` help · `q` quit.

## Single source of truth: `shortcuts.mjs`

New module in this repo, zero deps, exporting the keymap as data. Shape:

```js
// shortcuts.mjs
export const IN_TAB = [
  { keys: 'Alt+Arrows',  label: 'switch agent',   essential: false },
  { keys: 'Alt+[ Alt+]', label: 'switch window',  essential: false },
  { keys: 'Alt+a',       label: 'add agent',      essential: false },
  { keys: 'Ctrl+Alt+w',  label: 'close agent',    essential: true  },
  { keys: 'Ctrl+Alt+q',  label: 'close window',   essential: true  },
  { keys: 'Ctrl+g',      label: 'lock to Claude', essential: true  },
  { keys: 'Alt+i',       label: 'subagent monitor', essential: false },
];
export const DASHBOARD = [ /* move / do / window groups for the cheatsheet */ ];
```

- `agentbar.mjs` imports `IN_TAB` and builds the bottom strip from it. On a narrow
  pane it drops NON-essential groups first; essential groups (`close agent`,
  `close window`, `lock`) are never dropped.
- `home.mjs` imports `DASHBOARD` (and `IN_TAB` for its "in a tab" hint rows) and
  builds the cheatsheet + help overlay from the same data. No hand-kept duplicate
  strings.
- `config.kdl` still hand-binds the keys (Zellij can't import JS) but carries a
  comment: "advertised text of record lives in shortcuts.mjs — keep in sync."
- `README.md` shortcuts section is reconciled to match (hand-maintained but now
  the single human-facing prose copy, pointing at `shortcuts.mjs`).

Net: bindings live in 1 place; advertised text derives from 1 module; prose doc is
1 place. Down from 5 drifting surfaces to "binding + 1 source + 1 prose."

## Track A — Zellij chrome (chezmoi dotfiles repo `~/.local/share/chezmoi`)

A1. Confirm NO `zellij:status-bar` in any active layout template
    (`config.kdl.tmpl`, `cc-default.kdl.tmpl`). It is already absent in the
    deployed copy; ensure the templates match so a fresh `chezmoi apply` can't
    reintroduce it.
A2. Add a **black separator row** between the tab bar and the content. A
    `size=1 borderless=true` pane with no command would spawn a shell, so use a
    tiny always-alive spacer script (same pattern as `agentbar.mjs`) that prints a
    single dim/blank line and stays running — e.g. a `separator.mjs` in this repo,
    referenced from the layout templates. `bg` is `#000000`, so the row reads as a
    clean black break between the green chevrons and the content below. Applies to
    BOTH `cc-default.kdl.tmpl` (dotfiles) and this repo's `layouts/claude-N.kdl`.
A3. Delete the dead duplicate tree
    `~/.local/share/chezmoi/home/dot_local/share/claude-cc/` (legacy `agentbar.mjs`
    + `claude-N` layouts nothing launches).
A4. Add the "text of record" comment in `config.kdl.tmpl` keybinds block pointing
    at this repo's `shortcuts.mjs`.
A5. `chezmoi apply`, then close & reopen the control center so the stale session is
    replaced (the AHK launcher kills the session on window close;
    `on_force_close "quit"` + `session_serialization false` guarantee a fresh
    start). This is what makes symptoms 1/3/4 disappear.

## Track B — App (this repo)

B1. New `shortcuts.mjs` (above).
B2. `layouts/claude-N.kdl` (N=1..8): restructure each tab to
    `tab-bar (top) → black separator → agents → bottom hint strip`. The shortcut
    strip moves OFF the top (decluttering directly above the input) to the bottom.
B3. `agentbar.mjs`: becomes the bottom strip; import `IN_TAB`; fix truncation so
    essential groups always survive (drop non-essential first; if still too narrow,
    keep essentials and elide with `…`). Re-title accurately.
B4. `home.mjs`: regenerate the cheatsheet + help overlay from `shortcuts.mjs`; fix
    the inconsistent `Tab` wording; fix the subagents header mislabel
    `(Tab to inspect)` → `(Enter to inspect)`; document `k/j/h/l` and `+/-` or drop
    them (decide in plan — leaning: document them in the help overlay only).
B5. `README.md`: reconcile the shortcuts section to the canonical keymap; note that
    `shortcuts.mjs` is the source of the advertised text and `config.kdl` (dotfiles)
    is the source of the bindings.
B6. Inspector labeling: in `home.mjs` and any advertised text, call it the
    "subagent monitor" and make clear it shows a status table, not feeds.

## Verification

- `node --test` (existing `input.test.mjs`, `render.test.mjs`, `launch-guard.test.mjs`)
  still pass; add a small test that `agentbar.mjs` keeps all `essential` groups at a
  narrow width (e.g. 40 cols).
- `home.mjs.__renderFrame(rows, cols)` snapshot still renders the cheatsheet built
  from `shortcuts.mjs` at 80x24 and a narrow width.
- Manual: `chezmoi apply`, reopen control center, confirm: (a) black separator under
  the chevrons, (b) no bottom status bar / no `base` / no resize tips, (c) bottom
  hint strip shows `close agent` + `lock` even with 8 agents in narrow columns,
  (d) `Alt+[`/`Alt+]`/`Alt+a`/`Ctrl+Alt+w` actually work in the fresh session.

## Non-goals

- No change to the launch fork-bomb guard, git sync scripts, or system gauges.
- No fix to the arrow-key-on-empty or bracketed-paste behavior (deferred).
- No new inspector capability (no feed/transcript viewing).
