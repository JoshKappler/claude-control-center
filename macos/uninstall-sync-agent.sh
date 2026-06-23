#!/usr/bin/env bash
# uninstall-sync-agent.sh — stop + remove the background-sync LaunchAgent.
# Your repos, logs, and the app itself are left untouched.
set -euo pipefail
LABEL="com.josh.claude-control-center.sync"
UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "Removed $LABEL (stopped + plist deleted). Repos and logs are untouched."
