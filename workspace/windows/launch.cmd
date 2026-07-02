@echo off
setlocal
REM Claude Control Center session launcher (runs inside the WezTerm window).
REM Prepend the tool dirs so zellij/node/claude resolve even if the inherited
REM PATH is thin (this propagates to the panes zellij spawns: node Home, claude).
set "PATH=%LOCALAPPDATA%\Zellij;%ProgramFiles%\nodejs;%ProgramFiles%\GitHub CLI;%USERPROFILE%\.local\bin;%PATH%"

REM SESSION DURABILITY (the 2026-07-01 incident rule): NEVER delete a session on
REM launch. If a claude-cc session already exists — because the window was closed,
REM the client crashed, or a keystroke kicked you out mid-refactor — `attach -c`
REM RESUMES it with every agent intact. Only a genuinely missing session is created
REM fresh (with default_layout "cc-default" = the Home tab). Do NOT use
REM `-s NAME --layout` (0.44.3 treats that as an attach and exits "session not found").
zellij attach -c claude-cc
if %errorlevel%==0 goto :done

echo.
echo ============================================================
echo  [claude-cc] Zellij exited (errorlevel %errorlevel%).
echo.
echo  where zellij  ^>
where zellij
echo  where node    ^>
where node
echo.
echo  If the session is stuck/corrupt you can start fresh, but that
echo  DESTROYS it and every agent in it - only do this deliberately.
choice /c KC /n /m "  Press K to kill the stuck session and start fresh, or C to close."
if errorlevel 2 goto :done
zellij delete-session claude-cc --force >nul 2>&1
zellij attach -c claude-cc

:done
