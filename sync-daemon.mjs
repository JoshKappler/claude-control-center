#!/usr/bin/env node
// sync-daemon.mjs — the always-on background sync for Claude Control Center.
//
// Run on a schedule by a macOS LaunchAgent (see macos/install-sync-agent.sh).
// Each tick it:
//   1. Self-updates THIS repo (`git pull --ff-only`) so the control center keeps
//      itself current with whatever you pushed from another machine — the "meta"
//      part: the tool updates itself.
//   2. If the self-update pulled new commits, runs install.mjs so workspace/
//      machine config (zellij, wezterm, claude settings, …) is redeployed too.
//   3. Runs the freshly-pulled clone-all.mjs to clone-missing + ff-only pull every
//      OTHER repo into the projects root (the folder this repo lives in).
//   4. Appends a one-line summary to ~/.claude/state/cc/sync.log and writes the
//      full last result to ~/.claude/state/cc/sync-last.json.
//
// Safe by design: the --ff-only self-pull and clone-all both refuse to discard
// local work or force anything. Exit 0 ALWAYS — a bad tick is logged, never fatal,
// so the next scheduled tick just tries again.
//
// Zero npm deps; self-locating, so the whole folder can be moved or cloned anywhere.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(REPO);                 // the projects folder this repo sits in
const STATE = path.join(os.homedir(), '.claude', 'state', 'cc');
const LOG = path.join(STATE, 'sync.log');
const LAST = path.join(STATE, 'sync-last.json');
const LOG_CAP = 256 * 1024;

// LaunchAgents inherit a thin PATH — make sure git/gh/node resolve. The child
// clone-all inherits this augmented PATH (spawnSync uses process.env by default).
const EXTRA = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
process.env.PATH = [...EXTRA, ...(process.env.PATH || '').split(':')].filter(Boolean).join(':');

const ts = () => new Date().toISOString();

function head() {
  const r = spawnSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 30000 });
  return (!r.error && r.status === 0) ? String(r.stdout).trim() : '';
}

// Self-update this repo. Returns { note, changed } — `changed` drives the config
// redeploy below, so a pulled keybind/layout fix actually reaches this machine.
function selfUpdate() {
  const before = head();
  const r = spawnSync('git', ['-C', REPO, 'pull', '--ff-only', '--quiet'], { encoding: 'utf8', timeout: 120000 });
  if (r.error) return { note: 'self-update: ' + (r.error.code || r.error.message), changed: false };
  if (r.status !== 0) return { note: 'self-update: skipped (' + String(r.stderr || '').trim().replace(/\s+/g, ' ').slice(0, 80) + ')', changed: false };
  const after = head();
  return { note: 'self-update: ok', changed: !!before && !!after && before !== after };
}

function deployConfig(changed) {
  // Machine config (zellij + wezterm + claude settings + …) lives in workspace/ and
  // is deployed by install.mjs (chezmoi is retired). Without this step a config fix
  // pushed from another machine never reaches this one — the exact stale-config bug
  // the old chezmoi hook existed for. Only runs when self-update pulled new commits,
  // so a tick with nothing new touches nothing. Non-fatal. NOTE: new zellij config
  // still only applies to NEW sessions; a running claude-cc session is never touched.
  if (!changed) return 'config: unchanged';
  const r = spawnSync(process.execPath, [path.join(REPO, 'install.mjs')], { encoding: 'utf8', timeout: 120000 });
  if (r.error) return 'config: ' + (r.error.code || r.error.message);
  if (r.status !== 0) return 'config: install.mjs failed (' + String(r.stderr || '').trim().replace(/\s+/g, ' ').slice(0, 80) + ')';
  return 'config: deployed';
}

function runCloneAll() {
  // Spawn the (now freshly-pulled) clone-all with this same node binary.
  const r = spawnSync(process.execPath, [path.join(REPO, 'clone-all.mjs'), ROOT],
    { encoding: 'utf8', timeout: 30 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 });
  let parsed = null;
  try { parsed = JSON.parse(String(r.stdout || '').trim()); } catch { /* fall through */ }
  return { parsed, raw: r.stdout, err: r.stderr, status: r.status, error: r.error };
}

function summarize(parsed) {
  const counts = {};
  for (const rec of parsed.repos || []) counts[rec.action] = (counts[rec.action] || 0) + 1;
  return Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ') || 'no repos';
}

function appendLog(line) {
  try {
    fs.mkdirSync(STATE, { recursive: true });
    try {                                  // keep the log bounded — trim to last half past the cap
      if (fs.statSync(LOG).size > LOG_CAP) {
        fs.writeFileSync(LOG, fs.readFileSync(LOG, 'utf8').slice(-Math.floor(LOG_CAP / 2)));
      }
    } catch { /* no log yet */ }
    fs.appendFileSync(LOG, line + '\n');
  } catch { /* never fatal */ }
}

function main() {
  fs.mkdirSync(STATE, { recursive: true });
  const { note: self, changed } = selfUpdate();
  const config = deployConfig(changed);
  const { parsed, raw, err, status, error } = runCloneAll();

  if (parsed) {
    try { fs.writeFileSync(LAST, JSON.stringify({ at: ts(), self, config, ...parsed }, null, 2)); } catch { /* */ }
    appendLog(`${ts()}  ${self}  |  ${config}  |  ${summarize(parsed)}`);
  } else {
    const why = error ? (error.code || error.message)
      : String(err || raw || 'no output').trim().replace(/\s+/g, ' ').slice(0, 160);
    appendLog(`${ts()}  ${self}  |  ${config}  |  clone-all FAILED (status ${status}): ${why}`);
  }
  process.exit(0);
}

main();
