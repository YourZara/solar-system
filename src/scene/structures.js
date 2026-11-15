/* ================================================================== */
/* scene/structures — the things that are not bodies:                  */
/*   Saturn's rings, the instanced belts, the orbit polylines.         */
/*                                                                     */
/* All three are static or cheap-to-update geometry hung off the scene */
/* or off a body's spin element.                                       */
/* ================================================================== */
import * as THREE from 'three';

import { W, AU_UNITS } from '../config.js';
import { J2000_MS, daysSinceJ2000, eqToEct, toScene } from '../astronomy/coordinates.js';
import { keplerScenePosFromE } from '../astronomy/kepler.js';
import { helioVector } from '../astronomy/ephemeris.js';
import { KEPLER_BODIES } from '../data/bodies.js';
import { bodiesByKey } from './bodies.js';

export const beltGroups = [];
export const orbitLines = [];

let scene = null;

/* --- Saturn's rings (radial UV remap; sizes in Saturn radii) --- */
export function addSaturnRings(textureLoader) {
  const saturn = bodiesByKey.saturn;
  const inner = 1.24, outer = 2.27;
  const ringGeo = new THREE.RingGeometry(inner, outer, 160, 1);
  const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  const ringTex = textureLoader.load(W + '7/7d/Solarsystemscope_texture_2k_saturn_ring_alpha.png');
  ringTex.colorSpace = THREE.SRGBColorSpace;
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
  }));
  ring.rotation.x = -Math.PI / 2; // equatorial plane
  saturn.spinEl.add(ring);        // inherits tilt 26.73° and display scale
}

/* ================================================================== */
/* Belts — instanced fields with per-rock Keplerian circular motion    */
/* (true-relative distances; rock sizes are schematic and stay so      */
/* under the true-scale toggle — declared in the credits)              */
/* ================================================================== */
export function makeBelt(count, aMin, aMax, ySpread, sizeMin, sizeMax, color) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
  const inst = new THREE.InstancedMesh(geo, mat, count);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const rocks = [];
  for (let i = 0; i < count; i++) {
    const a = aMin + Math.random() * (aMax - aMin);
    rocks.push({
      a,
      phase: Math.random() * Math.PI * 2,
      n: (0.9856076686 / Math.pow(a, 1.5)) * Math.PI / 180, // rad/day (Gaussian)
      y: (Math.random() * 2 - 1) * ySpread,
      s: sizeMin + Math.random() * (sizeMax - sizeMin),
    });
  }
  scene.add(inst);
  beltGroups.push({ inst, rocks, dirty: true });
  return inst;
}

const _m4 = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), _v3 = new THREE.Vector3();
export function updateBelts(simMs) {
  const d = daysSinceJ2000(simMs);
  for (const belt of beltGroups) {
    if (!belt.dirty) continue;
    for (let i = 0; i < belt.rocks.length; i++) {
      const r = belt.rocks[i];
      const th = r.phase + r.n * d;
      _v3.set(r.a * Math.cos(th), r.y, -r.a * Math.sin(th));
      _m4.compose(_v3, _q0, new THREE.Vector3(r.s, r.s * 0.8, r.s * 1.1));
      belt.inst.setMatrixAt(i, _m4);
    }
    belt.inst.instanceMatrix.needsUpdate = true;
    belt.dirty = false;
  }
}

/* ================================================================== */
/* Orbit lines (planets sampled from the real ephemeris;               */
/* dwarfs/comet from the Kepler solver; moons are scaled circles)      */
/* ================================================================== */
export function addOrbitLine(points, opacity) {
  const line = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p.x, p.y, p.z)))
    ),
    new THREE.LineBasicMaterial({ color: 0x7f8ba3, transparent: true, opacity })
  );
  scene.add(line);
  orbitLines.push(line);
  return line;
}

export function buildPlanetaryOrbits() {
  const N = 180;
  for (const rec of Object.values(bodiesByKey)) {
    if (rec.isKepler) continue;
    if (!rec.body.periodD) continue; // the Sun
    const pts = [];
    const t0 = J2000_MS;
    for (let k = 0; k < N; k++) {
      const d = new Date(t0 + (k / N) * rec.body.periodD * 86400000);
      const eqj = helioVector(rec.body.key, d);
      pts.push(toScene(eqToEct(eqj)));
    }
    addOrbitLine(pts, 0.22);
  }
  for (const el of KEPLER_BODIES) {
    const pts = [];
    for (let k = 0; k < N; k++) {
      const E = (k / N) * Math.PI * 2; // uniform in E — dense near perihelion
      pts.push(keplerScenePosFromE(el, E));
    }
    addOrbitLine(pts, 0.22);
  }
}

/* Build everything that hangs off the bodies. Call after initBodies(). */
export function initStructures(deps) {
  scene = deps.scene;
  addSaturnRings(deps.textureLoader);
  makeBelt(1400, 2.1, 3.3, 1.2, 0.04, 0.14, 0x9b8f80); // asteroid belt
  makeBelt(900, 37, 48, 5, 0.05, 0.16, 0x8fa0b5);      // Kuiper belt
  buildPlanetaryOrbits();
  return { beltGroups, orbitLines };
}
