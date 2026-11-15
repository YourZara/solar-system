import { test } from 'node:test';
import assert from 'node:assert/strict';

import { advanceClock, clampDt, changeSpeed, togglePause, MAX_DT_S } from '../src/systems/time.js';
import { SPEEDS } from '../src/config.js';

const clock = (over = {}) => ({ simMs: 1_000_000, paused: false, speedIdx: 1, prevSimMs: 1_000_000, ...over });

test('speeds are strictly increasing', () => {
  for (let i = 1; i < SPEEDS.length; i++) {
    assert.ok(SPEEDS[i].mult > SPEEDS[i - 1].mult, `speed ${i}`);
  }
  assert.equal(SPEEDS[0].mult, 1); // "real time"
});

test('advance advances simMs by dt × mult', () => {
  const t = clock();
  advanceClock(t, 0.5);
  assert.equal(t.simMs, 1_000_000 + 0.5 * 1000 * SPEEDS[1].mult);
});

test('advance records prevSimMs so the loop can spin by the simulated delta', () => {
  const t = clock({ simMs: 5_000, prevSimMs: 0 });
  advanceClock(t, 0.25);
  assert.equal(t.prevSimMs, 5_000);
});

test('a paused clock keeps its time but still records prevSimMs', () => {
  const t = clock({ paused: true, prevSimMs: 0 });
  advanceClock(t, 1);
  assert.equal(t.simMs, 1_000_000);
  assert.equal(t.prevSimMs, 1_000_000);
});

test('clampDt caps a tab-restore jump and leaves small deltas alone', () => {
  assert.equal(clampDt(0.016), 0.016);
  assert.equal(clampDt(30), MAX_DT_S);
  assert.equal(clampDt(MAX_DT_S), MAX_DT_S);
});

test('changeSpeed clamps at both ends of the table', () => {
  const t = clock({ speedIdx: 0 });
  changeSpeed(t, -1);
  assert.equal(t.speedIdx, 0);
  t.speedIdx = SPEEDS.length - 1;
  changeSpeed(t, +1);
  assert.equal(t.speedIdx, SPEEDS.length - 1);
  t.speedIdx = 2;
  changeSpeed(t, +1);
  assert.equal(t.speedIdx, 3);
});

test('togglePause flips and reports', () => {
  const t = clock();
  assert.equal(togglePause(t), true);
  assert.equal(t.paused, true);
  assert.equal(togglePause(t), false);
});
