/* ================================================================== */
/* scene/bodies — lights, sun, planets, moons, dwarf planets, comets.  */
/*                                                                     */
/* Planet/moon geometry has radius 1; display scale lives on spinEl,   */
/* so the true-scale toggle just re-scales spinEl.                     */
/*                                                                     */
/* Also owns the per-frame position pass (updatePositions), because    */
/* placement is meaningless without the records it writes into.        */
/* ================================================================== */
import * as THREE from 'three';

import { AU_UNITS, compressedRadius } from '../config.js';
import { view, moonOrbitUnits } from '../state.js';
import { BODIES, MOONS, KEPLER_BODIES } from '../data/bodies.js';
import { daysSinceJ2000, eqToEct, toScene } from '../astronomy/coordinates.js';
import { keplerScenePos } from '../astronomy/kepler.js';
import { helioVector, geoMoon } from '../astronomy/ephemeris.js';

export const bodiesByKey = {}; // key -> record (planets + dwarfs + comet)
export const moonsByKey = {};

let scene = null;
let textureLoader = null;
let renderer = null;

/* ================================================================== */
/* Procedural surface for texture-less bodies (declared, not hidden)   */
/* ================================================================== */
export function proceduralTexture(baseHex, spotHex) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + baseHex.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 256, 128);
  // soft vertical shading
  const shade = g.createLinearGradient(0, 0, 0, 128);
  shade.addColorStop(0, 'rgba(255,255,255,0.10)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = shade; g.fillRect(0, 0, 256, 128);
  // mottling
  g.fillStyle = '#' + spotHex.toString(16).padStart(6, '0');
  for (let k = 0; k < 260; k++) {
    g.globalAlpha = 0.05 + Math.random() * 0.10;
    const r = 2 + Math.random() * 16;
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 128, r, r * (0.4 + Math.random() * 0.6),
              Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeGlowSprite(colorInner, localScale) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, colorInner);
  grad.addColorStop(0.2, 'rgba(255,180,90,0.28)');
  grad.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  s.scale.setScalar(localScale);
  return s;
}

function sphere(radiusSegments = 48) {
  return new THREE.SphereGeometry(1, radiusSegments, Math.round(radiusSegments * 0.7));
}

function applySurfaceTexture(mat, url, fallbackColor) {
  textureLoader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  });
}

/* --- Comet: coma + twin tail, always pointing away from the Sun, --- */
/* --- length growing toward perihelion (honest at 35 AU: none).   --- */
function tailTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 256, 0, 0); // bottom (nucleus) -> top (far)
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildCometTail(rec) {
  const dustGeo = new THREE.CylinderGeometry(0.02, 0.5, 1, 12, 1, true); // unit length, Y axis
  dustGeo.translate(0, 0.5, 0); // base at nucleus
  const dust = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({
    map: tailTexture('rgba(255,236,200,0.55)', 'rgba(255,220,180,0.18)'),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  const ion = new THREE.Mesh(dustGeo.clone(), new THREE.MeshBasicMaterial({
    map: tailTexture('rgba(150,190,255,0.5)', 'rgba(120,160,255,0.15)'),
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  ion.scale.set(0.4, 1.6, 0.4);
  const coma = makeGlowSprite('rgba(200,220,255,0.8)', 3);
  rec.group.add(dust, ion, coma);
  rec.tail = { dust, ion, coma };
}

function updateCometTail(rec) {
  const pos = rec.group.position;
  const r = pos.length() / AU_UNITS; // heliocentric distance in AU
  const scaleBoost = rec.body.tailScale || 1;
  const activity = THREE.MathUtils.smoothstep(6.0 - r, 0, 5.0); // 0 beyond ~6 AU
  const dir = pos.clone().normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const len = 1.8 * scaleBoost * activity * Math.pow(1 / Math.max(r, 0.4), 1.25);
  rec.tail.dust.scale.set(1.2 * scaleBoost, Math.max(len, 0.001), 1.2 * scaleBoost);
  rec.tail.ion.scale.set(0.45 * scaleBoost, Math.max(len * 1.8, 0.001), 0.45 * scaleBoost);
  rec.tail.dust.quaternion.copy(quat);
  rec.tail.ion.quaternion.copy(quat);
  rec.tail.coma.material.opacity = activity;
  rec.tail.coma.scale.setScalar((0.6 + activity * 3.2) * scaleBoost);
  rec.tail.dust.visible = rec.tail.ion.visible = activity > 0.001;
}

/* ================================================================== */
/* Build                                                               */
/* ================================================================== */
export function initBodies(deps) {
  scene = deps.scene;
  textureLoader = deps.textureLoader;
  renderer = deps.renderer;

  scene.add(new THREE.AmbientLight(0xffffff, 0.06));
  const sunLight = new THREE.PointLight(0xfff3e0, 2.4, 0, 0); // decay 0: even reach
  scene.add(sunLight);

  /* --- Sun + planets --- */
  for (const body of BODIES) {
    const group = new THREE.Group();   // positioned by ephemeris
    const spinEl = new THREE.Group();  // tilt + display scale live here
    spinEl.rotation.z = THREE.MathUtils.degToRad(body.tilt);
    const mat = body.sun
      ? new THREE.MeshBasicMaterial({ color: body.color })
      : new THREE.MeshStandardMaterial({ color: body.color, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(sphere(), mat);
    spinEl.add(mesh);
    group.add(spinEl);
    scene.add(group);

    if (body.sun) spinEl.add(makeGlowSprite('rgba(255,210,140,0.75)', 4.5));
    else applySurfaceTexture(mat, body.tex, body.color);

    const rec = { body, group, mesh, spinEl, mat, scaleR: 1 };
    bodiesByKey[body.key] = rec;
    // (moons appended under planet groups below)
  }

  /* --- Moons --- */
  for (const moon of MOONS) {
    const parent = bodiesByKey[moon.parent];
    const group = new THREE.Group(); // positioned relative to parent
    const spinEl = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: moon.color, roughness: 0.95 });
    if (moon.tex) applySurfaceTexture(mat, moon.tex, moon.color);
    else mat.map = proceduralTexture(moon.color, moon.color & 0x7f7f7f);
    const mesh = new THREE.Mesh(sphere(28), mat);
    spinEl.add(mesh);
    group.add(spinEl);
    parent.group.add(group);

    const rec = { moon, group, mesh, spinEl, mat, parent };
    moonsByKey[moon.key] = rec;

    /* orbit line: unit circle in XZ, tilted by inclination, scaled per frame */
    const pts = [];
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)));
    }
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x7f8ba3, transparent: true, opacity: 0.15 })
    );
    line.rotation.x = THREE.MathUtils.degToRad(moon.inc);
    parent.group.add(line);
    rec.orbitLine = line;
  }

  /* --- Dwarf planets + comet --- */
  for (const el of KEPLER_BODIES) {
    const group = new THREE.Group();
    const spinEl = new THREE.Group();
    const r = Math.max(compressedRadius(el.radiusKm), el.comet ? 0.12 : 0.22); // visibility floor
    const mat = new THREE.MeshStandardMaterial({ color: el.color, roughness: 0.95 });
    if (el.tex) applySurfaceTexture(mat, el.tex, el.color);
    else mat.map = proceduralTexture(el.color, el.color & 0x5f5f5f);
    const mesh = new THREE.Mesh(sphere(28), mat);
    spinEl.add(mesh);
    spinEl.scale.setScalar(r);
    group.add(spinEl);
    scene.add(group);

    const rec = { body: el, group, mesh, spinEl, mat, scaleR: r, isKepler: true };
    bodiesByKey[el.key] = rec;

    if (el.comet) buildCometTail(rec);
  }

  return { bodiesByKey, moonsByKey, updatePositions, updateCometTail };
}

/* ================================================================== */
/* EPHEMERIS application — real positions every frame                  */
/* ================================================================== */
export function updatePositions(simMs) {
  const date = new Date(simMs);

  // Sun-centred planets (VSOP87 ±1 arcminute)
  for (const rec of Object.values(bodiesByKey)) {
    if (rec.isKepler || rec.body.sun) continue;
    const eqj = helioVector(rec.body.key, date);
    rec.group.position.copy(toScene(eqToEct(eqj)));
  }

  // Dwarf planets + comet (Kepler propagation)
  for (const rec of Object.values(bodiesByKey)) {
    if (!rec.isKepler) continue;
    rec.group.position.copy(keplerScenePos(rec.body, simMs));
    if (rec.tail) updateCometTail(rec);
  }

  // Moons
  for (const rec of Object.values(moonsByKey)) {
    const orbitUnits = moonOrbitUnits(rec.moon, bodiesByKey[rec.moon.parent]);
    let dir; // unit vector in scene space
    if (rec.moon.eph) {
      // Real Moon: geocentric EQJ vector (astronomy-engine GeoMoon) -> ecliptic
      const gm = eqToEct(geoMoon(date));
      dir = new THREE.Vector3(gm.x, gm.z, -gm.y).normalize();
    } else {
      const th = (rec.moon.phase0 * Math.PI / 180) +
                 (daysSinceJ2000(simMs) / rec.moon.periodD) * Math.PI * 2;
      const inc = rec.moon.inc * Math.PI / 180;
      dir = new THREE.Vector3(
        Math.cos(th), Math.sin(inc) * Math.sin(th), -Math.cos(inc) * Math.sin(th)
      ).normalize();
    }
    rec.group.position.copy(dir.multiplyScalar(orbitUnits));
    rec.mesh.rotation.y = -(daysSinceJ2000(simMs) / rec.moon.periodD) * Math.PI * 2; // tidally locked
    const ou = moonOrbitUnits(rec.moon, bodiesByKey[rec.moon.parent]);
    rec.orbitLine.scale.setScalar(ou);
  }
}
