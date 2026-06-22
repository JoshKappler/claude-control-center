#!/usr/bin/env node
// Claude Control Center — Home TUI
// Raw-ANSI full-screen alt-screen TUI. Zero npm deps; Node built-ins only.
//
// The Home tab is the "is my whole system up to date / synced" dashboard:
//   - Header           : title + day / date / time on the right
//   - Folder + DIRECTORY navigator (Up/Dn or k/j, ->/l enter, <-/h parent)
//   - LAUNCH           : Enter opens a new window of N agents in the folder
//   - SYNC STATUS      : clone-all + push-all buttons, with last-run times
//   - SESSION LIMITS   : 5h + weekly usage gauges
//   - SUBAGENTS        : parents with running subagent children
//   - SYSTEM           : CPU / MEM / DISK / GPU gauges (kept near the bottom)
//   - Cheatsheet footer
//
// Colors: black background everywhere, no highlight fills. Mostly GREEN (content,
// headers in bold, dim for muted). BLUE is reserved for shortcut keys where
// separation matters. RED for emphasis/errors.
//
// Input: a manual byte-stream parser (Node's stdin in a Zellij pane is a pipe,
// not a console). Arrows + k/j/h/l navigate. Rendering is differential (no full
// screen clear) so holding a key never flickers.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---------- shared state ----------
const HOME = os.homedir();
// Self-locating: sibling scripts (git-push-all, clone-all, inspector, layouts/)
// are found relative to THIS file, so the app runs correctly wherever it lives —
// its repo at ~/OneDrive/desktop/projects/claude-control-center, or the old
// ~/.local/share/claude-cc deploy. No hard-coded install path any more.
const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
function stateRoot() { return path.join(HOME, '.claude', 'state', 'cc'); }
function agentsDir() { return path.join(stateRoot(), 'agents'); }
function subagentsRootDir() { return path.join(stateRoot(), 'subagents'); }
function syncFile() { return path.join(stateRoot(), 'sync.json'); }
function appDir() { return APP_DIR; }
function inspectorPath() { return path.join(appDir(), 'inspector.mjs'); }
function gitPushPath() { return path.join(appDir(), 'git-push-all.mjs'); }
function cloneAllPath() { return path.join(appDir(), 'clone-all.mjs'); }
// The claude-N.kdl files are TEMPLATES containing the token {{APP}} wherever they
// reference a sibling script. We render the token to the live APP_DIR at launch
// and write the result to the state dir, so the agent tabs work no matter where
// this app folder lives — no stale hard-coded install path baked into the layout.
function layoutPath(n) {
  const tmpl = path.join(appDir(), 'layouts', 'claude-' + n + '.kdl');
  const genDir = path.join(stateRoot(), 'gen');
  const outFile = path.join(genDir, 'claude-' + n + '.kdl');
  try {
    let s = fs.readFileSync(tmpl, 'utf8');
    s = s.split('{{APP}}').join(appDir().replace(/\\/g, '/'));
    fs.mkdirSync(genDir, { recursive: true });
    fs.writeFileSync(outFile, s, 'utf8');
    return outFile.replace(/\\/g, '/');
  } catch {
    return tmpl.replace(/\\/g, '/');   // fallback: use the template as-is
  }
}
const AGENT_STALE_MS = 120 * 1000;

function ensureStateRoot() { try { fs.mkdirSync(stateRoot(), { recursive: true }); } catch { /* */ } }

function readSync() {
  try { return JSON.parse(fs.readFileSync(syncFile(), 'utf8').replace(/^﻿/, '')); } catch { return {}; }
}
function writeSync(patch) {
  try {
    const cur = readSync();
    const next = Object.assign({}, cur, patch);
    fs.writeFileSync(syncFile(), JSON.stringify(next), 'utf8');
  } catch { /* best effort */ }
}

// ---------- ANSI ----------
const ESC = '\x1b';
const ALT_ON = ESC + '[?1049h';
const ALT_OFF = ESC + '[?1049l';
const CURSOR_HIDE = ESC + '[?25l';
const CURSOR_SHOW = ESC + '[?25h';
const HOME_POS = ESC + '[H';
const CLR_EOL = ESC + '[K';
const CLR_BELOW = ESC + '[J';
function sgr(c) { return ESC + '[' + c + 'm'; }
const RESET = sgr(0);
const BOLD = sgr(1);
const DIM = sgr(2);
const GREEN = sgr(32);
const BGREEN = sgr(92);
const DGREEN = sgr(2) + sgr(32);   // muted green (dividers, files, hints)
const BBLUE = sgr(94);             // keys only
const RED = sgr(31);
const BRED = sgr(91);
const REV = sgr(7);                // reverse video — the unmistakable selection bar

function hdr(s) { return BOLD + BGREEN + s + RESET; }     // section header = bold bright green
function keyc(s) { return BOLD + BBLUE + '[' + s + ']' + RESET; } // a shortcut key (blue)

// ---------- text utils ----------
function asciiSafe(s) { if (s == null) return ''; return String(s).replace(/[^\x20-\x7e]/g, '?'); }
function truncate(s, n) {
  s = String(s == null ? '' : s);
  if (s.length <= n) return s;
  if (n <= 1) return s.slice(0, n);
  return s.slice(0, n - 1) + '~';
}
function pad(s, n) { s = String(s == null ? '' : s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }
function padLeft(s, n) { s = String(s == null ? '' : s); return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s; }

function termCols() { return (process.stdout.columns && process.stdout.columns > 0) ? process.stdout.columns : 80; }
function termRows() { return (process.stdout.rows && process.stdout.rows > 0) ? process.stdout.rows : 24; }

// ---------- directories ----------
function defaultRoot() {
  const cand = path.join(HOME, 'OneDrive', 'desktop', 'projects');
  try { if (fs.existsSync(cand) && fs.statSync(cand).isDirectory()) return cand; } catch { /* */ }
  const cand2 = path.join(HOME, 'desktop', 'projects');
  try { if (fs.existsSync(cand2) && fs.statSync(cand2).isDirectory()) return cand2; } catch { /* */ }
  return HOME;
}
function initialRoot() {
  const envRoot = process.env.CC_ROOT;
  if (envRoot) { try { if (fs.existsSync(envRoot) && fs.statSync(envRoot).isDirectory()) return path.resolve(envRoot); } catch { /* */ } }
  return defaultRoot();
}

// ---------- state ----------
const state = {
  cwd: initialRoot(),
  entries: [],
  dirSel: 0,
  count: 1,
  focus: 'dirs',
  subSel: 0,
  subParents: [],
  status: '',
  statusKind: 'info',
  busy: false,
  sys: null,
  sync: readSync(),
  showHelp: false,   // ? toggles a full-screen plain-English help overlay
};

function loadEntries() {
  let list = [];
  try {
    const names = fs.readdirSync(state.cwd, { withFileTypes: true });
    for (const d of names) {
      let isDir = false;
      try {
        isDir = d.isDirectory();
        if (!isDir && d.isSymbolicLink()) isDir = fs.statSync(path.join(state.cwd, d.name)).isDirectory();
      } catch { isDir = false; }
      list.push({ name: d.name, isDir });
    }
  } catch (e) { list = []; setStatus('Cannot read directory: ' + asciiSafe(e && e.message), 'error'); }
  list.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0);
  });
  state.entries = list;
  if (state.dirSel >= state.entries.length) state.dirSel = Math.max(0, state.entries.length - 1);
  if (state.dirSel < 0) state.dirSel = 0;
}

function setStatus(msg, kind) { state.status = msg || ''; state.statusKind = kind || 'info'; }

// ---------- agents gauges ----------
function readFreshestAgent() {
  let best = null, dirents;
  try { dirents = fs.readdirSync(agentsDir()); } catch { return null; }
  const now = Date.now();
  for (const f of dirents) {
    if (!f.endsWith('.json')) continue;
    let obj;
    try { obj = JSON.parse(fs.readFileSync(path.join(agentsDir(), f), 'utf8').replace(/^﻿/, '')); } catch { continue; }
    const updatedAt = typeof obj.updatedAt === 'number' ? obj.updatedAt : 0;
    const updMs = updatedAt > 1e12 ? updatedAt : updatedAt * 1000;
    if (now - updMs > AGENT_STALE_MS) continue;
    if (!best || updMs > best._updMs) { obj._updMs = updMs; best = obj; }
  }
  return best;
}
function fmtCountdown(resetsAt) {
  if (resetsAt == null) return '';
  const secAt = resetsAt > 1e12 ? Math.floor(resetsAt / 1000) : resetsAt;
  let d = secAt - Math.floor(Date.now() / 1000);
  if (d <= 0) return 'resets now';
  const h = Math.floor(d / 3600); d -= h * 3600;
  const m = Math.floor(d / 60); const s = d - m * 60;
  if (h > 0) return 'resets in ' + h + 'h' + (m < 10 ? '0' : '') + m + 'm';
  if (m > 0) return 'resets in ' + m + 'm' + (s < 10 ? '0' : '') + s + 's';
  return 'resets in ' + s + 's';
}
function relAgo(ms) {
  if (!ms || typeof ms !== 'number') return 'never';
  let d = Math.floor((Date.now() - ms) / 1000);
  if (d < 0) d = 0;
  if (d < 60) return d + 's ago';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
}

// Gauge bar: green fill (red when high), dim-green empty, green brackets. No blue, no fill bg.
function bar(pct, width) {
  if (pct == null || isNaN(pct)) return GREEN + '[' + RESET + DGREEN + '-'.repeat(width) + RESET + GREEN + ']' + RESET;
  let p = Math.max(0, Math.min(100, pct));
  const filled = Math.round((p / 100) * width);
  const fillCol = p >= 85 ? BRED : GREEN;
  return GREEN + '[' + RESET + fillCol + '#'.repeat(filled) + RESET + DGREEN + '-'.repeat(width - filled) + RESET + GREEN + ']' + RESET;
}

// ---------- system stats ----------
let prevCpu = null;
function cpuPercent() {
  const cpus = os.cpus() || [];
  let idle = 0, total = 0;
  for (const c of cpus) { for (const t in c.times) total += c.times[t]; idle += c.times.idle; }
  if (!prevCpu) { prevCpu = { idle, total }; return null; }
  const di = idle - prevCpu.idle, dt = total - prevCpu.total;
  prevCpu = { idle, total };
  if (dt <= 0) return null;
  return Math.max(0, Math.min(100, 100 * (1 - di / dt)));
}
let gpuExe;
function findGpuExe() {
  if (gpuExe !== undefined) return gpuExe;
  const cands = ['nvidia-smi', path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe')];
  for (const c of cands) {
    try { const r = spawnSync(c, ['--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 2500 }); if (!r.error && r.status === 0) { gpuExe = c; return gpuExe; } } catch { /* */ }
  }
  gpuExe = null; return gpuExe;
}
function sampleGpu() {
  const exe = findGpuExe();
  if (!exe) return null;
  try {
    const r = spawnSync(exe, ['--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 2500 });
    if (r.error || r.status !== 0) return null;
    const parts = ((r.stdout || '').trim().split('\n')[0] || '').split(',').map((x) => parseFloat(x.trim()));
    if (parts.length < 3 || isNaN(parts[0])) return null;
    return { util: parts[0], memUsed: parts[1], memTot: parts[2], temp: parts[3] };
  } catch { return null; }
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function two(n) { return (n < 10 ? '0' : '') + n; }
let sysTick = 0, gpuCache = null;
function sampleSystem() {
  const now = new Date();
  const date = {
    pretty: DOW[now.getDay()] + '  ' + MON[now.getMonth()] + ' ' + two(now.getDate()) + ', ' + now.getFullYear(),
    hms: two(now.getHours()) + ':' + two(now.getMinutes()) + ':' + two(now.getSeconds()),
  };
  const cpu = cpuPercent();
  const totMem = os.totalmem(), freeMem = os.freemem();
  const memPct = totMem > 0 ? 100 * (totMem - freeMem) / totMem : null;
  let disk = null;
  try {
    const root = path.parse(defaultRoot()).root || 'C:\\';
    const st = fs.statfsSync(root);
    const tot = st.blocks * st.bsize, free = st.bfree * st.bsize, avail = st.bavail * st.bsize;
    disk = { pct: tot > 0 ? 100 * (tot - free) / tot : null, freeGB: avail / 1e9, totGB: tot / 1e9 };
  } catch { disk = null; }
  if (sysTick % 5 === 0) gpuCache = sampleGpu();
  sysTick++;
  state.sys = { date, cpu, memPct, memUsedGB: (totMem - freeMem) / 1e9, memTotGB: totMem / 1e9, disk, gpu: gpuCache };
}

// ---------- subagents ----------
function scanSubagents() {
  const parents = [];
  let pdirs;
  try { pdirs = fs.readdirSync(subagentsRootDir(), { withFileTypes: true }); } catch { state.subParents = []; if (state.subSel !== 0) state.subSel = 0; return; }
  for (const pd of pdirs) {
    if (!pd.isDirectory()) continue;
    const parentId = pd.name, pdir = path.join(subagentsRootDir(), parentId);
    let files;
    try { files = fs.readdirSync(pdir); } catch { continue; }
    let running = 0, total = 0, lastLabel = '';
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      let obj;
      try { obj = JSON.parse(fs.readFileSync(path.join(pdir, f), 'utf8').replace(/^﻿/, '')); } catch { continue; }
      total++;
      if (obj && obj.status === 'running') { running++; if (obj.label) lastLabel = obj.label; else if (obj.agentType) lastLabel = obj.agentType; }
    }
    if (running > 0) parents.push({ parentId, running, total, label: lastLabel });
  }
  parents.sort((a, b) => (a.parentId < b.parentId ? -1 : 1));
  state.subParents = parents;
  if (state.subSel >= parents.length) state.subSel = Math.max(0, parents.length - 1);
  if (state.subSel < 0) state.subSel = 0;
  // Never let focus rest on an empty subagents list — that is the trap where the
  // arrow keys look "dead" (they ARE working, the list is just empty). Bounce
  // focus back to the folder list so arrows always visibly do something.
  if (parents.length === 0 && state.focus === 'subagents') state.focus = 'dirs';
}

// ---------- actions ----------
function enterDir() {
  const e = state.entries[state.dirSel];
  if (!e || !e.isDir) return;
  const next = path.join(state.cwd, e.name);
  try { if (fs.statSync(next).isDirectory()) { state.cwd = next; state.dirSel = 0; loadEntries(); setStatus('', 'info'); } }
  catch (err) { setStatus('Cannot enter: ' + asciiSafe(err && err.message), 'error'); }
}
function parentDir() {
  const parent = path.dirname(state.cwd);
  if (parent && parent !== state.cwd) {
    const prevBase = path.basename(state.cwd);
    state.cwd = parent; state.dirSel = 0; loadEntries();
    const idx = state.entries.findIndex((x) => x.name === prevBase);
    if (idx >= 0) state.dirSel = idx;
    setStatus('', 'info');
  }
}
function launch() {
  const n = state.count, dir = state.cwd, name = path.basename(dir) || dir;
  const args = ['action', 'new-tab', '--layout', layoutPath(n), '--cwd', dir, '--name', name];
  let res;
  try { res = spawnSync('zellij', args, { encoding: 'utf8' }); }
  catch (e) { setStatus('Launch failed: ' + asciiSafe(e && e.message), 'error'); return; }
  if (res.error) { setStatus(res.error.code === 'ENOENT' ? 'zellij not found on PATH' : 'Launch error: ' + asciiSafe(res.error.message), 'error'); return; }
  if (res.status !== 0) { setStatus('zellij returned error: ' + truncate(asciiSafe((res.stderr || res.stdout || '').toString().trim().split('\n').pop() || ''), 60), 'error'); return; }
  setStatus('Launched ' + n + ' agent' + (n === 1 ? '' : 's') + ' in ' + asciiSafe(name) + ' (switch back with Alt+[ )', 'ok');
}
function gitPush() {
  // Sync EVERYTHING under the projects root (not just the folder you're browsing)
  // so [g] always means "upload all my committed work", matching [c].
  const root = defaultRoot();
  state.busy = true; setStatus('PUSH: uploading committed work to GitHub (newer cloud changes are never overwritten)...', 'info'); render();
  let res;
  try { res = spawnSync('node', [gitPushPath(), root], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }); }
  catch (e) { state.busy = false; setStatus('push failed to spawn: ' + asciiSafe(e && e.message), 'error'); return; }
  state.busy = false;
  if (res.error) { setStatus('push spawn error', 'error'); return; }
  let parsed = null;
  try { parsed = JSON.parse((res.stdout || '').toString().trim()); } catch { parsed = null; }
  if (!parsed || !Array.isArray(parsed.repos)) { setStatus('push: unexpected output', 'error'); return; }
  const pushed = parsed.repos.filter((r) => r.pushed).length;
  const errs = parsed.repos.filter((r) => r.error).length;
  state.sync.lastPushAt = Date.now();
  writeSync({ lastPushAt: state.sync.lastPushAt });
  const blocked = parsed.repos.filter((r) => r.error && /\b(fetch first|non-fast-forward|rejected|behind)\b/i.test(String(r.error))).length;
  let msg = pushed === 0 ? 'PUSH done: nothing new to upload (already up to date)'
    : 'PUSH done: uploaded ' + pushed + ' repo' + (pushed === 1 ? '' : 's') + ' to GitHub';
  if (blocked) msg += '  -  ' + blocked + ' skipped (GitHub has newer changes; press [c] to pull first, nothing was overwritten)';
  else if (errs) msg += '  -  ' + errs + ' error(s)';
  setStatus(msg, (errs && !blocked) ? 'error' : 'ok');
}
function cloneAll() {
  const root = defaultRoot();
  state.busy = true; setStatus('PULL: downloading everything from GitHub (your local work is never deleted)...', 'info'); render();
  let res;
  try { res = spawnSync('node', [cloneAllPath(), root], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }); }
  catch (e) { state.busy = false; setStatus('clone failed to spawn: ' + asciiSafe(e && e.message), 'error'); return; }
  state.busy = false;
  if (res.error) { setStatus('clone spawn error', 'error'); return; }
  let parsed = null;
  try { parsed = JSON.parse((res.stdout || '').toString().trim()); } catch { parsed = null; }
  if (!parsed || !Array.isArray(parsed.repos)) { setStatus('clone: ' + (parsed && parsed.error ? truncate(asciiSafe(parsed.error), 70) : 'unexpected output'), 'error'); return; }
  const cloned = parsed.repos.filter((r) => r.action === 'cloned').length;
  const updated = parsed.repos.filter((r) => r.action === 'updated').length;
  const errs = parsed.repos.filter((r) => r.action === 'error').length;
  state.sync.lastCloneAt = Date.now();
  writeSync({ lastCloneAt: state.sync.lastCloneAt });
  const parts = [];
  if (cloned) parts.push('downloaded ' + cloned + ' new');
  if (updated) parts.push('updated ' + updated);
  const body = parts.length ? parts.join(', ') : 'everything already up to date';
  setStatus('PULL done: ' + body + '  (' + parsed.repos.length + ' repo' + (parsed.repos.length === 1 ? '' : 's') + ' checked)' + (errs ? ', ' + errs + ' error(s)' : ''), errs ? 'error' : 'ok');
}
function openInspector() {
  const p = state.subParents[state.subSel];
  if (!p) { setStatus('No subagent group selected', 'error'); return; }
  const args = ['action', 'new-pane', '--floating', '--close-on-exit', '--', 'node', inspectorPath(), p.parentId];
  let res;
  try { res = spawnSync('zellij', args, { encoding: 'utf8' }); }
  catch (e) { setStatus('Inspector failed: ' + asciiSafe(e && e.message), 'error'); return; }
  if (res.error || res.status !== 0) { setStatus('Could not open inspector', 'error'); return; }
  setStatus('Opened inspector for ' + truncate(asciiSafe(p.parentId), 16), 'ok');
}

// ---------- rendering ----------
function out(s) { process.stdout.write(s); }
function leftRight(leftVisLen, leftColored, rightVisLen, rightColored, W) {
  const gap = Math.max(1, W - leftVisLen - rightVisLen);
  return leftColored + ' '.repeat(gap) + rightColored;
}

function render() {
  const cols = termCols();
  const W = Math.max(54, Math.min(cols, 100));
  if (state.showHelp) { renderHelp(W); return; }
  const lines = [];
  const sep = DGREEN + '-'.repeat(W) + RESET;   // dividers: muted green (not blue)

  const sys = state.sys || {};
  const dt = sys.date || { pretty: '', hms: '' };

  // Header: title left (bright green), day/date/time right (green, not blue).
  const titleL = 'CLAUDE CONTROL CENTER';
  const rightVis = dt.pretty + '   ' + dt.hms;
  lines.push(leftRight(titleL.length, BOLD + BGREEN + titleL + RESET, rightVis.length, GREEN + dt.pretty + RESET + '   ' + BOLD + BGREEN + dt.hms + RESET, W));
  lines.push(sep);

  // BASICS — always-visible, plain-English "how to drive this". This is the
  // single most important thing for someone who has never used the TUI.
  lines.push(' ' + GREEN + 'Use the ' + RESET + BOLD + BGREEN + 'ARROW KEYS' + RESET + GREEN + ':  ' + RESET +
    BOLD + BBLUE + 'Up/Down' + RESET + GREEN + ' move the bar   ' + RESET +
    BOLD + BBLUE + 'Right' + RESET + GREEN + ' open folder   ' + RESET +
    BOLD + BBLUE + 'Left' + RESET + GREEN + ' go back' + RESET);
  lines.push(' ' + BOLD + BBLUE + 'Enter' + RESET + GREEN + ' launch agents here    ' + RESET +
    BOLD + BBLUE + 'g' + RESET + GREEN + ' push to GitHub    ' + RESET +
    BOLD + BBLUE + 'c' + RESET + GREEN + ' pull from GitHub    ' + RESET +
    BOLD + BBLUE + '?' + RESET + GREEN + ' full help' + RESET);
  lines.push(sep);

  // Folder
  lines.push(BOLD + BGREEN + 'Folder ' + RESET + GREEN + truncate(asciiSafe(state.cwd), W - 8) + RESET);

  // Directory — the header doubles as the FOCUS indicator: a reverse-video badge
  // when the arrow keys are controlling this list, dim otherwise. No more guessing
  // where the keys go.
  const dirFocused = state.focus === 'dirs';
  if (dirFocused) lines.push(REV + BOLD + BGREEN + pad(' FOLDERS  - the arrow keys are controlling THIS list', W) + RESET);
  else lines.push('  ' + DGREEN + 'FOLDERS   (press Tab to bring the arrow keys here)' + RESET);
  const totalRows = termRows();
  const navRows = Math.max(3, Math.min(8, totalRows - 34));
  if (state.entries.length === 0) {
    lines.push('    ' + DGREEN + '(this folder has no sub-folders)' + RESET);
  } else {
    let start = 0;
    if (state.dirSel >= navRows) start = state.dirSel - navRows + 1;
    const end = Math.min(state.entries.length, start + navRows);
    for (let i = start; i < end; i++) {
      const e = state.entries[i];
      const sel = (i === state.dirSel && dirFocused);
      const label = (e.isDir ? e.name + '/' : e.name);
      if (sel) {
        // Full-width reverse-video bar = unmistakable "this is selected".
        lines.push(REV + BOLD + BGREEN + pad('  > ' + label, W) + RESET);
      } else {
        const col = e.isDir ? GREEN : DGREEN;
        lines.push('    ' + col + truncate(label, W - 6) + RESET);
      }
    }
    if (end < state.entries.length || start > 0) lines.push('    ' + DGREEN + '(' + (state.dirSel + 1) + ' of ' + state.entries.length + ')' + RESET);
  }
  lines.push(sep);

  // Launch
  const launchName = path.basename(state.cwd) || state.cwd;
  lines.push(hdr('LAUNCH') + '   ' + keyc('Enter') + ' ' + GREEN + 'open a new window of ' + RESET + BOLD + BGREEN + state.count + RESET +
    GREEN + ' agent' + (state.count === 1 ? '' : 's') + ' in ' + RESET + BGREEN + truncate(asciiSafe(launchName), 22) + RESET);
  lines.push('  ' + GREEN + 'count ' + RESET + keyc('1') + GREEN + '..' + RESET + keyc('8') + GREEN + '   add more inside a tab with ' + RESET + keyc('Alt+a'));
  lines.push(sep);

  // Sync — the GitHub buttons. Plain-English, with the safety promise spelled out.
  lines.push(hdr('GITHUB SYNC') + DGREEN + '   (keeps this PC and your other devices in step)' + RESET);
  lines.push('  ' + keyc('g') + ' ' + BOLD + BGREEN + 'PUSH' + RESET + GREEN + ' - upload my committed work' + RESET +
    DGREEN + '  (never overwrites newer cloud changes)' + RESET + '   ' + DGREEN + 'last: ' + RESET + BGREEN + relAgo(state.sync.lastPushAt) + RESET);
  lines.push('  ' + keyc('c') + ' ' + BOLD + BGREEN + 'PULL' + RESET + GREEN + ' - download everything ' + RESET +
    DGREEN + '  (never deletes your local work)' + RESET + '        ' + DGREEN + 'last: ' + RESET + BGREEN + relAgo(state.sync.lastCloneAt) + RESET);
  lines.push(sep);

  // Session limits
  lines.push(hdr('SESSION LIMITS'));
  const a = readFreshestAgent();
  const rl = a && a.rateLimits ? a.rateLimits : null;
  const five = rl && rl.fiveHour ? rl.fiveHour : null;
  const week = rl && rl.sevenDay ? rl.sevenDay : null;
  const barW = 22;
  function gaugeLine(label, gauge) {
    if (!gauge || gauge.usedPct == null) return '  ' + GREEN + pad(label, 7) + RESET + ' ' + bar(null, barW) + '   ' + DGREEN + '--' + RESET;
    const pct = Math.round(gauge.usedPct), cd = fmtCountdown(gauge.resetsAt), col = pct >= 85 ? BRED : GREEN;
    return '  ' + GREEN + pad(label, 7) + RESET + ' ' + bar(gauge.usedPct, barW) + ' ' + col + padLeft(pct + '%', 4) + RESET + (cd ? '  ' + DGREEN + cd + RESET : '');
  }
  lines.push(gaugeLine('5-hour', five));
  lines.push(gaugeLine('Weekly', week));
  if (!a) lines.push('  ' + DGREEN + '(no agent has reported yet -- shows after the first API call)' + RESET);
  lines.push(sep);

  // Subagents
  const subFocused = state.focus === 'subagents';
  if (subFocused) lines.push(REV + BOLD + BGREEN + pad(' SUBAGENTS  - arrow keys are here; Enter inspects, Tab back to Folders', W) + RESET);
  else lines.push('  ' + hdr('SUBAGENTS') + (state.subParents.length ? DGREEN + '   (Tab to inspect)' + RESET : ''));
  if (state.subParents.length === 0) {
    lines.push('    ' + DGREEN + '(none running -- this list fills only when an agent spawns subagents)' + RESET);
  } else {
    for (let i = 0; i < Math.min(state.subParents.length, 3); i++) {
      const p = state.subParents[i], sel = (i === state.subSel && subFocused);
      const text = truncate(asciiSafe(p.parentId), 14) + '  ' + p.running + '/' + p.total + ' running' + (p.label ? '  ' + truncate(asciiSafe(p.label), 26) : '');
      if (sel) lines.push(REV + BOLD + BGREEN + pad('  > ' + text, W) + RESET);
      else lines.push('    ' + GREEN + text + RESET);
    }
  }
  lines.push(sep);

  // System (kept near the bottom — handy, not important)
  lines.push(hdr('SYSTEM'));
  function statLine(label, pct, suffix) {
    const col = (pct != null && pct >= 85) ? BRED : GREEN;
    const pctTxt = pct == null ? ' n/a' : padLeft(Math.round(pct) + '%', 4);
    return '  ' + GREEN + pad(label, 5) + RESET + ' ' + bar(pct, barW) + ' ' + col + pctTxt + RESET + (suffix ? '  ' + DGREEN + suffix + RESET : '');
  }
  lines.push(statLine('CPU', sys.cpu == null ? null : sys.cpu, ''));
  lines.push(statLine('MEM', sys.memPct == null ? null : sys.memPct, sys.memUsedGB != null ? sys.memUsedGB.toFixed(1) + ' / ' + sys.memTotGB.toFixed(1) + ' GB' : ''));
  lines.push(sys.disk ? statLine('DISK', sys.disk.pct, Math.round(sys.disk.freeGB) + ' free / ' + Math.round(sys.disk.totGB) + ' GB') : statLine('DISK', null, ''));
  if (sys.gpu) { const g = sys.gpu; lines.push(statLine('GPU', g.util, (g.memUsed / 1024).toFixed(1) + ' / ' + (g.memTot / 1024).toFixed(1) + ' GB' + (g.temp ? '   ' + g.temp + 'C' : ''))); }
  else lines.push(statLine('GPU', null, 'no nvidia-smi'));
  lines.push(sep);

  // Status line
  if (state.status) {
    let col = GREEN;
    if (state.statusKind === 'error') col = RED;
    else if (state.statusKind === 'ok') col = BGREEN;
    lines.push(col + truncate(asciiSafe(state.status), W - 1) + RESET);
  } else lines.push('');

  // Cheatsheet — the one key reference. Blue keys + blue | separators (separation
  // matters here); green labels/descriptions. Press ? for the full plain-English help.
  const C = BBLUE + ' | ' + RESET;
  lines.push(sep);
  lines.push(BOLD + BGREEN + pad('MOVE', 7) + RESET + keyc('Up') + keyc('Dn') + GREEN + ' move bar' + RESET + C + keyc('->') + GREEN + ' open folder' + RESET + C + keyc('<-') + GREEN + ' back' + RESET + C + keyc('Tab') + GREEN + ' switch list' + RESET);
  lines.push(BOLD + BGREEN + pad('DO', 7) + RESET + keyc('1') + GREEN + '-' + RESET + keyc('8') + GREEN + ' #agents' + RESET + C + keyc('Enter') + GREEN + ' launch' + RESET + C + keyc('g') + GREEN + ' push' + RESET + C + keyc('c') + GREEN + ' pull' + RESET + C + keyc('?') + GREEN + ' help' + RESET + C + keyc('q') + GREEN + ' quit' + RESET);
  lines.push(BOLD + BGREEN + pad('WINDOW', 7) + RESET + BOLD + BBLUE + 'Alt+[ Alt+]' + RESET + GREEN + ' switch window' + RESET + C + keyc('Alt+a') + GREEN + ' add agent' + RESET + C + keyc('Ctrl+Alt+w') + GREEN + ' close' + RESET + C + keyc('Ctrl+g') + GREEN + ' lock' + RESET);

  // Differential frame: home cursor, clear each line to EOL, clear below at the
  // end. No full-screen [2J -> no flicker when keys repeat.
  const body = lines.map((l) => l + CLR_EOL).join('\r\n');
  out(HOME_POS + body + '\r\n' + CLR_BELOW);
}

// Full-screen plain-English help. Toggled with ? ; any key closes it.
function renderHelp(W) {
  const sep = DGREEN + '-'.repeat(W) + RESET;
  const L = [];
  const k = (s) => BOLD + BBLUE + s + RESET;
  const h = (s) => BOLD + BGREEN + s + RESET;
  const g = (s) => GREEN + s + RESET;
  L.push(h('HOW TO USE THE CLAUDE CONTROL CENTER') + DGREEN + '    (press any key to close this help)' + RESET);
  L.push(sep);
  L.push(h('1. The very basics'));
  L.push('   ' + g('The green bar shows what is selected. Move it with the ') + k('Up') + g(' and ') + k('Down') + g(' arrow keys.'));
  L.push('   ' + g('A bright reversed bar near the top tells you which list the arrows control.'));
  L.push('   ' + g('If a list looks "dead", the arrows are on the OTHER list -- press ') + k('Tab') + g(' to switch.'));
  L.push('');
  L.push(h('2. Moving around your folders'));
  L.push('   ' + k('Up') + ' / ' + k('Down') + g('   move the selection bar up and down'));
  L.push('   ' + k('Right') + g(' (or ') + k('l') + g(')   open the highlighted folder (go INTO it)'));
  L.push('   ' + k('Left') + g('  (or ') + k('h') + g(')   go back OUT to the parent folder'));
  L.push('');
  L.push(h('3. Launching Claude agents'));
  L.push('   ' + g('Press a number ') + k('1') + g('-') + k('8') + g(' to choose how many agents, then press ') + k('Enter') + g('.'));
  L.push('   ' + g('They open in a new window (tab) that runs in the folder you have selected.'));
  L.push('   ' + g('Switch between windows with ') + k('Alt+[') + g(' and ') + k('Alt+]') + g('.'));
  L.push('');
  L.push(h('4. GitHub sync  (keeps all your devices in step)'));
  L.push('   ' + k('g') + g(' = ') + h('PUSH') + g(': uploads your committed work to GitHub.'));
  L.push('       ' + DGREEN + 'If another device already pushed newer work, yours is skipped, NOT overwritten.' + RESET);
  L.push('       ' + DGREEN + '(If that happens, press c to pull first, then g again.)' + RESET);
  L.push('   ' + k('c') + g(' = ') + h('PULL') + g(': downloads everything from GitHub and brings repos up to date.'));
  L.push('       ' + DGREEN + 'Your local commits and unsaved changes are never deleted.' + RESET);
  L.push('');
  L.push(h('5. Quitting'));
  L.push('   ' + k('q') + g(' closes this dashboard. Your agent windows keep running.'));
  L.push(sep);
  L.push(BOLD + BGREEN + 'Press any key to go back.' + RESET);
  const body = L.map((l) => l + CLR_EOL).join('\r\n');
  out(HOME_POS + body + '\r\n' + CLR_BELOW);
}

function redraw() { scanSubagents(); render(); }

// ---------- input (manual byte-stream parser) ----------
function act(name, ch) {
  // While the help overlay is up, ANY key just closes it (and does nothing else).
  if (state.showHelp) { state.showHelp = false; setStatus('', 'info'); redraw(); return; }
  if (name === 'quit') { cleanupAndExit(0); return; }
  if (name === 'enter') { if (state.focus === 'dirs') launch(); else openInspector(); redraw(); return; }
  if (name === 'tab') {
    // Only hand the arrows to the subagents list when there is actually something
    // there. Otherwise the keys would look dead — the exact confusing trap.
    if (state.focus === 'dirs') {
      if (state.subParents.length > 0) state.focus = 'subagents';
      else setStatus('No subagents are running right now -- the arrow keys stay on your folders.', 'info');
    } else state.focus = 'dirs';
    redraw(); return;
  }
  if (name === 'up') { if (state.focus === 'dirs') { if (state.dirSel > 0) state.dirSel--; } else { if (state.subSel > 0) state.subSel--; } redraw(); return; }
  if (name === 'down') { if (state.focus === 'dirs') { if (state.dirSel < state.entries.length - 1) state.dirSel++; } else { if (state.subSel < state.subParents.length - 1) state.subSel++; } redraw(); return; }
  if (name === 'right') { if (state.focus === 'dirs') enterDir(); redraw(); return; }
  if (name === 'left') { if (state.focus === 'dirs') parentDir(); redraw(); return; }
  if (ch != null) onPrintable(ch);
}
function onPrintable(ch) {
  if (/[1-8]/.test(ch)) { state.count = parseInt(ch, 10); setStatus('', 'info'); redraw(); return; }
  if (ch === '+' || ch === '=') { state.count = Math.min(8, state.count + 1); redraw(); return; }
  if (ch === '-' || ch === '_') { state.count = Math.max(1, state.count - 1); redraw(); return; }
  if (ch === 'c') { cloneAll(); redraw(); return; }
  if (ch === 'g') { gitPush(); redraw(); return; }
  if (ch === '?') { state.showHelp = true; redraw(); return; }
  if (ch === 'q') { cleanupAndExit(0); return; }
  if (ch === 'k') { act('up'); return; }
  if (ch === 'j') { act('down'); return; }
  if (ch === 'h') { act('left'); return; }
  if (ch === 'l') { act('right'); return; }
  // Unbound key: do nothing (no redraw -> holding it never flickers).
}

let inbuf = '';
let escFlushTimer = null;
function clearEscFlush() { if (escFlushTimer) { clearTimeout(escFlushTimer); escFlushTimer = null; } }
function dispatchOne() {
  if (!inbuf.length) return false;
  const c0 = inbuf.charCodeAt(0);
  if (c0 === 0x1b) {
    const m = inbuf.match(/^\x1b(\[|O)[0-9;]*([A-Za-z~])/);
    if (m) {
      const map = { A: 'up', B: 'down', C: 'right', D: 'left' };
      const action = map[m[2]];
      inbuf = inbuf.slice(m[0].length);
      if (action) act(action, null);
      return true;
    }
    if (inbuf.length <= 2) return false; // partial escape — wait for more
    inbuf = inbuf.slice(1);              // garbled escape — drop ESC
    return true;
  }
  const ch = inbuf[0];
  inbuf = inbuf.slice(1);
  if (c0 === 0x03) { act('quit'); return true; }
  if (c0 === 0x0d || c0 === 0x0a) { act('enter'); return true; }
  if (c0 === 0x09) { act('tab'); return true; }
  if (c0 < 0x20 || c0 === 0x7f) return true; // ignore other control bytes
  act(null, ch);
  return true;
}
function feed(chunk) {
  clearEscFlush();
  inbuf += Buffer.isBuffer(chunk) ? chunk.toString('latin1') : String(chunk);
  let safety = 0;
  while (inbuf.length && dispatchOne()) { if (++safety > 4096) { inbuf = ''; break; } }
  if (inbuf.length && inbuf.charCodeAt(0) === 0x1b) {
    escFlushTimer = setTimeout(() => {
      if (inbuf.length && inbuf.charCodeAt(0) === 0x1b) { inbuf = inbuf.slice(1); let s = 0; while (inbuf.length && dispatchOne()) { if (++s > 4096) { inbuf = ''; break; } } }
    }, 60);
  }
}

// ---------- lifecycle ----------
let timer = null, cleanedUp = false;
function cleanupAndExit(code) {
  if (cleanedUp) { process.exit(code); return; }
  cleanedUp = true;
  try { if (timer) clearInterval(timer); } catch { /* */ }
  try { clearEscFlush(); } catch { /* */ }
  try { if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(false); } catch { /* */ }
  try { out(CURSOR_SHOW + ALT_OFF); } catch { /* */ }
  try { process.stdin.pause(); } catch { /* */ }
  process.exit(code == null ? 0 : code);
}
function tick() { try { sampleSystem(); } catch { /* */ } try { state.sync = readSync(); } catch { /* */ } redraw(); }

function main() {
  ensureStateRoot();
  loadEntries();
  out(ALT_ON + CURSOR_HIDE + ESC + '[2J' + HOME_POS);
  try { if (typeof process.stdin.setRawMode === 'function') process.stdin.setRawMode(true); } catch { /* */ }
  try { process.stdin.resume(); } catch { /* */ }
  process.stdin.on('data', (chunk) => { try { feed(chunk); } catch (e) { setStatus('input error: ' + asciiSafe(e && e.message), 'error'); try { redraw(); } catch { /* */ } } });
  process.stdin.on('error', () => { /* ignore */ });
  process.on('SIGINT', () => cleanupAndExit(0));
  process.on('SIGTERM', () => cleanupAndExit(0));
  process.stdout.on('resize', () => { try { redraw(); } catch { /* */ } });
  try { cpuPercent(); } catch { /* */ }
  sampleSystem();
  redraw();
  // System stats refresh on the 1s timer only (not on keypress) so values are
  // stable and holding a key can't make CPU/MEM jitter.
  timer = setInterval(tick, 1000);
}

main();
