#!/usr/bin/env node
// separator.mjs — a one-row, borderless pane that renders as a black gap, used to
// break the green chevron tab-bar away from the content beneath it (so the top of
// the window is not one solid blob of green). It just clears its single row and
// stays alive (the pane would close if the process exited). Zero deps.

const ESC = '\x1b';
function draw() { try { process.stdout.write(ESC + '[2K\r'); } catch { /* */ } }
draw();
process.stdout.on('resize', draw);
setInterval(draw, 5000);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
