# workspace/ — all your machine config, in one place

This folder holds **every config file** for the FleetView setup. It used to live in a
separate `dotfiles` repo managed by a tool called **chezmoi**. Now it's just part of
this repo, and a small script (`../install.mjs`) copies each file to where the
operating system expects it. One repo, one command — no second repo, no chezmoi.

## Why config can't *only* live here

Each program reads its settings from a fixed location the OS dictates — zellij wants
`~/.config/zellij/`, Claude wants `~/.claude/`, and so on. So the **source of truth**
lives here (and syncs with the repo), and `install.mjs` **deploys copies** out to
those locations. Editing config = edit the file here, then run `node install.mjs`.

## Syncing a machine (the whole point)

```sh
git pull                # get the latest (this repo)
node install.mjs        # copy config into place for THIS machine (Windows or macOS)
```

That's it. `install.mjs` auto-detects Windows vs macOS and writes each file to the
right per-OS path. It never deletes anything: the first time it overwrites a file it
saves the old one next to it as `<file>.pre-install.bak`, so you can always go back.

## What's in here

| Folder | What it configures | Plain English |
|---|---|---|
| `zellij/` | `~/.config/zellij/` | Splits the terminal into the grid of Claude panes. `config.kdl` = keybinds + theme; `layouts/cc-default.kdl` = the Home tab. |
| `wezterm/` | `~/.config/wezterm/` | The terminal **window** the control center runs in (green-on-black, fonts, Ctrl+V paste). |
| `claude/` | `~/.claude/` | Your **global** Claude Code config: `settings.json`, your `CLAUDE.md` instructions, and `/commands` slash commands. |
| `helix/` | `~/.config/helix` (mac) or `%APPDATA%\helix` (win) | A code editor for reading/spot-editing the code agents write. |
| `espanso/` | espanso's per-OS config dir | A text-expander: type a short trigger, it pastes one of your saved prompts. |
| `hammerspoon/` | `~/.hammerspoon/` (macOS only) | The macOS twin of the Windows AHK launcher — gives you the Ctrl+Alt+C hotkey. |
| `windows/` | (run in place from the repo) | The Windows launcher: `claude-cc.ahk` (the Ctrl+Alt+C hotkey) + `launch.cmd`. `install.mjs` points your Startup shortcut at it. |

The always-on **hooks** and **status line** (`../hooks/`, `../statusline.mjs`) are
deployed to `~/.local/share/claude-cc/` because `claude/settings.json` points there.

## Tokens

A couple of files contain placeholders that `install.mjs` fills in:
- `{{APP}}` → this repo's absolute path (so zellij can find `home.mjs` etc.).
- `{{FONT_SIZE}}`, `{{WIN_DEFAULT_PROG}}` → per-OS WezTerm bits.
