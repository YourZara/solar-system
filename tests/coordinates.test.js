import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  J2000_MS, OBLIQUITY, daysSinceJ2000, jdToMs,
  eqToEct, toScene, radecToVector, formatUtc,
} from '../src/astronomy/coordinates.js';
import { AU_UNITS } from '../src/config.js';

const norm = (v) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('J2000 epoch is JD 2451545.0', () => {
  assert.equal(J2000_MS, Date.UTC(2000, 0, 1, 12));
  assert.equal(daysSinceJ2000(J2000_MS), 0);
  assert.equal(jdToMs(2451545.0), J2000_MS);
});

test('daysSinceJ2000 and jdToMs round-trip', () => {
  for (const jd of [2451545.0, 2446470.96, 2461000.5, 2469807.5]) {
    assert.ok(close(2451545.0 + daysSinceJ2000(jdToMs(jd)), jd, 1e-6));
  }
});

test('eqToEct is a rotation: it preserves vector length', () => {
  for (const v of [{ x: 1, y: 0, z: 0 }, { x: 0.3, y: -0.7, z: 0.9 }, { x: 5, y: 5, z: 5 }]) {
    assert.ok(close(norm(eqToEct(v)), norm(v)));
  }
});

test('eqToEct rotates about X by the obliquity', () => {
  const v = { x: 0, y: 1, z: 0 };
  const r = eqToEct(v);
  assert.ok(close(r.x, 0));
  assert.ok(close(r.y, Math.cos(OBLIQUITY)));
  assert.ok(close(r.z, -Math.sin(OBLIQUITY)));
});

const assertVec = (actual, expected) => {
  // Sign-of-zero is not meaningful here: -0 and 0 are the same point.
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(close(actual[axis], expected[axis]), `${axis}: ${actual[axis]} !== ${expected[axis]}`);
  }
};

test('toScene maps ecliptic axes onto the XZ plane, scaled to AU_UNITS', () => {
  assertVec(toScene({ x: 1, y: 0, z: 0 }), { x: AU_UNITS, y: 0, z: 0 });
  assertVec(toScene({ x: 0, y: 1, z: 0 }), { x: 0, y: 0, z: -AU_UNITS });
  assertVec(toScene({ x: 0, y: 0, z: 1 }), { x: 0, y: AU_UNITS, z: 0 });
});

test('radecToVector places the celestial pole on +Y', () => {
  const p = radecToVector(0, 90, 100);
  assert.ok(close(p.x, 0, 1e-9));
  assert.ok(close(p.y, 100));
  assert.ok(close(p.z, 0, 1e-9));
});

test('radecToVector: RA 6h, dec 0 sits on -Z (the way constellations use it)', () => {
  const p = radecToVector(6, 0, 100);
  assert.ok(close(p.x, 0, 1e-9));
  assert.ok(close(p.y, 0, 1e-9));
  assert.ok(close(p.z, -100));
});

test('formatUtc renders UTC, zero-padded', () => {
  assert.equal(formatUtc(0), '1970-01-01 00:00 UTC');
  assert.equal(formatUtc(Date.UTC(1986, 1, 9, 4, 5)), '1986-02-09 04:05 UTC');
});
