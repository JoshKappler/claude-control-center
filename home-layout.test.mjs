#!/usr/bin/env node
// Tests for the static Home-tab layout (workspace/zellij/layouts/cc-default.kdl).
//
// Regression guard for the "switching to Home hides every other tab" bug. Zellij
// renders the tab strip PER TAB: a tab without a `zellij:tab-bar` pane shows no
// strip at all while it is focused. Home used to omit the strip, so focusing Home
// made all the open agent tabs look closed — they only "reappeared" once focus
// landed on a tab that HAD a bar (e.g. a freshly launched agent tab). The Home tab
// must carry the same tab strip the agent tabs do, so open tabs are always visible.
//
// Run: node home-layout.test.mjs   (zero deps; exits non-zero on failure)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.dirname(fileURLToPath(import.meta.url));
const kdl = fs.readFileSync(path.join(APP, 'workspace', 'zellij', 'layouts', 'cc-default.kdl'), 'utf8');

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('  ok   ' + name); }
  else { console.log('  FAIL ' + name); failures++; }
}

check('Home layout defines the Home tab', /tab\s+name="Home"/.test(kdl));
// Supervised, not bare: a bare `home.mjs` pane is the bug — when it exits zellij
// drops `command=` from the serialized tab and Home never comes back.
check('Home tab runs the Home dashboard under its supervisor', kdl.includes('home-pane.mjs'));
// The fix: Home carries the tab strip so open tabs stay visible when Home is focused.
check('Home tab includes the tab strip (tabbar.mjs)', kdl.includes('tabbar.mjs'));
// Match the directive, not the word: the file's comments still name the plugin they
// explain the replacement of.
check('Home tab no longer uses the chevron plugin', !/plugin\s+location="zellij:tab-bar"/.test(kdl));

if (failures) { console.log('\n' + failures + ' FAILURE(S)'); process.exit(1); }
console.log('\nALL PASS');
