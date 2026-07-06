-- ~/.config/wezterm/wezterm.lua  — deployed by `node install.mjs` from this repo.
-- Font size and the Windows default shell are filled in per-OS at install time.
local wezterm = require 'wezterm'
local config = wezterm.config_builder()

config.font = wezterm.font_with_fallback { 'JetBrainsMono Nerd Font', 'JetBrains Mono', 'Cascadia Code', 'Consolas' }
config.font_size = {{FONT_SIZE}}

-- COLOR THEME: themes.mjs writes ~/.config/wezterm/cc-theme.lua when you press [t]
-- on the Home dashboard; watching it makes every open window recolor instantly.
-- Unknown/missing scheme names fall back to the classic Homebrew phosphor look.
config.color_scheme = 'Homebrew'
local cc_theme_path = wezterm.home_dir .. '/.config/wezterm/cc-theme.lua'
local theme_ok, cc_theme = pcall(dofile, cc_theme_path)
if theme_ok and type(cc_theme) == 'table' and type(cc_theme.scheme) == 'string' then
  local builtins = wezterm.color.get_builtin_schemes()
  if builtins[cc_theme.scheme] then config.color_scheme = cc_theme.scheme end
end
wezterm.add_to_config_reload_watch_list(cc_theme_path)

config.hide_tab_bar_if_only_one_tab = true
config.window_decorations = 'TITLE | RESIZE'   -- title bar so the control-center window is easy to drag/move
-- Any window-close path asks first (there is always a live zellij inside) — and even
-- a confirmed close only DETACHES the zellij session; nothing running is lost.
config.window_close_confirmation = 'AlwaysPrompt'
config.adjust_window_size_when_changing_font_size = false
config.scrollback_lines = 10000
{{WIN_DEFAULT_PROG}}
-- Leader = CTRL+a, deliberately distinct from Zellij's Ctrl-p/Ctrl-t modes so the two
-- never collide. WezTerm manages only WINDOWS/TABS here; Zellij owns panes inside a window.
config.leader = { key = 'a', mods = 'CTRL', timeout_milliseconds = 1000 }
config.keys = {
  -- Plain Ctrl+V pastes from the clipboard (terminals normally reserve this combo;
  -- bind it so paste works like every other app). Ctrl+Shift+V still works too.
  { key = 'v', mods = 'CTRL', action = wezterm.action.PasteFrom 'Clipboard' },
  { key = 'n', mods = 'LEADER', action = wezterm.action.SpawnWindow },
  { key = 't', mods = 'LEADER', action = wezterm.action.SpawnTab 'CurrentPaneDomain' },
  { key = 'w', mods = 'LEADER', action = wezterm.action.CloseCurrentTab { confirm = false } },
  { key = 'f', mods = 'LEADER', action = wezterm.action.ToggleFullScreen },
}
-- macOS: an accidental Cmd+Q must never take down the control center. Dead-key it;
-- quitting stays available from the menu bar, and even THAT only detaches zellij —
-- Ctrl+Alt+C (Hammerspoon) reattaches with every agent still running.
if wezterm.target_triple:find('apple') then
  table.insert(config.keys, { key = 'q', mods = 'CMD', action = wezterm.action.DisableDefaultAssignment })
end

-- Ctrl+scroll normally ZOOMS the font — mid-session it reads as a broken second
-- "resize" system next to zellij's real pane resize, so it's disabled. Font size
-- still adjusts with Cmd/Ctrl+= and Cmd/Ctrl+- (the WezTerm defaults).
config.mouse_bindings = {
  { event = { Down = { streak = 1, button = { WheelUp = 1 } } },   mods = 'CTRL', action = wezterm.action.Nop },
  { event = { Down = { streak = 1, button = { WheelDown = 1 } } }, mods = 'CTRL', action = wezterm.action.Nop },
}

-- Lightweight cheat cue: while LEADER is held, show the available window/tab keys.
wezterm.on('update-right-status', function(window, _)
  window:set_right_status(window:leader_is_active() and ' LEADER ▸ n:new-win  t:tab  w:close  f:fullscreen ' or '')
end)

-- OS title bar reads "Claude Control Center", not zellij's "Zellij (claude-cc)"
-- branding — you already know where you are; the row that matters is the Alt+S hint.
wezterm.on('format-window-title', function() return 'Claude Control Center' end)

-- Launch MAXIMIZED (windowed full-screen): fill the whole monitor, snapped to the
-- top, but keep the title bar (window_decorations = 'TITLE') so it can still be
-- dragged, resized, and closed with the mouse. NOT ToggleFullScreen (that hides the
-- chrome). Leader+f still toggles true fullscreen on demand.
wezterm.on('gui-startup', function(cmd)
  local _, _, window = wezterm.mux.spawn_window(cmd or {})
  window:gui_window():maximize()
end)

return config
