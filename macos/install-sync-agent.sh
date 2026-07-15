#!/usr/bin/env bash
# install-sync-agent.sh — install + start the Claude Control Center background sync
# as a macOS LaunchAgent. Idempotent: re-run any time to refresh it.
#
#   - Runs sync-daemon.mjs at every login (RunAtLoad) AND every 10 min (StartInterval).
#   - Self-locating: works from any clone location, no hardcoded paths.
#   - Logs to ~/.claude/state/cc/.
#
# Usage:
#   bash macos/install-sync-agent.sh                 # default 600s interval
#   CC_SYNC_INTERVAL=300 bash macos/install-sync-agent.sh   # custom interval (seconds)

set -euo pipefail

LABEL="com.josh.claude-control-center.sync"
INTERVAL="${CC_SYNC_INTERVAL:-600}"          # seconds between background syncs

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # <repo>/macos
REPO="$(cd "$HERE/.." && pwd)"
DAEMON="$REPO/sync-daemon.mjs"

NODE="$(command -v node || true)"
[ -n "$NODE" ]   || { echo "error: node not found on PATH"; exit 1; }
[ -f "$DAEMON" ] || { echo "error: missing $DAEMON"; exit 1; }

STATE="$HOME/.claude/state/cc"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$STATE" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$DAEMON</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$STATE/sync-daemon.out</string>
  <key>StandardErrorPath</key><string>$STATE/sync-daemon.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
</dict>
</plist>
PLIST_EOF

UID_NUM="$(id -u)"
launchctl bootout   "gui/$UID_NUM/$LABEL" 2>/dev/null || true   # ignore "not loaded" on first install
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
launchctl enable    "gui/$UID_NUM/$LABEL"
launchctl kickstart -k "gui/$UID_NUM/$LABEL"                     # run one sync right now

echo "Installed + started: $LABEL"
echo "  daemon : $DAEMON"
echo "  runs   : at every login, then every ${INTERVAL}s"
echo "  logs   : $STATE/sync.log   (full last result: $STATE/sync-last.json)"
echo "  plist  : $PLIST"
