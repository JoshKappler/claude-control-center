#Requires AutoHotkey v2.0
#SingleInstance Off
; open-control-center.ahk — the DESKTOP-ICON entry point for the Claude Control
; Center. Focuses the window if it's already open, otherwise launches and
; positions it, then exits. The global Ctrl+Alt+C hotkey lives in claude-cc.ahk;
; this is the double-click path, kept as a separate file so it never disturbs
; the persistent hotkey instance (#SingleInstance Off + its own filename).

GridClass := "wezterm-claude-cc"
; Self-locating (see claude-cc.ahk): launch.cmd is alongside this script. No
; hardcoded install path.
LaunchCmd := A_ScriptDir "\launch.cmd"
; Resolve wezterm by full path so it works regardless of the inherited PATH.
WezExe := FileExist(A_ProgramFiles "\WezTerm\wezterm.exe") ? A_ProgramFiles "\WezTerm\wezterm.exe" : "wezterm"
; NO session watchdog any more (2026-07-01 incident): closing the window only
; detaches — the session and its agents keep running; the next launch reattaches.

FindVerticalMonitor() {
    Loop MonitorGetCount() {
        MonitorGetWorkArea(A_Index, &l, &t, &r, &b)
        if ((b - t) > (r - l))          ; taller than wide = the vertical monitor
            return A_Index
    }
    return MonitorGetPrimary()
}

; Cross-process launch lock (shared with claude-cc.ahk). This script is deliberately
; #SingleInstance Off, so two of ITS own triggers, or one of its plus the hotkey, can
; both pass WinExist() ~15ms apart and start two `zellij attach -c claude-cc` clients
; — a double FirstClientConnected corrupts the zellij server. A shared named mutex
; serialises the check-then-spawn section; if it's busy we focus the other launch's
; window instead of spawning. Returns the handle on success, 0 if the lock is busy.
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

; Already open? Just focus it — never spawn a second window.
existing := WinExist("ahk_class " GridClass)
if existing {
    WinActivate("ahk_id " existing)
    ExitApp
}

; Serialise the check-then-spawn against the hotkey launcher and any concurrent copy.
lock := AcquireLaunchLock()
if !lock {
    ; Another launch is already in flight — don't race a second client in; wait
    ; briefly for its window and focus that instead of spawning our own.
    if WinWait("ahk_class " GridClass, , 6)
        WinActivate("ahk_class " GridClass)
    ExitApp
}
win := 0
alreadyOpen := false
try {
    ; Re-check WinExist under the lock: the in-flight launch may have opened it.
    existing := WinExist("ahk_class " GridClass)
    if existing {
        WinActivate("ahk_id " existing)
        alreadyOpen := true
    } else {
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
    }
} finally {
    ReleaseLaunchLock(lock)          ; hold only through check→Run→window-appears
}
; Non-maximized + movable: fit comfortably inside the vertical monitor's work
; area with margins, matching the Ctrl+Alt+C hotkey behavior.
if (!alreadyOpen && win && WinExist("ahk_id " win)) {
    try {
        WinRestore("ahk_id " win)
        ww := r - l
        wh := b - t
        w  := ww - 80
        h  := Round(wh * 0.72)
        WinMove(l + 40, t + 40, w, h, "ahk_id " win)
    }
}
ExitApp
