#!/usr/bin/env node
// install.mjs — deploy this repo's workspace/ config to the OS paths each tool
// reads from. This REPLACES chezmoi: one repo, one command. Cross-platform
// (Windows + macOS), zero npm deps. Run after `git pull` on any machine:
//
//     node install.mjs
//
// It never destroys data: every file it overwrites is first copied to
// <file>.pre-install.bak (only if no backup exists yet), so the pre-migration
// state is always recoverable. Self-locating — works wherever the repo is cloned.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { currentTheme, zellijThemeKdl, writeWeztermTheme } from './themes.mjs';

const APP = path.dirname(fileURLToPath(import.meta.url));
const APP_FWD = APP.replace(/\\/g, '/');
const HOME = os.homedir();
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const WS = path.join(APP, 'workspace');

// ---- token rendering -------------------------------------------------------
function pwshProg() {
  const has = spawnSync('where', ['pwsh'], { encoding: 'utf8' });
  const exe = (!has.error && has.status === 0) ? 'pwsh.exe' : 'powershell.exe';
  return `config.default_prog = { '${exe}', '-NoLogo' }`;
}
function render(text) {
  return text
    .split('{{APP}}').join(APP_FWD)
    .split('{{FONT_SIZE}}').join(MAC ? '14.0' : '11.0')
    .split('{{WIN_DEFAULT_PROG}}').join(WIN ? pwshProg() : '')
    .split('{{COPY_COMMAND}}').join(MAC ? 'copy_command "pbcopy"' : '// (no copy_command on Windows: WezTerm handles OSC52 copy natively)')
    .split('{{ZELLIJ_THEMES}}').join(zellijThemeKdl(currentTheme()));
}

// ---- fs helpers ------------------------------------------------------------
let wrote = 0, backedUp = 0;
function backup(dst) {
  const bak = dst + '.pre-install.bak';
  if (fs.existsSync(dst) && !fs.existsSync(bak)) { fs.copyFileSync(dst, bak); backedUp++; }
}
function deployFile(src, dst, doRender) {
  if (!fs.existsSync(src)) { console.log('  skip (missing):', path.relative(APP, src)); return; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  backup(dst);
  let data = fs.readFileSync(src);
  if (doRender) data = Buffer.from(render(data.toString('utf8')), 'utf8');
  fs.writeFileSync(dst, data);
  wrote++;
  console.log('  ->', dst);
}
function deployDir(srcDir, dstDir, doRender) {
  if (!fs.existsSync(srcDir)) { console.log('  skip (missing dir):', path.relative(APP, srcDir)); return; }
  for (const name of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, name), d = path.join(dstDir, name);
    if (fs.statSync(s).isDirectory()) deployDir(s, d, doRender);
    else deployFile(s, d, doRender);
  }
}

// ---- destination paths -----------------------------------------------------
const cfg = path.join(HOME, '.config');
const claudeDir = path.join(HOME, '.claude');
const ccState = path.join(HOME, '.local', 'share', 'claude-cc');
const appdata = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const macEspanso = path.join(HOME, 'Library', 'Application Support', 'espanso');

function installStartupShortcut() {
  // Point the per-user Startup shortcut at the repo's AHK launcher so Ctrl+Alt+C
  // works after login. Idempotent (overwrites the .lnk). Non-fatal on failure.
  const ahk = path.join(WS, 'windows', 'claude-cc.ahk');
  const startup = path.join(appdata, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const lnk = path.join(startup, 'claude-cc.lnk');
  fs.mkdirSync(startup, { recursive: true });
  const ps = `$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut('${lnk}'); $s.TargetPath='${ahk}'; $s.WorkingDirectory='${path.dirname(ahk)}'; $s.Save()`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
  if (r.error || r.status !== 0) console.log('  ! Startup shortcut not created:', String(r.stderr || r.error || '').trim());
  else console.log('  -> Startup shortcut ->', ahk);
}

// ---- deploy ----------------------------------------------------------------
console.log(`install.mjs — deploying from ${APP_FWD}  (platform: ${process.platform})\n`);

console.log('zellij + wezterm:');
deployFile(path.join(WS, 'zellij', 'config.kdl'), path.join(cfg, 'zellij', 'config.kdl'), true);
deployFile(path.join(WS, 'zellij', 'layouts', 'cc-default.kdl'), path.join(cfg, 'zellij', 'layouts', 'cc-default.kdl'), true);
deployFile(path.join(WS, 'wezterm', 'wezterm.lua'), path.join(cfg, 'wezterm', 'wezterm.lua'), true);
// The machine's chosen theme, in the shape wezterm.lua watches for. Written on
// every install so a fresh machine starts colored and a theme switch sticks.
writeWeztermTheme(currentTheme());
console.log('  ->', path.join(cfg, 'wezterm', 'cc-theme.lua'), '(theme: ' + currentTheme().label + ')');

console.log('claude (global settings, instructions, commands):');
deployFile(path.join(WS, 'claude', 'settings.json'), path.join(claudeDir, 'settings.json'), false);
deployFile(path.join(WS, 'claude', 'CLAUDE.md'), path.join(claudeDir, 'CLAUDE.md'), false);
deployDir(path.join(WS, 'claude', 'commands'), path.join(claudeDir, 'commands'), false);

console.log('always-on hooks + statusline (referenced by settings.json):');
deployFile(path.join(APP, 'statusline.mjs'), path.join(ccState, 'statusline.mjs'), false);
deployFile(path.join(APP, 'themes.mjs'), path.join(ccState, 'themes.mjs'), false);   // statusline.mjs imports it
deployDir(path.join(APP, 'hooks'), path.join(ccState, 'hooks'), false);

if (WIN) {
  console.log('helix + espanso (Windows paths):');
  deployDir(path.join(WS, 'helix'), path.join(appdata, 'helix'), false);
  deployFile(path.join(WS, 'espanso', 'config', 'default.yml'), path.join(appdata, 'espanso', 'config', 'default.yml'), false);
  deployFile(path.join(WS, 'espanso', 'match', 'prompts.yml'), path.join(appdata, 'espanso', 'match', 'prompts.yml'), false);
  console.log('windows launcher:');
  installStartupShortcut();
} else {
  console.log('helix + espanso + hammerspoon (macOS paths):');
  deployDir(path.join(WS, 'helix'), path.join(cfg, 'helix'), false);
  deployFile(path.join(WS, 'espanso', 'config', 'default.yml'), path.join(macEspanso, 'config', 'default.yml'), false);
  deployFile(path.join(WS, 'espanso', 'match', 'prompts.yml'), path.join(macEspanso, 'match', 'prompts.yml'), false);
  deployFile(path.join(WS, 'hammerspoon', 'init.lua'), path.join(HOME, '.hammerspoon', 'init.lua'), false);
}

console.log(`\nDone. ${wrote} file(s) deployed, ${backedUp} backed up (*.pre-install.bak).`);
console.log('Zellij config (keybinds/layout) applies to NEW sessions only. A running');
console.log('claude-cc session keeps its old config until you deliberately end it:');
console.log('close its tabs (Ctrl+Alt+Q), or `zellij delete-session claude-cc --force`,');
console.log('then reopen with Ctrl+Alt+C. Never kill it while agents are mid-task.');
