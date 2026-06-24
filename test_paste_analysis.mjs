#!/usr/bin/env node
// Test how the parser handles bracketed paste mode

import { decodeInput } from './home.mjs';

console.log('Testing bracketed paste handling:\n');

// Test 1: Does ESC[200~ match CSI pattern?
const bracketedStart = '\x1b[200~';
console.log('Test 1: Does ESC[200~ match CSI pattern?');
console.log('Input:', JSON.stringify(bracketedStart));
const csiPattern = /^\x1b\[[\x30-\x3f]*[\x20-\x2f]*([\x40-\x7e])/;
const m = bracketedStart.match(csiPattern);
console.log('CSI Pattern match:', m);
console.log('YES! ~ is 0x7e, which is in the final byte range [0x40-0x7e]');
console.log();

// Test 2: Simple paste of "hello"
const simplePaste = '\x1b[200~hello\x1b[201~';
console.log('Test 2: Simple paste "hello"');
console.log('Input:', JSON.stringify(simplePaste));
const result2 = decodeInput(simplePaste);
console.log('Events:', result2.events.map(e => ({ kind: e.kind, ch: e.ch })));
console.log('Rest:', JSON.stringify(result2.rest));
console.log();

// Test 3: Paste with newlines (multi-line)
const multilinePaste = '\x1b[200~line1\nline2\x1b[201~';
console.log('Test 3: Multiline paste');
console.log('Input:', JSON.stringify(multilinePaste));
const result3 = decodeInput(multilinePaste);
console.log('Events:', result3.events.map(e => ({ kind: e.kind, ch: e.ch })));
console.log('Rest:', JSON.stringify(result3.rest));
console.log();

// Test 4: Incomplete bracketed paste (missing end marker)
const incompletePaste = '\x1b[200~hello world';
console.log('Test 4: Incomplete paste (missing end marker)');
console.log('Input:', JSON.stringify(incompletePaste));
const result4 = decodeInput(incompletePaste);
console.log('Events:', result4.events.map(e => ({ kind: e.kind, ch: e.ch })));
console.log('Rest:', JSON.stringify(result4.rest));
console.log('Note: The parser breaks at the incomplete ESC[200~ and treats everything after as pending');
console.log();

// Test 5: Trace what happens: start marker gets consumed as empty CSI
console.log('Test 5: The ROOT CAUSE');
console.log('When ESC[200~ arrives:');
console.log('  - Parser matches it as a CSI sequence with final byte ~');
console.log('  - m[1] = "~" (the final byte)');
console.log('  - Check: ARROW["~"] = undefined (not in { A, B, C, D })');
console.log('  - So: no event is pushed, just skip m[0].length bytes');
console.log('  - The start marker ESC[200~ is silently consumed with NO event');
console.log('  - Parser continues at the next byte after ~');
console.log();

// Test 6: What happens to the pasted text after the marker is consumed?
console.log('Test 6: After ESC[200~ is consumed, pasted text arrives as individual chars');
const pastedAfterMarker = 'hello\x1b[201~';
console.log('Remaining buffer after ESC[200~ consumed:', JSON.stringify(pastedAfterMarker));
const result6 = decodeInput(pastedAfterMarker);
console.log('Events:', result6.events.map(e => ({ kind: e.kind, ch: e.ch })));
console.log('This looks correct: h,e,l,l,o as chars and enter as events');
console.log();

// Test 7: The end marker ESC[201~
console.log('Test 7: The end marker ESC[201~');
const endMarker = '\x1b[201~';
console.log('Input:', JSON.stringify(endMarker));
const result7 = decodeInput(endMarker);
console.log('CSI Pattern check: ~ (0x7e) is in [0x40-0x7e] = YES');
console.log('ARROW["~"] = undefined = NO event pushed');
console.log('Result:', result7);
console.log('The end marker is also silently consumed!');
console.log();

// Test 8: The real problem - multiline paste with newlines
console.log('Test 8: REAL PROBLEM - paste containing actual newlines');
const realPaste = '\x1b[200~hello\nworld\x1b[201~';
console.log('Input:', JSON.stringify(realPaste));
const result8 = decodeInput(realPaste);
console.log('Events:', result8.events.map(e => ({ kind: e.kind, ch: e.ch })));
console.log('');
console.log('ANALYSIS:');
console.log('  h,e,l,l,o → char events ✓');
console.log('  \n (0x0a) → enter event (line 676: if c === 0x0a) ✓');
console.log('  w,o,r,l,d → char events ✓');
console.log('  ESC[201~ → consumed silently ✓');
console.log('');
console.log('So the SYNTAX is preserved but line breaks cause ENTER events');
console.log('which triggers the launch() command instead of collecting input!');
