import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PRECESSION_PERIOD_YEARS, eclipticPole, precessionAngle, rotateAboutAxis,
} from '../src/astronomy/coordinates.js';

test('one precession period is a full turn', () => {
  const days = PRECESSION_PERIOD_YEARS * 365.25;
  assert.ok(Math.abs(precessionAngle(days) - Math.PI * 2) < 1e-12);
});

test('precession angle is linear in time', () => {
  const half = PRECESSION_PERIOD_YEARS * 365.25 / 2;
  assert.ok(Math.abs(precessionAngle(half) - Math.PI) < 1e-12);
  assert.equal(precessionAngle(0), 0);
});

test('the ecliptic pole is a unit vector tilted by the obliquity', () => {
  const p = eclipticPole();
  assert.ok(Math.abs(Math.hypot(p.x, p.y, p.z) - 1) < 1e-12);
  assert.equal(p.x, 0);
  assert.ok(Math.abs(Math.acos(p.y) * 180 / Math.PI - 23.4392911) < 1e-9);
});

test('rotation preserves length', () => {
  const v = { x: 3, y: -1, z: 2 };
  const axis = eclipticPole();
  const r = rotateAboutAxis(v, axis, 1.234);
  assert.ok(Math.abs(Math.hypot(r.x, r.y, r.z) - Math.hypot(v.x, v.y, v.z)) < 1e-12);
});

test('rotation follows the right-hand rule', () => {
  const r = rotateAboutAxis({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, Math.PI / 2);
  assert.ok(Math.abs(r.x) < 1e-12);
  assert.ok(Math.abs(r.y) < 1e-12);
  assert.ok(Math.abs(r.z + 1) < 1e-12, 'x should swing to -z');
});

test('a full turn returns the star to where it started', () => {
  const v = { x: 0.3, y: 0.5, z: -0.8 };
  const r = rotateAboutAxis(v, eclipticPole(), Math.PI * 2);
  assert.ok(Math.abs(r.x - v.x) < 1e-12);
  assert.ok(Math.abs(r.y - v.y) < 1e-12);
  assert.ok(Math.abs(r.z - v.z) < 1e-12);
});
