#!/usr/bin/env node
// themes.mjs — the ONE source of truth for the control center's color themes.
//
// A theme is a classic macOS-Terminal-style aesthetic (Homebrew, Pro, Ocean, …)
// applied EVERYWHERE at once:
//   - WezTerm       : `wezterm.lua` reads ~/.config/wezterm/cc-theme.lua (written
//                     here) and picks the matching built-in color scheme. WezTerm
//                     watches that file, so every open window recolors instantly.
//   - Zellij chrome : install.mjs renders the {{ZELLIJ_THEMES}} token in
//                     workspace/zellij/config.kdl from zellijThemeKdl(). Zellij
//                     live-reloads its config, so tab bar + pane frames follow.
//   - Our TUIs      : home.mjs / cheatsheet.mjs / hintbar.mjs / inspector.mjs /
//                     statusline.mjs color themselves from tuiSgr().
//
// The chosen theme id persists in ~/.claude/state/cc/theme.json (per machine).
// Cycle it from Home with [t]. Zero npm deps; Node built-ins only.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP = path.dirname(fileURLToPath(import.meta.url));

// Each theme:
//   wezterm : a scheme name that ships INSIDE WezTerm (guarded at load — an
//             unknown name falls back to Homebrew rather than erroring).
//   tui     : SGR params for the five roles every FleetView TUI uses.
//             text/bright/dim carry the body; key marks shortcut keys; alert(+B)
//             is for errors. Light themes use dark inks — the terminal scheme
//             supplies the light background.
//   zellij  : RGB triples for the component theme. `strong` is the solid
//             selection/active block; `accent` the highlight ink.
export const THEMES = [
  { id: 'homebrew', label: 'Homebrew', wezterm: 'Homebrew',
    tui: { text: '32', bright: '92', dim: '2;32', key: '94', alert: '31', alertBright: '91' },
    zellij: { bg: [0, 0, 0], fg: [51, 255, 51], dim: [30, 150, 30], strong: [51, 255, 51], accent: [170, 255, 0] } },
  { id: 'pro', label: 'Pro', wezterm: 'Pro',
    tui: { text: '38;5;251', bright: '38;5;231', dim: '38;5;244', key: '38;5;75', alert: '38;5;160', alertBright: '38;5;196' },
    zellij: { bg: [0, 0, 0], fg: [242, 242, 242], dim: [120, 120, 120], strong: [255, 255, 255], accent: [64, 160, 255] } },
  { id: 'ocean', label: 'Ocean', wezterm: 'Ocean',
    tui: { text: '38;5;231', bright: '38;5;230', dim: '38;5;110', key: '38;5;220', alert: '38;5;203', alertBright: '38;5;217' },
    zellij: { bg: [34, 79, 188], fg: [255, 255, 255], dim: [150, 170, 220], strong: [255, 255, 255], accent: [255, 220, 80] } },
  { id: 'grass', label: 'Grass', wezterm: 'Grass',
    tui: { text: '38;5;229', bright: '38;5;231', dim: '38;5;115', key: '38;5;222', alert: '38;5;209', alertBright: '38;5;216' },
    zellij: { bg: [19, 119, 61], fg: [255, 240, 165], dim: [120, 180, 140], strong: [255, 240, 165], accent: [255, 255, 255] } },
  { id: 'redsands', label: 'Red Sands', wezterm: 'Red Sands',
    tui: { text: '38;5;187', bright: '38;5;230', dim: '38;5;138', key: '38;5;221', alert: '38;5;227', alertBright: '38;5;229' },
    zellij: { bg: [122, 37, 30], fg: [215, 201, 167], dim: [170, 120, 100], strong: [255, 235, 200], accent: [255, 205, 60] } },
  { id: 'manpage', label: 'Man Page', wezterm: 'Man Page',
    tui: { text: '38;5;236', bright: '38;5;16', dim: '38;5;101', key: '38;5;26', alert: '38;5;124', alertBright: '38;5;160' },
    zellij: { bg: [254, 244, 156], fg: [40, 35, 10], dim: [110, 100, 60], strong: [60, 50, 0], accent: [0, 64, 192] } },
  { id: 'novel', label: 'Novel', wezterm: 'Novel',
    tui: { text: '38;5;237', bright: '38;5;16', dim: '38;5;95', key: '38;5;61', alert: '38;5;124', alertBright: '38;5;160' },
    zellij: { bg: [223, 219, 195], fg: [59, 35, 34], dim: [140, 120, 110], strong: [59, 35, 34], accent: [150, 50, 40] } },
  { id: 'solarized', label: 'Solarized Dark', wezterm: 'Solarized Dark Higher Contrast',
    tui: { text: '38;5;109', bright: '38;5;230', dim: '38;5;66', key: '38;5;33', alert: '38;5;160', alertBright: '38;5;203' },
    zellij: { bg: [0, 43, 54], fg: [131, 148, 150], dim: [88, 110, 117], strong: [253, 246, 227], accent: [38, 139, 210] } },
];

function stateRoot() { return path.join(os.homedir(), '.claude', 'state', 'cc'); }
export function themeFile() { return path.join(stateRoot(), 'theme.json'); }

export function currentTheme() {
  try {
    const { id } = JSON.parse(fs.readFileSync(themeFile(), 'utf8'));
    return THEMES.find((t) => t.id === id) || THEMES[0];
  } catch { return THEMES[0]; }
}

export function nextTheme(id) {
  const i = THEMES.findIndex((t) => t.id === id);
  return THEMES[(i + 1) % THEMES.length] || THEMES[0];
}

// The five color roles as ready-to-print SGR escapes.
export function tuiSgr(theme = currentTheme()) {
  const esc = (p) => '\x1b[' + p + 'm';
  const t = theme.tui;
  return { TEXT: esc(t.text), BRIGHT: esc(t.bright), DIM: esc(t.dim), KEY: esc(t.key), ALERT: esc(t.alert), ALERTBRIGHT: esc(t.alertBright) };
}

// ---- zellij component theme -------------------------------------------------
// Renders the theme as zellij's component format (0.42+), named "cc" so the
// config's `theme "cc"` line never changes — only this block's colors do.
export function zellijThemeKdl(theme = currentTheme()) {
  const { bg, fg, dim, strong, accent } = theme.zellij;
  const c = (rgb) => rgb.join(' ');
  const body = (base, background, e0 = accent, e1 = strong, e2 = dim, e3 = accent) =>
    `            base ${c(base)}\n            background ${c(background)}\n            emphasis_0 ${c(e0)}\n            emphasis_1 ${c(e1)}\n            emphasis_2 ${c(e2)}\n            emphasis_3 ${c(e3)}`;
  const block = (name, inner) => `        ${name} {\n${inner}\n        }`;
  const players = [accent, strong, dim, fg, accent, strong, dim, fg, accent, strong]
    .map((p, i) => `            player_${i + 1} ${c(p)}`).join('\n');
  return `themes {
    cc {
${block('text_unselected', body(fg, bg))}
${block('text_selected', body(bg, strong, accent, dim, dim, dim))}
${block('ribbon_unselected', body(dim, bg, accent, fg, dim, accent))}
${block('ribbon_selected', body(bg, strong, accent, dim, dim, dim))}
${block('table_title', body(accent, bg))}
${block('table_cell_unselected', body(fg, bg))}
${block('table_cell_selected', body(bg, strong, accent, dim, dim, dim))}
${block('list_unselected', body(fg, bg))}
${block('list_selected', body(bg, strong, accent, dim, dim, dim))}
${block('frame_unselected', body(dim, bg))}
${block('frame_selected', body(strong, bg, accent, accent, strong, dim))}
${block('frame_highlight', body(accent, bg, accent, accent, accent, accent))}
${block('exit_code_success', body(fg, bg))}
${block('exit_code_error', body(accent, bg))}
        multiplayer_user_colors {
${players}
        }
    }
}`;
}

// ---- wezterm hand-off ---------------------------------------------------------
export function weztermThemeLua(theme = currentTheme()) {
  return `-- written by claude-control-center (themes.mjs); wezterm.lua watches this file\nreturn { scheme = '${theme.wezterm}' }\n`;
}
export function weztermThemePath() {
  return path.join(os.homedir(), '.config', 'wezterm', 'cc-theme.lua');
}
export function writeWeztermTheme(theme = currentTheme()) {
  try {
    fs.mkdirSync(path.dirname(weztermThemePath()), { recursive: true });
    fs.writeFileSync(weztermThemePath(), weztermThemeLua(theme), 'utf8');
  } catch { /* best effort */ }
}

// ---- apply ------------------------------------------------------------------
// Persist the choice, recolor WezTerm instantly (it watches cc-theme.lua), and
// re-render the zellij config in the background via install.mjs (zellij
// live-reloads its config file, so the running session's chrome follows).
export function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  try {
    fs.mkdirSync(stateRoot(), { recursive: true });
    fs.writeFileSync(themeFile(), JSON.stringify({ id: theme.id }), 'utf8');
  } catch { /* best effort */ }
  writeWeztermTheme(theme);
  try {
    const child = spawn(process.execPath, [path.join(APP, 'install.mjs')], { stdio: 'ignore', windowsHide: true });
    child.on('error', () => { /* zellij chrome stays on the old theme until the next install */ });
    child.unref();
  } catch { /* same */ }
  return theme;
}
