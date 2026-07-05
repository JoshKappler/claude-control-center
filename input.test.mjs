#!/usr/bin/env node
// Regression test for the "blank screen on launch" bug.
//
// Terminals answer queries (primary device attributes, OSC color reports, …) by
// writing the RESPONSE BYTES onto the program's stdin. A burst of these arrives
// the instant we switch to raw mode. They are NOT keystrokes. The old parser
// stripped the leading ESC of anything it didn't recognise and replayed the rest
// as printable keys, so a color report like `…rgb:6262/…` fired 'g' (PUSH) and a
// device-attributes reply `ESC[?1;2c` fired 'c' (PULL). Both run synchronously and
// froze the UI on a blank screen. This test pins that behaviour shut.
//
// Run: node input.test.mjs   (zero deps; exits non-zero on failure)

import { decodeInput, isReportNoise, feed, __setDispatch, __acceptInputNow, __resetInput, __getState } from './home.mjs';

let failures = 0;
function check(name, cond) {
  if (cond) { console.log('  ok   ' + name); }
  else { console.log('  FAIL ' + name); failures++; }
}

// ---- decodeInput: terminal reports must produce NO key events ----
const DA = '\x1b[?1;2c';                                   // primary device attributes
const OSC_FG = '\x1b]10;rgb:33ff/33ff/33ff\x1b\\';          // OSC color report (ST-terminated)
const OSC_BG = '\x1b]11;rgb:0000/0000/0000\x07';            // OSC color report (BEL-terminated)
const DCS = '\x1bP1$r0m\x1b\\';                              // DCS string

for (const [label, seq] of [['DA reply', DA], ['OSC fg', OSC_FG], ['OSC bg', OSC_BG], ['DCS', DCS]]) {
  const { events, rest } = decodeInput(seq);
  check(`${label} yields zero key events`, events.length === 0);
  check(`${label} is fully consumed`, rest === '');
}

// A color report contains the literal letters r,g,b,c — none may leak as chars.
const { events: reportEvents } = decodeInput('\x1b]4;232;rgb:0808/0808/0808\x1b\\');
check('no char event leaks from a color report',
  !reportEvents.some((e) => e.kind === 'char'));

// ---- real keys must still decode ----
check('arrow up still decodes', decodeInput('\x1b[A').events.some((e) => e.kind === 'arrow' && e.dir === 'up'));
check('ctrl+arrow (modifier) still decodes', decodeInput('\x1b[1;5C').events.some((e) => e.kind === 'arrow' && e.dir === 'right'));
check('SS3 arrow still decodes', decodeInput('\x1bOB').events.some((e) => e.kind === 'arrow' && e.dir === 'down'));
{
  const { events } = decodeInput('g');
  check("plain 'g' still decodes as a char", events.length === 1 && events[0].kind === 'char' && events[0].ch === 'g');
}

// ---- the startup burst must be swallowed by feed() (drain window) ----
// The real captured burst is header-less `rgb:` fragments separated by ST; those
// bare bytes cannot be told apart from typed keys, so feed() drops ALL input until
// the stream settles. While the drain is active, nothing may be dispatched.
const dispatched = [];
__setDispatch((ev) => dispatched.push(ev));
__resetInput();                                            // acceptInput = false (fresh launch)
const REAL_BURST = 'rgb:d7d7/8787/ffff\x1b\\d7d7/d7d7/8787\x1b\\\x1b]11;rgb:0000/0000/0000\x1b\\bcbc/bcbc/bcbc\x1b\\';
feed(Buffer.from(REAL_BURST, 'latin1'));
check('startup burst dispatches nothing (no push/pull)', dispatched.length === 0);

// ---- after the drain settles, real keystrokes get through ----
__acceptInputNow();
feed(Buffer.from('g', 'latin1'));
check("a real 'g' after settle IS dispatched", dispatched.some((e) => e.kind === 'char' && e.ch === 'g'));

// ---- MID-SESSION noise rejection (the startup drain never re-armed) ----
// A header-less report fragment that arrives in the MIDDLE of a session used to sail
// straight through as printable keys: a bare digit reset the agent count, a bare
// `g`/`c` fired a blocking git op that froze the single-threaded UI. These pin the
// always-on guard shut.

// The classifier is a pure function — unit-test it directly (a lone key never matches).
check('classifier: rgb: tag is noise', isReportNoise('rgb:8888/ffff/0000') === true);
check('classifier: rgba: tag is noise', isReportNoise('rgba:12/34/56/78') === true);
check('classifier: hex groups + separators are noise', isReportNoise('8888/ffff') === true);
check('classifier: a bare multi-digit hex run is noise', isReportNoise('d7d7') === true);
check('classifier: lone digit is NOT noise', isReportNoise('5') === false);
check('classifier: lone command key is NOT noise', isReportNoise('g') === false);
check('classifier: lone symbol key is NOT noise', isReportNoise('+') === false);

// Behavioural, through feed(), with input already accepting (acceptInput = true).
const seen = [];
__setDispatch((ev) => seen.push(ev));

function midSession(bytes) { __resetInput(); __acceptInputNow(); seen.length = 0; feed(Buffer.from(bytes, 'latin1')); }

midSession('rgb:8888/ffff/0000');
check('mid-session rgb: fragment dispatches no printable', !seen.some((e) => e.kind === 'char'));

midSession('8888/ffff');
check('mid-session 8888/ffff burst dispatches no printable', !seen.some((e) => e.kind === 'char'));

midSession('5555');
check('mid-session bare hex run dispatches no printable', !seen.some((e) => e.kind === 'char'));

midSession('g');
check("a single 'g' chunk IS recognised as the push command (char g dispatched)",
  seen.filter((e) => e.kind === 'char' && e.ch === 'g').length === 1);

midSession('5');
check("a single '5' chunk dispatches exactly that one printable",
  seen.filter((e) => e.kind === 'char').length === 1 && seen[0].ch === '5');

// Escape-sequence events (arrows) must still pass mid-session even alongside the guard.
midSession('\x1b[A');
check('mid-session arrow key still dispatches', seen.some((e) => e.kind === 'arrow' && e.dir === 'up'));

// Real dispatch: a lone digit sets the count; a noise burst leaves it untouched. Wrap
// in quiet() because the real applyEvent path calls redraw(), which writes ANSI out.
function quiet(fn) { const w = process.stdout.write; process.stdout.write = () => true; try { fn(); } finally { process.stdout.write = w; } }
__setDispatch(null);                                       // back to the real applyEvent
const st = __getState();

__resetInput(); __acceptInputNow(); quiet(() => feed(Buffer.from('5', 'latin1')));
check("a single typed '5' sets state.count to 5", st.count === 5);

__resetInput(); __acceptInputNow(); quiet(() => feed(Buffer.from('8888/ffff', 'latin1')));
check('a mid-session hex burst leaves state.count unchanged', st.count === 5);

__resetInput(); __acceptInputNow(); quiet(() => feed(Buffer.from('rgb:2222/3333/4444', 'latin1')));
check('a mid-session rgb: fragment leaves state.count unchanged', st.count === 5);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
