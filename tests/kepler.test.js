import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  keplerEccentricAnomaly, orbitPoint, keplerScenePos, keplerScenePosFromE,
} from '../src/astronomy/kepler.js';
import { jdToMs } from '../src/astronomy/coordinates.js';
import { AU_UNITS } from '../src/config.js';
import { KEPLER_BODIES } from '../src/data/bodies.js';

const HALLEY = KEPLER_BODIES.find((b) => b.key === 'halley');
const norm = (p) => Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);

test('Kepler equation: E - e·sin(E) === M after solving', () => {
  for (const e of [0, 0.2, 0.5, 0.9, 0.967]) {
    for (const Mdeg of [0, 15, 90, 179, 250, 359]) {
      const M = (Mdeg * Math.PI) / 180;
      const E = keplerEccentricAnomaly(M, e);
      const residual = E - e * Math.sin(E) - M;
      assert.ok(Math.abs(residual) < 1e-8, `e=${e} M=${Mdeg} residual=${residual}`);
    }
  }
});

test('Kepler solver converges where the naive start is worst (e very high)', () => {
  // e = 0.967 is Halley's: the most eccentric body in the data set.
  const M = 0.05; // just past perihelion, steepest part of the curve
  const E = keplerEccentricAnomaly(M, HALLEY.e);
  assert.ok(Number.isFinite(E));
  assert.ok(Math.abs(E - HALLEY.e * Math.sin(E) - M) < 1e-8);
  // E > M for 0 < M < π: the eccentric anomaly runs ahead of the mean one.
  assert.ok(E > M);
});

test('perihelion distance equals a·(1 - e)', () => {
  const r = HALLEY.a * (1 - HALLEY.e);
  assert.ok(Math.abs(norm(orbitPoint(HALLEY, 0)) / AU_UNITS - r) < 1e-9);
});

test("Halley's 1986 perihelion lands at the published 0.586 AU", () => {
  // Elements are osculating, so allow 0.02 AU — good enough to trust, not
  // mission planning (see README "Accuracy").
  const p = keplerScenePos(HALLEY, jdToMs(HALLEY.jd0));
  const rAU = norm(p) / AU_UNITS;
  assert.ok(Math.abs(rAU - 0.586) < 0.02, `got ${rAU.toFixed(4)} AU`);
});

test('position at the epoch equals position at M0', () => {
  for (const el of KEPLER_BODIES) {
    const M = ((el.M0 % 360) * Math.PI) / 180;
    const atEpoch = keplerScenePos(el, jdToMs(el.jd0));
    const atM0 = orbitPoint(el, keplerEccentricAnomaly(M, el.e));
    assert.ok(Math.abs(norm(atEpoch) - norm(atM0)) < 1e-9, el.key);
  }
});

test('keplerScenePos and keplerScenePosFromE agree at E = M = 0', () => {
  for (const el of KEPLER_BODIES) {
    const viaE = keplerScenePosFromE(el, 0);
    const viaTime = orbitPoint(el, 0);
    assert.deepEqual(viaE, viaTime);
  }
});

test('all elements produce finite, plausibly-scaled positions', () => {
  for (const el of KEPLER_BODIES) {
    const p = keplerScenePos(el, Date.UTC(2026, 0, 1));
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), el.key);
    const rAU = norm(p) / AU_UNITS;
    // Nothing in the table lives inside the Sun or beyond the Oort cloud.
    assert.ok(rAU > 0.05 && rAU < 5000, `${el.key}: ${rAU} AU`);
  }
});
