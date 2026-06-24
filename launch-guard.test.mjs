#!/usr/bin/env node
// Regression test for the fork-bomb guard on launch().
//
// History: launch() spawned up to 8 `claude` panes per Enter with no limiter. A
// burst of synthetic Enter events (stuck key / mis-parsed terminal reply) once
// spawned "a million" Claude instances and crashed the machine. checkLaunchAllowed
// is the pure brake that makes that impossible: a rate limit plus an absolute cap.
//
// Run: node launch-guard.test.mjs   (zero deps; exits non-zero on failure)

import { checkLaunchAllowed, LAUNCH_MIN_INTERVAL_MS, MAX_SESSION_PANES } from './home.mjs';

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('  ok   ' + name); }
  else { console.log('  FAIL ' + name); failures++; }
}

// Use realistic clock values (Date.now()-scale); lastAt starts at 0 so the first
// launch is always far past the interval and allowed.
const T0 = 1_000_000_000;

// ---- rate limit ----
{
  const st = { lastAt: 0, panes: 0 };
  check('first launch allowed', checkLaunchAllowed(T0, 4, st).ok === true);
  st.lastAt = T0; st.panes = 4;
  const fast = checkLaunchAllowed(T0 + 100, 1, st);
  check('rapid second launch blocked (too-fast)', fast.ok === false && fast.reason === 'too-fast');
  check('launch after the interval is allowed again',
    checkLaunchAllowed(T0 + LAUNCH_MIN_INTERVAL_MS + 1, 1, st).ok === true);
}

// ---- absolute cap ----
{
  const st = { lastAt: 0, panes: MAX_SESSION_PANES - 2 };
  check('a launch within the cap is allowed', checkLaunchAllowed(T0, 2, st).ok === true);
  const over = checkLaunchAllowed(T0, 3, st);
  check('a launch over the cap is blocked', over.ok === false && over.reason === 'cap');
}

// ---- the fork-bomb itself: 100000 Enters in a tight burst spawn essentially nothing ----
{
  const st = { lastAt: 0, panes: 0 };
  let allowed = 0;
  let t = T0;
  for (let i = 0; i < 100000; i++) {
    const g = checkLaunchAllowed(t, 8, st);
    if (g.ok) { allowed++; st.lastAt = t; st.panes += 8; }
    t += 1;                                  // 1ms between synthetic Enters (a flood)
  }
  // Across a ~100s flood: bounded by BOTH brakes. The cap (24 panes / 8 per launch)
  // dominates here -> at most 3 launches ever fire.
  check('100k rapid Enters never run away (<= cap allows)', allowed <= MAX_SESSION_PANES / 8);
  check('100k rapid Enters never exceed the pane cap', st.panes <= MAX_SESSION_PANES);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
