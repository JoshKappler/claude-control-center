#!/usr/bin/env node
// Unit tests for tabbar.mjs — the tab strip that replaced `zellij:tab-bar`.
//
// The two things worth pinning are pure functions, so no terminal and no zellij
// session are needed:
//   parseTabs()  — reads zellij's live session-metadata.kdl (name/position/active
//                  and the STABLE tab_id that close-tab-by-id needs).
//   layout()     — where each pill and each ✕ sits, in 1-based screen columns, so a
//                  mouse click can be resolved back to a tab.
//
// Run: node tabbar.test.mjs   (zero deps; exits non-zero on failure)

import { parseTabs, layout, resolveClick } from './tabbar.mjs';

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok   ' + name);
  else { console.log('  FAIL ' + name + (extra ? '  [' + extra + ']' : '')); failures++; }
}

// Verbatim shape of zellij 0.44's session-metadata.kdl. Note that tab_id is NOT the
// position — closing by position would close the wrong window after a tab is removed.
const KDL = `name "claude-cc"
tabs {
    tab {
        position 0
        name "Home"
        active true
        panes_to_hide 0
        tab_id 0
    }
    tab {
        position 1
        name "jobhunt"
        active false
        panes_to_hide 0
        tab_id 2
    }
    tab {
        position 2
        name "memo-engine"
        active false
        panes_to_hide 0
        tab_id 4
    }
}
panes {
    pane {
        title "cmd.exe"
    }
}
`;

console.log('parseTabs reads zellij session metadata:');
const tabs = parseTabs(KDL);
check('finds every tab', tabs.length === 3, `${tabs.length} tabs`);
check('reads names', tabs.map((t) => t.name).join(',') === 'Home,jobhunt,memo-engine');
check('reads the stable tab_id (not the position)', tabs.map((t) => t.id).join(',') === '0,2,4');
check('marks exactly one tab active', tabs.filter((t) => t.active).length === 1);
check('the active tab is Home', tabs.find((t) => t.active).name === 'Home');
check('ignores the panes{} section', !tabs.some((t) => t.name === 'cmd.exe'));
check('tabs come back in position order', tabs.every((t, i) => t.position === i));

console.log('\nparseTabs is defensive:');
check('empty input yields no tabs', parseTabs('').length === 0);
check('garbage yields no tabs', parseTabs('not kdl at all {{{').length === 0);

console.log('\nlayout places the pills and the close targets:');
const { segs, hidden } = layout(tabs, 120);
check('all three pills fit at width 120', segs.length === 3 && hidden === 0);
check('pills do not overlap', segs.every((s, i) => i === 0 || s.start > segs[i - 1].end));
check('first pill starts at column 1', segs[0].start === 1);

// Home is the dashboard. Closing it is unrecoverable, so it gets no ✕ at all.
check('Home has NO close target', segs[0].closeCol === null);
check('every other tab has a close target', segs.slice(1).every((s) => s.closeCol != null));

// The recorded close column must land on the glyph itself, or a click misses.
for (const s of segs.slice(1)) {
  const idx = s.closeCol - (s.start + 1);      // index into the label
  check(`✕ for "${s.tab.name}" sits at its recorded column`, s.label[idx] === '✕', `label[${idx}]=${JSON.stringify(s.label[idx])}`);
}

// A click anywhere on a pill that is not the ✕ must resolve to "switch to this tab".
const jobhunt = segs[1];
const hitAt = (col) => segs.find((s) => col >= s.start && col <= s.end);
check('a click on the jobhunt label hits jobhunt', hitAt(jobhunt.start + 2) === jobhunt);
check('a click on the jobhunt cap hits jobhunt', hitAt(jobhunt.start) === jobhunt);
// The gap between pills belongs to no tab — a click there must do nothing, not
// close whichever pill happens to be adjacent.
check('the gap between pills hits nothing', hitAt(jobhunt.start - 1) === undefined);
check('the ✕ column is inside the jobhunt pill', jobhunt.closeCol > jobhunt.start && jobhunt.closeCol < jobhunt.end);
check('pills are separated by a gap', segs[1].start === segs[0].end + 1 + 1);

console.log('\nresolveClick maps a click column to the right action:');
const memo = segs[2];
check('clicking the ✕ closes that tab', resolveClick(segs, jobhunt.closeCol).action === 'close');
check('clicking one past the ✕ still closes (forgiving target)', resolveClick(segs, jobhunt.closeCol + 1).action === 'close');
check('clicking the ✕ resolves to the RIGHT tab', resolveClick(segs, memo.closeCol).tab.name === 'memo-engine');
check('clicking a label switches to that tab', resolveClick(segs, jobhunt.start + 2).action === 'switch');
check('switching resolves to the right tab', resolveClick(segs, memo.start + 2).tab.name === 'memo-engine');
// Home is active and has no ✕: clicking it must do nothing at all.
check('clicking the active Home pill does nothing', resolveClick(segs, segs[0].start + 2).action === null);
check('Home can never be closed by a click', segs[0].closeCol === null && resolveClick(segs, segs[0].end).action === null);
check('clicking the gap does nothing', resolveClick(segs, jobhunt.start - 1).action === null);
check('clicking past the last pill does nothing', resolveClick(segs, memo.end + 5).action === null);

console.log('\nlayout degrades gracefully on a narrow strip:');
const narrow = layout(tabs, 20);
check('drops tabs that do not fit', narrow.segs.length < 3);
check('reports how many are hidden', narrow.hidden === 3 - narrow.segs.length, `hidden=${narrow.hidden}`);
check('never draws past the edge', narrow.segs.every((s) => s.end <= 20));
const tiny = layout(tabs, 3);
check('a strip too small for even one tab draws nothing', tiny.segs.length === 0 && tiny.hidden === 3);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
