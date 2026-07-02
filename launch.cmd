@echo off
REM Trampoline kept for any old shortcut that points at the repo root — the real
REM launcher lives in workspace\windows\launch.cmd (single source of truth).
call "%~dp0workspace\windows\launch.cmd"
