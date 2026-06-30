# FleetView — expandable, universal keyboard-shortcut hints

**Date:** 2026-06-29
**Status:** approved, implementing

## Problem

In agent tabs the only shortcut hint is a one-row bottom strip (`agentbar.mjs`) that
truncates to the three "essential" keys on a portrait-width window, leaving cryptic,
unexplained labels ("close agent", "close window", "lock to Claude") and hiding
everything else. Worse, useful actions don't exist at all: no **go to Home**, no
**resize**. The wasted OS title bar shows "Zellij (claude-cc)" branding nobody needs.

## Design

One universal, collapsible mechanism, identical on every tab (Home and agent windows):

1. **Drop the zellij branding.** Set the WezTerm window title to `Claude Control
   Center` (replaces zellij's "Zellij (claude-cc)" in the OS title bar).

2. **Collapsed hint at the top.** Repurpose the wasted black separator row (row 2,
   directly under the tab strip) into a thin hint line rendered by a new `hintbar.mjs`:
   `Alt+S — keyboard shortcuts (Esc to close)`. Used by both the generated agent
   layouts and the Home layout (`cc-default.kdl`).

3. **`Alt+S` expands the full list.** A zellij keybind (global, every mode except
   locked) opens a floating overlay pane running a new `cheatsheet.mjs`, which renders
   the COMPLETE shortcut list from `shortcuts.mjs` in plain English, grouped into
   "In an agent window" and "On the Home dashboard". Pressing any key (Esc/Enter/etc.)
   makes `cheatsheet.mjs` run `zellij action close-pane` on itself and exit, so the
   overlay collapses. No truncation, no choosing what to show.

4. **Remove the bottom strip.** `agentbar.mjs` (and its truncation logic) is deleted;
   its job is now the `Alt+S` overlay. Agent tabs get that bottom row back. The unused
   `separator.mjs` is also removed (the hint row replaces it).

5. **Add the missing bindings** (so they work AND appear in the sheet):
   - `Alt+H` → `GoToTab 1` (the Home dashboard is always tab 1).
   - `Alt+Shift+Arrows` → `Resize "Increase <dir>"` (resize the focused agent).

## Components & boundaries

| Unit | Purpose | Depends on |
|---|---|---|
| `shortcuts.mjs` | Single source of truth: `IN_TAB` (agent-window keys, now incl. resize/home) + `DASHBOARD` (home keys), plain-English labels. | — |
| `hintbar.mjs` | Renders the one-row collapsed hint at the top of every tab. Stays alive, redraws on resize. | — |
| `cheatsheet.mjs` | Floating overlay: prints both shortcut sections from `shortcuts.mjs`; any key → `zellij action close-pane` + exit. | `shortcuts.mjs`, zellij |
| `home.mjs` `genLayout()` | Agent-tab layout: row2 = `hintbar.mjs`; no bottom strip. | `hintbar.mjs` |
| `workspace/zellij/config.kdl` | Binds `Alt+S` (Run cheatsheet floating), `Alt+H` (GoToTab 1), `Alt+Shift+Arrows` (Resize). | `cheatsheet.mjs` |
| `workspace/zellij/layouts/cc-default.kdl` | Home layout: row2 = `hintbar.mjs`. | `hintbar.mjs` |
| `workspace/wezterm/wezterm.lua` | Sets window title to `Claude Control Center`. | — |

## Key-handling note (why `Alt+S` and not a pass-through key)

Home keys (arrows, `g`, `c`, `n`, `q`, `?`) are pass-through keys read by `home.mjs`
directly — zellij doesn't bind them. Agent-window keys are zellij bindings (zellij
intercepts them before Claude). `Alt+S` is a zellij binding so it works uniformly over
any focused pane, including the floating overlay over Home. Home's existing `?` overlay
is left intact as a bonus; the hint advertises `Alt+S` for consistency.

## Deployment

`config.kdl`, `cc-default.kdl`, and `wezterm.lua` changes require `node install.mjs`
**and a full restart** of the control center to take effect (zellij/wezterm read config
at startup). `home.mjs`/`hintbar.mjs`/`cheatsheet.mjs` are read live from the repo via
rendered `{{APP}}` paths. See memory `restart-after-config-changes`.

## Tests

- `shortcuts.mjs`: `IN_TAB` includes the new resize/home entries; every entry has keys+label.
- `cheatsheet.mjs`: rendered output contains both section headers and one line per shortcut.
- `home.mjs` `genLayout()`: emits `hintbar.mjs` at row 2 and no `agentbar.mjs`/`separator.mjs`.
- Existing suites (`render`, `input`, `launch-guard`, `layout-grid`) still pass.
- zellij parse-test the generated agent layout and `cc-default.kdl`; verify `Alt+S`
  opens/closes the overlay and `Alt+H`/resize binds load.
