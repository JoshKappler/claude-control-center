#Requires AutoHotkey v2.0
#SingleInstance Force
#MaxThreadsPerHotkey 1                  ; a second Ctrl+Alt+C can't re-enter mid-launch
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

; Cross-process launch lock. The hotkey (this script) and the desktop-icon path
; (open-control-center.ahk) both check WinExist() then spawn a WezTerm client; two
; triggers ~15ms apart can both pass the check and start two `zellij attach -c
; claude-cc` clients, whose double FirstClientConnected corrupts the zellij server
; (poisoned mutex). A shared named mutex serialises the check-then-spawn section
; across both scripts. Returns the handle on success, 0 if the lock is busy.
AcquireLaunchLock(timeout := 6000) {
    h := DllCall("CreateMutexW", "Ptr", 0, "Int", 0, "Str", "Local\FleetViewCCLaunch", "Ptr")
    if !h
        return 0
    ; 0 = WAIT_OBJECT_0 (got it); 0x80 = WAIT_ABANDONED (prior owner died — still ours).
    r := DllCall("WaitForSingleObject", "Ptr", h, "UInt", timeout, "UInt")
    if (r = 0 || r = 0x80)
        return h
    DllCall("CloseHandle", "Ptr", h)
    return 0
}
ReleaseLaunchLock(h) {
    if h {
        DllCall("ReleaseMutex", "Ptr", h)
        DllCall("CloseHandle", "Ptr", h)
    }
}

OpenCenter() {
    ; Already open? Just focus it — never spawn a second window.
    existing := WinExist("ahk_class " GridClass)
    if existing {
        WinActivate("ahk_id " existing)
        return
    }
    ; Serialise the check-then-spawn against the desktop-icon launcher.
    lock := AcquireLaunchLock()
    if !lock {
        ; Another launch is already in flight — don't race a second client in; wait
        ; briefly for its window and focus that instead of spawning our own.
        if WinWait("ahk_class " GridClass, , 6)
            WinActivate("ahk_class " GridClass)
        return
    }
    win := 0
    try {
        ; Re-check WinExist under the lock: the in-flight launch may have opened it.
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
    } finally {
        ReleaseLaunchLock(lock)          ; hold only through check→Run→window-appears
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
