-- ~/.config/wezterm/wezterm.lua  — deployed by `node install.mjs` from this repo.
-- Font size and the Windows default shell are filled in per-OS at install time.
local wezterm = require 'wezterm'
local config = wezterm.config_builder()

config.font = wezterm.font_with_fallback { 'JetBrainsMono Nerd Font', 'JetBrains Mono', 'Cascadia Code', 'Consolas' }
config.font_size = {{FONT_SIZE}}
config.color_scheme = 'Homebrew'   -- classic green-on-black phosphor look
config.hide_tab_bar_if_only_one_tab = true
config.window_decorations = 'TITLE | RESIZE'   -- title bar so the control-center window is easy to drag/move
config.window_close_confirmation = 'NeverPrompt'
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

-- Lightweight cheat cue: while LEADER is held, show the available window/tab keys.
wezterm.on('update-right-status', function(window, _)
  window:set_right_status(window:leader_is_active() and ' LEADER ▸ n:new-win  t:tab  w:close  f:fullscreen ' or '')
end)

return config
