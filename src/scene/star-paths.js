/* ================================================================== */
/* scene/star-paths — how bright stars drift across the sky.           */
/*                                                                     */
/* Over a human lifetime the stars look fixed. Over millennia Earth's  */
/* axis wobbles around the ecliptic pole once per ~25,772 years, so    */
/* every star's right ascension and declination trace a small circle.  */
/* We draw that circle with a tick about every 1,000 years and a       */
/* marker at the simulated date. The maths lives in astronomy/, so it  */
/* is testable without a browser; this module only owns scene objects. */
/* ================================================================== */
import * as THREE from 'three';

import { daysSinceJ2000, precessionAngle, eclipticPole } from '../astronomy/coordinates.js';

const COLOR = 0xd9b36a;
const TICK_EVERY = 14; // of 360 segments ≈ 1,000 years

const stars = new Map(); // name -> { pos, path }
let root = null;
let pole = null;

export function initStarPaths({ scene }) {
  const p = eclipticPole();
  pole = new THREE.Vector3(p.x, p.y, p.z).normalize();
  root = new THREE.Group();
  root.name = 'star-paths';
  scene.add(root);
}

/* Called once per bright star, in the frame radecToVector() produced. */
export function registerStar(name, pos) {
  stars.set(name, { pos: pos.clone(), path: null });
}

export const starPathNames = () => [...stars].filter(([, s]) => s.path).map(([n]) => n);

function build(s) {
  const g = new THREE.Group();
  const pts = [];
  const ticks = [];
  for (let i = 0; i <= 360; i++) {
    const v = s.pos.clone().applyAxisAngle(pole, (i / 360) * Math.PI * 2);
    pts.push(v);
    if (i % TICK_EVERY === 0 && i < 360) ticks.push(v);
  }
  g.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: COLOR, transparent: true, opacity: 0.55, depthWrite: false })
  ));
  g.add(new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(ticks),
    new THREE.PointsMaterial({ color: COLOR, size: 12, sizeAttenuation: true, depthWrite: false })
  ));
  const marker = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints([s.pos]),
    new THREE.PointsMaterial({ color: 0xffe2a0, size: 34, sizeAttenuation: true, depthWrite: false })
  );
  marker.frustumCulled = false;
  g.add(marker);
  g.userData.marker = marker;
  return g;
}

function dispose(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
}

export function toggleStarPath(name, force) {
  const s = stars.get(name);
  if (!s || !root) return false;
  const on = force ?? !s.path;
  if (on && !s.path) { s.path = build(s); root.add(s.path); }
  if (!on && s.path) { root.remove(s.path); dispose(s.path); s.path = null; }
  return !!s.path;
}

export function setAllStarPaths(on) { stars.forEach((_, n) => toggleStarPath(n, on)); }

export function restoreStarPaths(names) {
  setAllStarPaths(false);
  (names || []).forEach((n) => toggleStarPath(n, true));
}

/* Parked on the sim date, so scrubbing millennia moves the marker. */
export function updateStarMarkers(simMs) {
  if (!root) return;
  const angle = precessionAngle(daysSinceJ2000(simMs));
  const v = new THREE.Vector3();
  for (const s of stars.values()) {
    if (!s.path) continue;
    v.copy(s.pos).applyAxisAngle(pole, angle);
    const a = s.path.userData.marker.geometry.attributes.position;
    a.setXYZ(0, v.x, v.y, v.z);
    a.needsUpdate = true;
  }
}
