#Requires AutoHotkey v2.0
#SingleInstance Force
; claude-cc.ahk — open / focus the Claude Control Center.
;   Ctrl+Alt+C  -> focus the control-center window if it's open, else launch it.
; ONE movable, non-maximized WezTerm window hosts the persistent "claude-cc"
; Zellij session: a permanent Home tab (directory navigator + agent-count picker
; + mass git-push + 5h/weekly limit gauges + cheatsheet) plus one tab per launched
; group of 1-8 Claude agents. Agent count + new tabs are chosen from Home now, so a
; single hotkey replaces the old 4/6/8 grid hotkeys.
; Requires: wezterm + zellij + node + claude on PATH. Session helper: launch.cmd.

GridClass := "wezterm-claude-cc"
; Self-locating: this script lives in <repo>/workspace/windows/, so launch.cmd is
; alongside it. No hardcoded install path — works wherever the repo is cloned.
LaunchCmd := A_ScriptDir "\launch.cmd"
; Resolve wezterm by full path so the launcher works regardless of the PATH it
; inherited (a bare `wezterm` fails if started from a thin-PATH context).
WezExe := FileExist(A_ProgramFiles "\WezTerm\wezterm.exe") ? A_ProgramFiles "\WezTerm\wezterm.exe" : "wezterm"
; NO session watchdog any more (2026-07-01 incident): closing the window only
; detaches — the claude-cc session and every agent in it keep running, and the
; next Ctrl+Alt+C reattaches to them. Ending a session is always deliberate
; (Ctrl+Alt+Q per tab, or `zellij delete-session claude-cc --force`).

FindVerticalMonitor() {
    Loop MonitorGetCount() {
        MonitorGetWorkArea(A_Index, &l, &t, &r, &b)
        if ((b - t) > (r - l))          ; taller than wide = the vertical monitor
            return A_Index
    }
    return MonitorGetPrimary()
}

OpenCenter() {
    ; Already open? Just focus it — never spawn a second window.
    existing := WinExist("ahk_class " GridClass)
    if existing {
        WinActivate("ahk_id " existing)
        return
    }
    mon := FindVerticalMonitor()
    MonitorGetWorkArea(mon, &l, &t, &r, &b)
    before := WinGetList("ahk_class " GridClass)
    ; wezterm execs PROG directly (CreateProcess), which can't run a .cmd — wrap in cmd /c.
    Run('"' WezExe '" start --class ' GridClass ' -- cmd /c "' LaunchCmd '"')
    win := 0
    Loop 60 {                            ; wait up to ~6s for the new window
        Sleep 100
        for hwnd in WinGetList("ahk_class " GridClass) {
            isNew := true
            for old in before
                if (old == hwnd) {
                    isNew := false
                    break
                }
            if isNew {
                win := hwnd
                break
            }
        }
        if win
            break
    }
    ; Position only if the window is still alive (it can close fast on a launch
    ; error); guard so a vanished window never throws a script error.
    if (win && WinExist("ahk_id " win)) {
        try {
            WinRestore("ahk_id " win)
            ; Non-maximized + movable: fit comfortably inside the vertical monitor's
            ; work area with margins, so DPI scaling can't push it off the bottom-right.
            ww := r - l
            wh := b - t
            w  := ww - 80
            h  := Round(wh * 0.72)
            WinMove(l + 40, t + 40, w, h, "ahk_id " win)
        }
    }
}

^!c:: OpenCenter()
