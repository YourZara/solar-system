import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectJump, createTrail, seedTrail, recordSample,
  JUMP_SLACK, JUMP_FLOOR_MS,
} from '../src/systems/trail-buffer.js';

/* A 1 day/s frame of 16 ms, in simulated ms. */
const EXPECTED = 16 * 86400;

test('a fresh trail has room for its points plus one live head', () => {
  const t = createTrail(10);
  assert.equal(t.n, 0);
  assert.equal(t.arr.length, (10 + 1) * 3);
});

test('detectJump ignores the first frame and normal motion', () => {
  assert.equal(detectJump(null, 0, EXPECTED), false);
  assert.equal(detectJump(0, EXPECTED, EXPECTED), false);
  assert.equal(detectJump(0, EXPECTED * JUMP_SLACK, EXPECTED), false);
});

test('detectJump flags a scrub or a date pick', () => {
  const tenDays = 10 * 86400000;
  assert.equal(detectJump(0, tenDays, EXPECTED), true);
  assert.equal(detectJump(0, 0, EXPECTED), false, 'a paused frame is not a jump');
});

test('detectJump is direction-agnostic, so reverse time still records', () => {
  assert.equal(detectJump(0, -EXPECTED, EXPECTED), false);
  assert.equal(detectJump(0, -10 * 86400000, EXPECTED), true);
});

test('the slack floor covers a slow frame', () => {
  // Threshold is expected × 1.5 + 1 s; a frame inside that is still real motion.
  const slow = EXPECTED * JUMP_SLACK + JUMP_FLOOR_MS;
  assert.equal(detectJump(0, slow, EXPECTED), false);
  assert.equal(detectJump(0, EXPECTED * 1.4, EXPECTED), false);
});

test('the first sample is appended and the head sits on it', () => {
  const t = createTrail(10);
  assert.equal(recordSample(t, 1, 2, 3, true), 1);
  assert.equal(t.arr[0], 1);
  assert.equal(t.arr[3], 1, 'head vertex');
});

test('a sub-step movement moves the head but adds no point', () => {
  const t = createTrail(10);
  recordSample(t, 0, 0, 0, true);
  const before = t.n;
  recordSample(t, 0.125, 0, 0, true); // below MIN_STEP, exactly representable in f32
  assert.equal(t.n, before);
  assert.equal(t.arr[t.n * 3], 0.125, 'head followed the body');
});

test('a real step is appended', () => {
  const t = createTrail(10);
  recordSample(t, 0, 0, 0, true);
  recordSample(t, 1, 0, 0, true);
  assert.equal(t.n, 2);
  assert.equal(t.arr[3], 1);
});

test('a paused clock moves the head and records nothing', () => {
  const t = createTrail(10);
  recordSample(t, 0, 0, 0, true);
  const before = t.n;
  recordSample(t, 5, 0, 0, false);
  assert.equal(t.n, before);
  assert.equal(t.arr[t.n * 3], 5);
});

test('overflow drops the oldest point, not the newest', () => {
  const t = createTrail(3);
  recordSample(t, 0, 0, 0, true);
  recordSample(t, 1, 0, 0, true);
  recordSample(t, 2, 0, 0, true);
  recordSample(t, 3, 0, 0, true);
  assert.equal(t.n, 3);
  assert.equal(t.arr[0], 1, 'point 0 was dropped');
  assert.equal(t.arr[(t.n - 1) * 3], 3, 'newest point kept');
});

test('seeding keeps the newest points and reports the count', () => {
  const t = createTrail(3);
  const n = seedTrail(t, [0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0]);
  assert.equal(n, 3);
  assert.equal(t.arr[0], 2);
  assert.equal(t.arr[6], 4);
});
