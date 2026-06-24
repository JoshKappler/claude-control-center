#!/usr/bin/env node
// Demonstrate the exact bug scenario

import { decodeInput, __setDispatch, __acceptInputNow, __resetInput } from './home.mjs';

console.log('=== DEMONSTRATING THE PASTE BUG ===\n');

const dispatched = [];
__setDispatch((ev) => dispatched.push(ev));
__acceptInputNow();

console.log('Scenario: User tries to paste "hello" into the app\n');

// Simulate what the terminal sends when user pastes in bracketed paste mode
// (most modern terminals do this for safety - prevents interpreting pasted text as commands)
const pastedInput = '\x1b[200~hello\x1b[201~';

console.log('Terminal sends bracketed paste:', JSON.stringify(pastedInput));
console.log('Bytes: ESC[200~ (paste start) + "hello" + ESC[201~ (paste end)');
console.log();

const { events, rest } = decodeInput(pastedInput);

console.log('Parser decodes to events:');
for (let i = 0; i < events.length; i++) {
  console.log(`  [${i}] ${JSON.stringify(events[i])}`);
}
console.log();

console.log('But the app onPrintable() handler at home.mjs:612-625 only recognizes:');
console.log('  - Numbers 1-8 (set agent count)');
console.log('  - +/- (adjust count)');
console.log('  - c (pull)');
console.log('  - g (push)');
console.log('  - ? (help)');
console.log('  - q (quit)');
console.log('  - k/j/h/l (vim movement)');
console.log();

console.log('Since h, e, l, l, o are not in that list:');
console.log('  - "h" → triggers act("left") ✗ WRONG! (vim movement)');
console.log('  - "e" → no action (unbound)');
console.log('  - "l" → triggers act("right") ✗ WRONG! (vim movement)');
console.log('  - "l" → triggers act("right") ✗ WRONG! (vim movement)');
console.log('  - "o" → no action (unbound)');
console.log();

console.log('Result: The user\'s pasted text is MANGLED:');
console.log('  - Single letter commands are triggered (go left, go right)');
console.log('  - Multi-letter paste of >1 char jumps around the folder list');
console.log('  - Users report "pasting doesn\'t work" because their text is lost');
console.log();

console.log('=== THE REAL-WORLD PROBLEM ===');
console.log();
console.log('If user pastes multi-line text (which is VERY common):');
const multilineInput = '\x1b[200~hello\nworld\x1b[201~';
console.log('Terminal sends:', JSON.stringify(multilineInput));
dispatched.length = 0;
const { events: ev2 } = decodeInput(multilineInput);
console.log('Events generated:');
for (let i = 0; i < ev2.length; i++) {
  const e = ev2[i];
  if (e.kind === 'enter') console.log(`  [${i}] ENTER (newline in paste!)`);
  else console.log(`  [${i}] char: '${e.ch}'`);
}
console.log();
console.log('The ENTER event at line 676 triggers act("enter")');
console.log('Which at line 596 calls launch() in folder mode');
console.log('The pasted text doesn\'t appear ANYWHERE - it just launches agents!');
