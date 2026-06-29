import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBar } from './agentbar.mjs';

test('close-agent + lock survive a narrow bar', () => {
  const bar = buildBar(40);
  assert.match(bar, /Ctrl\+Alt\+w/, 'close agent must always show');
  assert.match(bar, /Ctrl\+g/, 'lock must always show');
});

test('wide bar shows everything', () => {
  const bar = buildBar(240);
  assert.match(bar, /Alt\+Arrows/);
  assert.match(bar, /Alt\+i/);
});

test('bar is padded to the width', () => {
  assert.equal(buildBar(80).length, 80);
});
