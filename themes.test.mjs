#!/usr/bin/env node
// Tests for themes.mjs — the pure parts: the theme table itself, cycling, the SGR
// palette, and the two generated artifacts (zellij component KDL + wezterm lua).
//
// Run: node themes.test.mjs   (zero deps; exits non-zero on failure)

import { THEMES, nextTheme, tuiSgr, zellijThemeKdl, weztermThemeLua } from './themes.mjs';

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); failures++; }
}

// --- The table: enough themes to be worth a cycle key, unique ids, complete slots ---
check('at least 6 themes', THEMES.length >= 6);
check('theme ids are unique', new Set(THEMES.map((t) => t.id)).size === THEMES.length);
check('homebrew is the default (first)', THEMES[0].id === 'homebrew');
for (const t of THEMES) {
  check(`"${t.id}" has label + wezterm scheme`, !!t.label && !!t.wezterm);
  check(`"${t.id}" has all five tui roles`,
    ['text', 'bright', 'dim', 'key', 'alert', 'alertBright'].every((k) => typeof t.tui[k] === 'string' && t.tui[k].length > 0));
  check(`"${t.id}" has all zellij colors as RGB triples`,
    ['bg', 'fg', 'dim', 'strong', 'accent'].every((k) =>
      Array.isArray(t.zellij[k]) && t.zellij[k].length === 3 && t.zellij[k].every((v) => v >= 0 && v <= 255)));
}

// --- Cycling: next moves forward, wraps, and an unknown id lands somewhere valid ---
check('nextTheme moves to the second theme', nextTheme(THEMES[0].id).id === THEMES[1].id);
check('nextTheme wraps around', nextTheme(THEMES[THEMES.length - 1].id).id === THEMES[0].id);
check('nextTheme tolerates an unknown id', !!nextTheme('no-such-theme'));

// --- SGR palette: real escape sequences for every role ---
const sgrOk = (s) => /^\x1b\[[0-9;]+m$/.test(s);
for (const t of THEMES) {
  const p = tuiSgr(t);
  check(`tuiSgr("${t.id}") yields printable escapes`,
    ['TEXT', 'BRIGHT', 'DIM', 'KEY', 'ALERT', 'ALERTBRIGHT'].every((k) => sgrOk(p[k])));
}

// --- Zellij KDL: named "cc", one block per component zellij 0.42+ wants, balanced braces ---
for (const t of THEMES) {
  const kdl = zellijThemeKdl(t);
  check(`zellij kdl("${t.id}") defines the "cc" theme`, /themes\s*\{\s*\n\s*cc\s*\{/.test(kdl));
  for (const comp of ['text_unselected', 'text_selected', 'ribbon_unselected', 'ribbon_selected',
    'frame_unselected', 'frame_selected', 'frame_highlight', 'exit_code_success', 'exit_code_error',
    'table_title', 'table_cell_unselected', 'table_cell_selected', 'list_unselected', 'list_selected',
    'multiplayer_user_colors']) {
    check(`zellij kdl("${t.id}") has ${comp}`, kdl.includes(comp + ' {'));
  }
  const open = (kdl.match(/\{/g) || []).length, close = (kdl.match(/\}/g) || []).length;
  check(`zellij kdl("${t.id}") braces balance`, open === close, `${open} vs ${close}`);
  check(`zellij kdl("${t.id}") active ribbon is the theme's strong color on its bg text`,
    kdl.includes(`background ${t.zellij.strong.join(' ')}`));
}

// --- WezTerm hand-off: a loadable lua table naming the scheme ---
for (const t of THEMES) {
  const lua = weztermThemeLua(t);
  check(`wezterm lua("${t.id}") returns its scheme`, lua.includes(`return { scheme = '${t.wezterm}' }`));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
