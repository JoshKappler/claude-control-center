#!/usr/bin/env node
// agent-pane.mjs — conversation continuity for agent panes.
//
// Panes used to run `claude` directly, which quietly broke resume-ability: a pane
// holds NO shell, so when its claude exits (crash, /exit, an auto-update restart)
// or a serialized session is resurrected after a reboot, re-running the pane
// started a BRAND-NEW conversation. In a normal terminal you'd just type
// `claude --resume` — in a pane there was nowhere to type it. (In-pane /resume
// inside a RUNNING claude works fine; it's the relaunch path that lost the thread.)
//
// This wrapper is the pane command instead:
//
//     node agent-pane.mjs --key <stable-key> -- <claude flags...>
//
// It pins pane -> conversation:
//   - It exports CC_PANE_KEY=<key>; the SessionStart hook (session-register.mjs)
//     writes agent-keys/<key> = <session_id> on every session start (incl. /clear).
//   - On launch it reads that binding back: if the bound session's transcript still
//     exists, it runs `claude --resume <id> <flags>` — the SAME conversation returns.
//     First run (no binding) or a vanished transcript starts fresh.
//   - A resume that claude itself refuses (stale id) dies fast; one fresh relaunch
//     then keeps the pane usable instead of showing a dead error pane.
//
// The key must SURVIVE resurrection, so home.mjs bakes a per-launch nonce into the
// generated layout (`<nonce>-<k>`) — zellij serializes the concrete command line,
// so the key comes back with the session. The Alt+a keybind (static, can't mint a
// nonce) passes `--key auto`, which derives one from the zellij session + pane id.
//
// Contract: zero npm deps, Node built-ins only, self-locating, never loops.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Keys become filenames under agent-keys/ — keep them boring.
export function sanitizeKey(k) {
  return String(k).replace(/[^A-Za-z0-9._-]/g, '-');
}

// Explicit key wins. `auto` (the static Alt+a bind) derives a key that is stable
// for the life of the pane: zellij session + pane id. With no pane id (bare
// terminal / tests) fall back to a throwaway — continuity off, claude still runs.
export function resolveKey(rawKey, env = process.env) {
  if (rawKey && rawKey !== 'auto') return sanitizeKey(rawKey);
  const sess = env.ZELLIJ_SESSION_NAME || 'nosess';
  if (env.ZELLIJ_PANE_ID !== undefined && env.ZELLIJ_PANE_ID !== '') {
    return sanitizeKey('auto-' + sess + '-p' + env.ZELLIJ_PANE_ID);
  }
  return sanitizeKey('auto-' + sess + '-' + Date.now().toString(36));
}

// argv (after the script path) -> { key, claudeArgs }. Everything after `--` goes
// to claude verbatim; stray tokens before it do too (defensive, not a real case).
export function parseArgs(argv) {
  let key = null;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--key') { key = argv[++i]; continue; }
    if (a === '--') { rest.push(...argv.slice(i + 1)); break; }
    rest.push(a);
  }
  return { key, claudeArgs: rest };
}

// Claude Code's project slug for a cwd (~/.claude/projects/<slug>/<session>.jsonl).
export function projectSlug(cwd) {
  return String(cwd).replace(/[^a-zA-Z0-9]/g, '-');
}

function agentKeyFile(key, home) {
  return path.join(home, '.claude', 'state', 'cc', 'agent-keys', key);
}

// The session id this pane last ran, or null. Content is hook-written; still
// validate the shape so a corrupt file can never inject a CLI argument.
export function boundSession(key, home = os.homedir()) {
  try {
    const id = fs.readFileSync(agentKeyFile(key, home), 'utf8').trim();
    return /^[0-9a-zA-Z-]{8,64}$/.test(id) ? id : null;
  } catch { return null; }
}

// Does the bound session's transcript still exist? Check the cwd's own project
// dir first; fall back to a scan of all project dirs (claude hashes over-long
// slugs, and cwd casing has drifted historically — the scan is ~20 stats, cheap).
export function transcriptExists(cwd, sessionId, home = os.homedir()) {
  const projects = path.join(home, '.claude', 'projects');
  try {
    if (fs.statSync(path.join(projects, projectSlug(cwd), sessionId + '.jsonl')).size > 0) return true;
  } catch { /* fall through to the scan */ }
  try {
    for (const d of fs.readdirSync(projects)) {
      try {
        if (fs.statSync(path.join(projects, d, sessionId + '.jsonl')).size > 0) return true;
      } catch { /* not this dir */ }
    }
  } catch { /* no projects dir at all */ }
  return false;
}

// A resume that claude refuses (deleted/stale session) errors out in seconds; a
// real conversation that later ends lives far longer. Under this cutoff a failed
// resume gets ONE fresh relaunch instead of leaving a dead error pane.
const QUICK_FAIL_MS = 15000;

function runClaude(args, key) {
  const r = spawnSync('claude', args, {
    stdio: 'inherit',
    env: { ...process.env, CC_PANE_KEY: key },
  });
  if (r.error) {
    console.error(r.error.code === 'ENOENT'
      ? 'agent-pane: `claude` not found on PATH'
      : 'agent-pane: failed to start claude: ' + (r.error.message || r.error));
    return 1;
  }
  return r.status == null ? 1 : r.status;
}

function isDirectRun() {
  try { return !!process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); }
  catch { return true; }
}

if (isDirectRun()) {
  const { key: rawKey, claudeArgs } = parseArgs(process.argv.slice(2));
  const key = resolveKey(rawKey);
  const prev = boundSession(key);
  let code;
  if (prev && transcriptExists(process.cwd(), prev)) {
    const t0 = Date.now();
    code = runClaude(['--resume', prev, ...claudeArgs], key);
    if (code !== 0 && Date.now() - t0 < QUICK_FAIL_MS) code = runClaude(claudeArgs, key);
  } else {
    code = runClaude(claudeArgs, key);
  }
  process.exit(code);
}
