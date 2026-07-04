#!/usr/bin/env node
// Tests for agent-pane.mjs (pane->conversation continuity) and the agent-keys
// binding side of hooks/session-register.mjs.
//
// The rule these pin: an agent pane RESUMES its own conversation on any re-run
// (claude exit + Enter, or a session resurrected after a reboot) instead of
// silently starting a fresh one. The binding is written by the SessionStart hook
// (agent-keys/<CC_PANE_KEY> = session_id) and read back by the wrapper; it must
// SURVIVE SessionEnd — surviving the process's death is its whole point.
//
// Run: node agent-pane.test.mjs   (zero deps; exits non-zero on failure)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, resolveKey, sanitizeKey, projectSlug, boundSession, transcriptExists } from './agent-pane.mjs';

const APP = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); failures++; }
}

// --- argv parsing --------------------------------------------------------------
{
  const p = parseArgs(['--key', 'k1', '--', '--dangerously-skip-permissions', '--model', 'opus']);
  check('parseArgs splits key and claude args',
    p.key === 'k1' && JSON.stringify(p.claudeArgs) === '["--dangerously-skip-permissions","--model","opus"]');
  check('parseArgs with no key/-- passes everything through',
    parseArgs(['--model', 'opus']).key === null && parseArgs(['--model', 'opus']).claudeArgs.length === 2);
  check('parseArgs with empty argv is a bare launch',
    parseArgs([]).key === null && parseArgs([]).claudeArgs.length === 0);
}

// --- key derivation --------------------------------------------------------------
{
  check('explicit key wins verbatim', resolveKey('m3launch-2', {}) === 'm3launch-2');
  check('keys are sanitized to safe filenames', sanitizeKey('a/b\\c:d e') === 'a-b-c-d-e');
  check('auto key is stable per zellij pane',
    resolveKey('auto', { ZELLIJ_SESSION_NAME: 'claude-cc', ZELLIJ_PANE_ID: '8' }) === 'auto-claude-cc-p8'
    && resolveKey('auto', { ZELLIJ_SESSION_NAME: 'claude-cc', ZELLIJ_PANE_ID: '8' }) === resolveKey('auto', { ZELLIJ_SESSION_NAME: 'claude-cc', ZELLIJ_PANE_ID: '8' }));
  check('auto key without a pane id still yields a usable key',
    resolveKey('auto', {}).startsWith('auto-nosess-'));
}

// --- binding + transcript lookup (hermetic fake HOME) ---------------------------
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-agent-pane-test-'));
process.on('exit', () => { try { fs.rmSync(FAKE_HOME, { recursive: true, force: true }); } catch { /* */ } });
const SID = '2534d25b-c671-4050-aa3a-c47b0d79bec9';
const CWD = 'C:\\Users\\x\\projects\\demo';
{
  check('projectSlug matches the claude munge', projectSlug(CWD) === 'C--Users-x-projects-demo');

  const keysDir = path.join(FAKE_HOME, '.claude', 'state', 'cc', 'agent-keys');
  fs.mkdirSync(keysDir, { recursive: true });
  fs.writeFileSync(path.join(keysDir, 'k1'), SID + '\n');
  fs.writeFileSync(path.join(keysDir, 'evil'), '--help; rm -rf /');
  check('boundSession reads the binding back', boundSession('k1', FAKE_HOME) === SID);
  check('boundSession rejects a corrupt/injected binding', boundSession('evil', FAKE_HOME) === null);
  check('boundSession without a binding is null', boundSession('nope', FAKE_HOME) === null);

  const projDir = path.join(FAKE_HOME, '.claude', 'projects', projectSlug(CWD));
  fs.mkdirSync(projDir, { recursive: true });
  check('missing transcript -> no resume', transcriptExists(CWD, SID, FAKE_HOME) === false);
  fs.writeFileSync(path.join(projDir, SID + '.jsonl'), '{"type":"user"}\n');
  check('transcript in the cwd project dir is found', transcriptExists(CWD, SID, FAKE_HOME) === true);

  // Slug drift (historical cwd-casing / hashed long slugs): found by the scan.
  const otherDir = path.join(FAKE_HOME, '.claude', 'projects', 'C--somewhere-else');
  fs.mkdirSync(otherDir, { recursive: true });
  const SID2 = 'ff8f879e-df0e-495e-9dc7-c97591d8d8aa';
  fs.writeFileSync(path.join(otherDir, SID2 + '.jsonl'), '{"type":"user"}\n');
  check('transcript under a different project slug is still found', transcriptExists(CWD, SID2, FAKE_HOME) === true);
}

// --- the SessionStart/SessionEnd hook maintains (and preserves) the binding -----
{
  const hook = path.join(APP, 'hooks', 'session-register.mjs');
  const env = {
    ...process.env,
    HOME: FAKE_HOME, USERPROFILE: FAKE_HOME,       // os.homedir(): HOME on POSIX, USERPROFILE on Windows
    CC_PANE_KEY: 'm3launch-2', ZELLIJ_PANE_ID: '42',
  };
  const fire = (event) => spawnSync('node', [hook], {
    env, encoding: 'utf8',
    input: JSON.stringify({ hook_event_name: event, session_id: SID }),
  });

  fire('SessionStart');
  const keyFile = path.join(FAKE_HOME, '.claude', 'state', 'cc', 'agent-keys', 'm3launch-2');
  const paneFile = path.join(FAKE_HOME, '.claude', 'state', 'cc', 'panes', '42');
  const readTrim = (p) => { try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; } };
  check('SessionStart writes agent-keys/<CC_PANE_KEY> = session_id', readTrim(keyFile) === SID);
  check('SessionStart still writes panes/<ZELLIJ_PANE_ID>', readTrim(paneFile) === SID);

  fire('SessionEnd');
  check('SessionEnd prunes the pane registration', readTrim(paneFile) === null);
  check('SessionEnd PRESERVES the agent-keys binding (continuity across exits)', readTrim(keyFile) === SID);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
