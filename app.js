import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { W, SPEEDS, AU_UNITS, SKYBOX_RADIUS, STAR_COUNTS, DRAG_PX,
         compressedRadius, trueRadius } from './src/config.js';
import {
  time, view, isCoarse, lowPower, qualityScale,
  parseUrlParams, bodyRadiusUnits, moonOrbitUnits,
} from './src/state.js';
import { BODIES, MOONS, KEPLER_BODIES } from './src/data/bodies.js';
import {
  J2000_MS, OBLIQUITY, daysSinceJ2000, eqToEct, toScene, formatUtc,
} from './src/astronomy/coordinates.js';
import { keplerScenePos, keplerScenePosFromE } from './src/astronomy/kepler.js';
import { helioVector, geoMoon } from './src/astronomy/ephemeris.js';
import { clampDt, advanceClock, changeSpeed, togglePause } from './src/systems/time.js';

/* ================================================================== */
/* WebGL2 guard                                                        */
/* ================================================================== */
const canvas = document.getElementById('scene-canvas');
if (!canvas.getContext('webgl2')) {
  document.getElementById('nogl').style.display = 'grid';
  throw new Error('WebGL2 unavailable');
}

/* ================================================================== */
/* Renderer / camera / controls                                        */
/* logarithmic depth so true-scale zooming doesn't z-fight             */
/* ================================================================== */
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: !lowPower, logarithmicDepthBuffer: true, powerPreference: lowPower ? 'low-power' : 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, qualityScale));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);

const camera = new THREE.PerspectiveCamera(
  55, window.innerWidth / window.innerHeight, 0.005, 40000
);
camera.position.set(0, 420, 1450);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 8;
controls.maxDistance = 15000;
// Free exploration: zoom toward the cursor (wheel) or pinch midpoint (touch).
// flyTo() turns this off so a selected body stays centred while zooming.
controls.zoomToCursor = true;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ================================================================== */
/* Loading manager — "fetching the sky…"                               */
/* ================================================================== */
const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const loadingBar = document.getElementById('loading-bar');
const manager = new THREE.LoadingManager();

manager.onProgress = (_url, loaded, total) => {
  const pct = total ? Math.round((loaded / total) * 100) : 0;
  loadingBar.style.width = pct + '%';
  loadingText.textContent = total ? `fetching the sky… ${loaded}/${total} (${pct}%)` : 'fetching the sky…';
};
manager.onLoad = () => {
  loadingText.textContent = 'ready — tap to explore';
  loadingBar.style.width = '100%';
  setTimeout(() => loadingEl.classList.add('hidden'), 1200);
};
manager.onError = (url) => {
  // No silent fallbacks: the body keeps its procedural colour; log + credits.
  console.warn('[solar-system] asset failed to load:', url);
  loadingText.textContent = 'the sky is partly cloudy — some detail is missing.';
};
const textureLoader = new THREE.TextureLoader(manager);

/* ================================================================== */
/* TIME — simulation clock (ms epoch), speeds, pause                   */
/* ================================================================== */
const dateReadout = document.getElementById('date-readout');
const speedLabel = document.getElementById('speed-label');
const btnPause = document.getElementById('btn-pause');
const btnSlower = document.getElementById('btn-slower');
const btnFaster = document.getElementById('btn-faster');

function refreshHud() {
  speedLabel.textContent = SPEEDS[time.speedIdx].label;
  btnPause.textContent = time.paused ? '▶' : '⏸';
  btnPause.classList.toggle('on', time.paused);
}
btnPause.addEventListener('click', () => { togglePause(time); refreshHud(); });
btnSlower.addEventListener('click', () => { changeSpeed(time, -1); refreshHud(); });
btnFaster.addEventListener('click', () => { changeSpeed(time, +1); refreshHud(); });
refreshHud();


/* ================================================================== */
/* SCALES — see src/config.js and src/state.js                         */
/* ================================================================== */

/* ================================================================== */
/* Fact-card number formatters                                         */
/* ================================================================== */
function fmtDiameter(km) {
  return km >= 10000 ? Math.round(km).toLocaleString('en-US') + ' km'
    : km >= 100 ? km.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' km'
    : km.toFixed(1) + ' km';
}
function fmtDay(h) {
  const a = Math.abs(h);
  if (a >= 48) return (a / 24).toFixed(1) + ' days' + (h < 0 ? ' (retrograde)' : '');
  return a.toFixed(1) + ' hours' + (h < 0 ? ' (retrograde)' : '');
}
function fmtYear(d) {
  if (!d) return '—';
  if (d >= 365.25 * 2) return (d / 365.25).toFixed(2) + ' years';
  return d.toFixed(1) + ' days';
}

/* ================================================================== */
/* Procedural surface for texture-less bodies (declared, not hidden)   */
/* ================================================================== */
function proceduralTexture(baseHex, spotHex) {
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

/* ================================================================== */
/* SCENE — light, sun, planets, moons, rings                           */
/* Planet/moon geometry has radius 1; display scale lives on spinEl,   */
/* so the true-scale toggle just re-scales spinEl.                     */
/* ================================================================== */
scene.add(new THREE.AmbientLight(0xffffff, 0.06));
const sunLight = new THREE.PointLight(0xfff3e0, 2.4, 0, 0); // decay 0: even reach
scene.add(sunLight);

function makeGlowSprite(colorInner, localScale) {
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

const bodiesByKey = {}; // key -> record (planets + dwarfs + comet)
const moonsByKey = {};

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

/* --- Saturn's rings (radial UV remap; sizes in Saturn radii) --- */
{
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
/* Belts — instanced fields with per-rock Keplerian circular motion    */
/* (true-relative distances; rock sizes are schematic and stay so      */
/* under the true-scale toggle — declared in the credits)              */
/* ================================================================== */
const beltGroups = [];
function makeBelt(count, aMin, aMax, ySpread, sizeMin, sizeMax, color) {
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
function updateBelts(simMs) {
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
makeBelt(1400, 2.1, 3.3, 1.2, 0.04, 0.14, 0x9b8f80); // asteroid belt
makeBelt(900, 37, 48, 5, 0.05, 0.16, 0x8fa0b5);      // Kuiper belt

/* ================================================================== */
/* Orbit lines (planets sampled from the real ephemeris;               */
/* dwarfs/comet from the Kepler solver; moons are scaled circles)      */
/* ================================================================== */
const orbitLines = [];
function addOrbitLine(points, opacity) {
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
function buildPlanetaryOrbits() {
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
buildPlanetaryOrbits();

/* ================================================================== */
/* Labels — projected DOM, quiet and thin                              */
/* ================================================================== */
const labelsRoot = document.getElementById('labels');
const labels = []; // { el, obj (Object3D) or pos (world Vector3), parentKey }
function addLabel(name, target, opts = {}) {
  const el = document.createElement('div');
  el.className = 'label' + (opts.small ? ' small' : '');
  el.textContent = name;
  el.style.display = 'none';
  labelsRoot.appendChild(el);
  labels.push({
    el,
    obj: target.isObject3D ? target : null,
    pos: target.isVector3 ? target : null,
    parentKey: opts.parentKey || null,
  });
}
addLabel('Sun', new THREE.Vector3(0, 0, 0));
for (const rec of Object.values(bodiesByKey)) {
  if (rec.body.sun) continue;
  addLabel(rec.body.name, rec.group);
}
for (const rec of Object.values(moonsByKey)) {
  addLabel(rec.moon.name, rec.group, { small: true, parentKey: rec.moon.parent });
}

const _proj = new THREE.Vector3();
const _world = new THREE.Vector3();
function updateLabels() {
  if (!view.labels) return;
  const camPos = camera.position;
  const labelCandidates = [];
  for (const L of labels) {
    if (L.parentKey) {
      const parentPos = bodiesByKey[L.parentKey].group.position;
      const dist = camPos.distanceTo(parentPos);
      L.el.style.display = dist < 130 ? 'block' : 'none';
      if (L.el.style.display === 'none') continue;
    }
    if (L.obj) L.obj.getWorldPosition(_world);
    else _world.copy(L.pos);
    const d = camPos.distanceTo(_world);
    _proj.copy(_world).project(camera);
    if (_proj.z > 1 || _proj.z < -1) { L.el.style.display = 'none'; continue; }
    const x = (_proj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
    if (x < -60 || x > window.innerWidth + 60 || y < -30 || y > window.innerHeight + 30) {
      L.el.style.display = 'none'; continue;
    }
    // dim distant labels; keep selected/nearby clearer
    const isSelected = selected && L.obj === selected.rec.group;
    const alpha = isSelected ? 1 : Math.max(0.25, Math.min(1, 1.15 - d / 3500));
    L.el.style.display = 'block';
    L.el.style.left = x + 'px';
    L.el.style.top = y + 'px';
    L.el.style.opacity = alpha.toFixed(2);
    labelCandidates.push({ L, x, y, d, priority: isSelected ? 2 : (L.parentKey ? 0 : 1) });
  }
  // simple deconfliction: hide lower-priority labels that overlap
  labelCandidates.sort((a,b) => b.priority - a.priority || a.d - b.d);
  const placed = [];
  for (const c of labelCandidates) {
    if (c.L.el.style.display === 'none') continue;
    const w = c.L.parentKey ? 46 : 60, h = 14;
    let hit = false;
    for (const p of placed) {
      if (Math.abs(c.x - p.x) < (w/2 + p.w/2) && Math.abs(c.y - p.y) < (h/2 + p.h/2)) { hit = true; break; }
    }
    if (hit && c.priority < 2) { c.L.el.style.display = 'none'; }
    else placed.push({ x:c.x, y:c.y, w, h });
  }
}
function updateConstellationLabels() {
  if (!view.constellations) {
    for (const L of constLabels) L.el.style.display = 'none';
    hideConstTooltip();
    return;
  }
  for (const L of constLabels) {
    _proj.copy(L.pos).project(camera);
    if (_proj.z > 1 || _proj.z < -1) { L.el.style.display = 'none'; continue; }
    const x = (_proj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
    if (x < -40 || x > window.innerWidth + 40 || y < -20 || y > window.innerHeight + 20) {
      L.el.style.display = 'none'; continue;
    }
    L.el.style.display = 'block';
    L.el.style.left = x + 'px';
    L.el.style.top = y + 'px';
  }
}

/* ================================================================== */
/* Toggles (labels / orbits / true scale / belts), remembered          */
/* ================================================================== */
let constellationGroup = null;
let constLabels = [];
let hideConstTooltip = () => {};
let brightStarsGroup = new THREE.Group();
let skyGridGroup = new THREE.Group();
let brightStarLabels = [];
const toggleBtns = [...document.querySelectorAll('#toggles button')];
function applyToggles() {
  for (const rec of Object.values(bodiesByKey)) {
    if (rec.body.sun) continue;
    // Kepler dwarfs/comet have visibility floors in compressed mode only.
    const base = bodyRadiusUnits(rec.body.radiusKm);
    rec.scaleR = (!view.trueScale && rec.isKepler)
      ? Math.max(base, rec.body.comet ? 0.12 : 0.22)
      : base;
    rec.spinEl.scale.setScalar(rec.scaleR);
  }
  bodiesByKey.sun.spinEl.scale.setScalar(view.trueScale ? trueRadius(696000) : 6);
  bodiesByKey.sun.scaleR = view.trueScale ? trueRadius(696000) : 6;
  for (const rec of Object.values(moonsByKey)) {
    rec.scaleR = bodyRadiusUnits(rec.moon.radiusKm);
    rec.spinEl.scale.setScalar(rec.scaleR);
    rec.orbitLine.visible = view.orbits;
  }
  for (const line of orbitLines) line.visible = view.orbits;
  for (const belt of beltGroups) belt.inst.visible = view.belts;
  labelsRoot.style.display = view.labels ? 'block' : 'none';
  if (constellationGroup) constellationGroup.visible = !!view.constellations;
  if (brightStarsGroup) brightStarsGroup.visible = !!view.brightStars;
  if (skyGridGroup) skyGridGroup.visible = !!view.grid;
  controls.minDistance = view.trueScale ? 0.02 : 8;
  for (const btn of toggleBtns) {
    if (btn.dataset.toggle) btn.classList.toggle('on', !!view[btn.dataset.toggle]);
  }
  try { localStorage.setItem('sol-toggles', JSON.stringify(view)); } catch { /* private mode */ }
}
toggleBtns.forEach((btn) => btn.addEventListener('click', () => {
  if (!btn.dataset.toggle) return; // info button handled separately
  view[btn.dataset.toggle] = !view[btn.dataset.toggle];
  applyToggles();
  if (btn.dataset.toggle === 'sound') onSoundToggle();
}));
try {
  const saved = JSON.parse(localStorage.getItem('sol-toggles') || 'null');
  if (saved) Object.assign(view, saved);
} catch { /* ignore */ }
applyToggles();
parseUrlParams();
refreshHud();

/* ================================================================== */
/* Starfield (from the Phase 2 scaffold)                               */
/* ================================================================== */
const milkyWay = textureLoader.load(
  W + '0/0e/Solarsystemscope_texture_2k_stars_milky_way.jpg'
);
milkyWay.colorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(SKYBOX_RADIUS, 48, 24),
  new THREE.MeshBasicMaterial({ map: milkyWay, side: THREE.BackSide })
));

const STAR_COUNT = lowPower ? STAR_COUNTS.low : STAR_COUNTS.high;
const starGeo = new THREE.BufferGeometry();
{
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = SKYBOX_RADIUS * 0.95;
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3]     = r * s * Math.cos(theta);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * s * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
}
const starMat = new THREE.PointsMaterial({
  color: 0xf2efe6, size: lowPower ? 18 : 14, sizeAttenuation: true, transparent: true, opacity: 0.9,
});
const starPoints = new THREE.Points(starGeo, starMat);
scene.add(starPoints);

/* ================================================================== */
/* CONSTELLATIONS — famous stick figures on the celestial sphere       */
/* ================================================================== */
constellationGroup = new THREE.Group();
constLabels = [];
{
  const R = SKYBOX_RADIUS * 0.94;
  const rad = (d) => d * Math.PI / 180;
  const radec = (rah, decd) => {
    const ra = rah * 15 * Math.PI / 180;
    const dec = rad(decd);
    return new THREE.Vector3(
      R * Math.cos(dec) * Math.cos(ra),
      R * Math.sin(dec),
      -R * Math.cos(dec) * Math.sin(ra)
    );
  };
  const CONSTELLATIONS = [
    { name: 'Orion', label:[5.6, 5], intro: 'The Hunter — marked by bright Betelgeuse and Rigel, with a belt of three stars in a row.',
      stars:[[5.9195,7.407],[5.4189,6.35],[5.5333,-0.299],[5.6036,-1.202],[5.6793,-1.943],[5.7959,-9.669],[5.2423,-8.202]],
      lines:[[0,2],[1,2],[2,3],[3,4],[4,5],[4,6],[3,6]] },
    { name: 'Ursa Major', label:[12.0,58], intro: 'The Great Bear — home of the Big Dipper, a pointer to the North Star.',
      stars:[[11.0621,61.751],[11.0307,56.382],[11.8972,53.695],[12.2571,57.033],[12.9005,55.96],[13.3988,54.925],[13.7924,49.313]],
      lines:[[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]] },
    { name: 'Ursa Minor', label:[15.2,78], intro: 'The Little Bear — its tail ends at Polaris, the North Star.',
      stars:[[2.5303,89.264],[17.5369,86.586],[16.2918,75.755],[15.7343,77.794],[15.3455,71.834],[16.7661,82.037],[14.8451,74.156]],
      lines:[[0,1],[1,5],[5,3],[3,2],[2,6],[6,4],[4,3]] },
    { name: 'Cassiopeia', label:[0.9,62], intro: 'The Queen — a distinctive W (or M) of bright stars in the northern sky.',
      stars:[[0.6751,56.537],[0.9451,60.717],[1.4303,60.235],[1.9102,63.67],[0.153,59.15]],
      lines:[[4,0],[0,1],[1,2],[2,3]] },
    { name: 'Scorpius', label:[16.9,-30], intro: 'The Scorpion — a hooked curve of stars with red Antares at its heart.',
      stars:[[16.4901,-26.432],[16.3531,-25.592],[16.0056,-22.622],[16.8361,-34.293],[17.5601,-37.104],[17.7081,-39.03],[17.7931,-37.043],[16.9098,-38.047]],
      lines:[[2,1],[1,0],[0,3],[3,7],[7,4],[4,5],[5,6]] },
    { name: 'Leo', label:[10.5,18], intro: 'The Lion — a sickle-shaped head and a triangle for its hindquarters.',
      stars:[[10.1395,11.967],[10.3328,19.842],[11.2351,20.523],[11.8177,14.572],[11.0621,15.43],[10.1222,23.417]],
      lines:[[0,4],[4,3],[3,2],[2,1],[1,5],[5,4]] },
    { name: 'Cygnus', label:[20.5,42], intro: 'The Swan — a great cross flying along the Milky Way, also called the Northern Cross.',
      stars:[[20.6905,45.28],[20.3705,40.257],[19.7496,45.131],[19.512,27.965],[21.2267,51.189]],
      lines:[[3,0],[2,0],[0,1],[0,4]] },
    { name: 'Lyra', label:[18.9,36], intro: 'The Lyre — a small harp anchored by Vega, one of the brightest stars.',
      stars:[[18.6156,38.784],[18.9824,32.69],[18.908,36.898],[18.7462,33.363]],
      lines:[[0,2],[2,1],[1,3],[3,0]] },
    { name: 'Aquila', label:[19.8,6], intro: 'The Eagle — with Altair at its center, soaring along the Milky Way.',
      stars:[[19.8464,8.868],[19.425,3.115],[19.771,10.614]],
      lines:[[1,0],[0,2]] },
    { name: 'Taurus', label:[4.6,18], intro: 'The Bull — marked by the V of the Hyades and the red star Aldebaran.',
      stars:[[4.5987,16.509],[4.4769,15.962],[4.3299,15.627],[3.7914,24.105],[5.4382,28.608]],
      lines:[[0,1],[1,2],[2,3],[0,4]] },
    { name: 'Gemini', label:[7.4,28], intro: 'The Twins — represented by the bright stars Castor and Pollux side by side.',
      stars:[[7.5767,31.888],[7.7553,28.026],[6.6285,16.399],[6.7322,25.131]],
      lines:[[2,3],[3,1],[1,0]] },
    { name: 'Canis Major', label:[6.8,-22], intro: 'The Great Dog — home to Sirius, the brightest star in Earth’s night sky.',
      stars:[[6.7525,-16.716],[6.9771,-28.972],[7.0636,-26.393],[7.1399,-29.303],[6.3783,-17.956]],
      lines:[[4,0],[0,1],[1,2],[2,3]] },
    { name: 'Crux', label:[12.4,-60], intro: 'The Southern Cross — a small, brilliant cross guiding travelers in southern skies.',
      stars:[[12.4433,-63.099],[12.7954,-59.689],[12.5194,-57.113],[12.6267,-60.401]],
      lines:[[0,2],[1,3]] },
    { name: 'Sagittarius', label:[18.7,-28], intro: 'The Archer — its “teapot” shape points toward the dense center of the Milky Way.',
      stars:[[18.9211,-26.297],[19.0435,-29.88],[18.4662,-34.384],[18.3499,-29.828],[18.0965,-30.424],[18.4029,-36.761]],
      lines:[[3,0],[0,1],[0,2],[2,5],[3,4],[4,2]] },
  ];

  const linePos = [];
  const constTooltip = document.getElementById('const-tooltip');
  function showConstTooltip(name, intro, x, y) {
    if (!constTooltip) return;
    constTooltip.innerHTML = `<b>${name}</b><br><span style="color:rgba(242,239,230,0.85)">${intro}</span>`;
    constTooltip.style.left = Math.min(x + 12, window.innerWidth - 260) + 'px';
    constTooltip.style.top = Math.min(y + 12, window.innerHeight - 80) + 'px';
    constTooltip.classList.add('show');
  }
  hideConstTooltip = () => { if (constTooltip) constTooltip.classList.remove('show'); }; // assigned to outer scope

  for (const c of CONSTELLATIONS) {
    const pts = c.stars.map(s => radec(s[0], s[1]));
    for (const [a,b] of c.lines) {
      linePos.push(pts[a].x, pts[a].y, pts[a].z, pts[b].x, pts[b].y, pts[b].z);
    }
    const lp = radec(c.label[0], c.label[1]);
    const el = document.createElement('div');
    el.className = 'const-label';
    el.textContent = c.name;
    el.style.display = 'none';
    el.addEventListener('mouseenter', (e) => showConstTooltip(c.name, c.intro, e.clientX, e.clientY));
    el.addEventListener('mousemove', (e) => showConstTooltip(c.name, c.intro, e.clientX, e.clientY));
    el.addEventListener('mouseleave', hideConstTooltip);
    el.addEventListener('click', (e) => { e.stopPropagation(); showConstTooltip(c.name, c.intro, e.clientX, e.clientY); });
    labelsRoot.appendChild(el);
    constLabels.push({ el, pos: lp });
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x8fa3bf, transparent: true, opacity: 0.22 });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  constellationGroup.add(lines);
  scene.add(constellationGroup);
}

/* ================================================================== */
/* BRIGHT STARS & SKY GRID                                             */
/* ================================================================== */
{
  const R = SKYBOX_RADIUS * 0.93;
  const rad = (d) => d * Math.PI / 180;
  const radec = (rah, decd) => {
    const ra = rah * 15 * Math.PI / 180;
    const dec = rad(decd);
    return new THREE.Vector3(R*Math.cos(dec)*Math.cos(ra), R*Math.sin(dec), -R*Math.cos(dec)*Math.sin(ra));
  };
  const eqToSceneDir = (v) => { // equatorial -> ecliptic-oriented scene (same obliquity basis)
    const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
    const y = c*v.y - s*v.z, z = s*v.y + c*v.z;
    return new THREE.Vector3(v.x, y, z);
  };
  const BRIGHT_STARS = [
    { name:'Sirius', ra:6.7525, dec:-16.716, info:'Brightest star in Earth’s night sky, in Canis Major.' },
    { name:'Canopus', ra:6.3992, dec:-52.696, info:'A brilliant southern star, second only to Sirius.' },
    { name:'Arcturus', ra:14.2610, dec:19.182, info:'An orange giant in Boötes, among the brightest northern stars.' },
    { name:'Vega', ra:18.6156, dec:38.784, info:'A bright blue-white star in Lyra, near the summer sky.' },
    { name:'Capella', ra:5.2782, dec:45.998, info:'A golden pair of giants dominating Auriga.' },
    { name:'Rigel', ra:5.2423, dec:-8.202, info:'Blue supergiant marking Orion’s foot.' },
    { name:'Procyon', ra:7.6550, dec:5.225, info:'The bright star of Canis Minor, near Orion.' },
    { name:'Betelgeuse', ra:5.9195, dec:7.407, info:'Red supergiant shoulder of Orion, vast and variable.' },
    { name:'Altair', ra:19.8464, dec:8.868, info:'Fast-spinning star at the heart of Aquila.' },
    { name:'Aldebaran', ra:4.5987, dec:16.509, info:'Fiery eye of Taurus, glowing orange-red.' },
    { name:'Antares', ra:16.4901, dec:-26.432, info:'Rival of Mars — a red supergiant in Scorpius.' },
    { name:'Spica', ra:13.4199, dec:-11.161, info:'Blue-white jewel of Virgo.' },
    { name:'Pollux', ra:7.7553, dec:28.026, info:'One of the twin stars of Gemini.' },
    { name:'Fomalhaut', ra:22.9608, dec:-29.622, info:'A solitary bright star in the southern autumn sky.' },
    { name:'Deneb', ra:20.6905, dec:45.280, info:'Tail of Cygnus, a distant luminous supergiant.' },
    { name:'Polaris', ra:2.5303, dec:89.264, info:'The North Star — near the north celestial pole, anchor of Ursa Minor.' },
  ];
  const constTooltip = document.getElementById('const-tooltip');
  function showTip(name, intro, x, y) {
    if (!constTooltip) return;
    constTooltip.innerHTML = `<b>${name}</b><br><span style="color:rgba(242,239,230,0.85)">${intro}</span>`;
    constTooltip.style.left = Math.min(x + 12, window.innerWidth - 260) + 'px';
    constTooltip.style.top = Math.min(y + 12, window.innerHeight - 80) + 'px';
    constTooltip.classList.add('show');
  }
  const starGeoPts = new THREE.BufferGeometry();
  const posArr = [];
  BRIGHT_STARS.forEach(s => {
    const pEq = radec(s.ra, s.dec);
    // keep in equatorial frame for consistency with constellations
    posArr.push(pEq.x, pEq.y, pEq.z);
    const el = document.createElement('div');
    el.className = 'const-label';
    el.style.color = 'rgba(242,239,230,0.7)';
    el.textContent = s.name;
    el.style.display = 'none';
    el.addEventListener('mouseenter', (e) => showTip(s.name, s.info, e.clientX, e.clientY));
    el.addEventListener('mousemove', (e) => showTip(s.name, s.info, e.clientX, e.clientY));
    el.addEventListener('mouseleave', hideConstTooltip);
    el.addEventListener('click', (e) => { e.stopPropagation(); showTip(s.name, s.info, e.clientX, e.clientY); });
    labelsRoot.appendChild(el);
    brightStarLabels.push({ el, pos: pEq });
  });
  starGeoPts.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  brightStarsGroup.add(new THREE.Points(starGeoPts, new THREE.PointsMaterial({ color: 0xffffff, size: 22, sizeAttenuation: true })));
  scene.add(brightStarsGroup);

  // Grid: celestial equator and ecliptic (great circles)
  function circleLine(radius, yFunc, color, opacity=0.18) {
    const pts = [];
    for (let i=0;i<=128;i++){ const a=i/128*Math.PI*2; const x=Math.cos(a), z=Math.sin(a); const y=yFunc?yFunc(a):0; pts.push(new THREE.Vector3(x*radius,y*radius,z*radius)); }
    const g=new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent:true, opacity }));
  }
  // Celestial equator in equatorial frame
  skyGridGroup.add(circleLine(R*0.92, ()=>0, 0x6aa7ff, 0.16));
  // Ecliptic: equator tilted by obliquity around X axis (approx in our coords)
  const eclPts=[]; for(let i=0;i<=128;i++){const a=i/128*Math.PI*2; const v=new THREE.Vector3(Math.cos(a),0,Math.sin(a)).applyAxisAngle(new THREE.Vector3(1,0,0), OBLIQUITY); eclPts.push(v.multiplyScalar(R*0.92)); }
  skyGridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(eclPts), new THREE.LineBasicMaterial({ color:0xd9b36a, transparent:true, opacity:0.16 })));
  scene.add(skyGridGroup);
}

function updateBrightStarLabels() {
  if (!view.brightStars) { for (const L of brightStarLabels) L.el.style.display = 'none'; return; }
  for (const L of brightStarLabels) {
    _proj.copy(L.pos).project(camera);
    if (_proj.z > 1 || _proj.z < -1) { L.el.style.display = 'none'; continue; }
    const x = (_proj.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_proj.y * 0.5 + 0.5) * window.innerHeight;
    if (x < -40 || x > window.innerWidth + 40 || y < -20 || y > window.innerHeight + 20) { L.el.style.display = 'none'; continue; }
    L.el.style.display = 'block'; L.el.style.left = x + 'px'; L.el.style.top = y + 'px';
  }
}

/* ================================================================== */
/* EPHEMERIS application — real positions every frame                  */
/* ================================================================== */
function updatePositions(simMs) {
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

/* ================================================================== */
/* TIME MACHINE                                                         */
/* ================================================================== */
const tmToggle = document.getElementById('tm-toggle');
const tmPanel = document.getElementById('time-machine');
const tmDate = document.getElementById('tm-date');
const tmGo = document.getElementById('tm-go');
const tmToday = document.getElementById('tm-today');
const tmNow = document.getElementById('tm-now');
const tmScrub = document.getElementById('tm-scrub');
const tmEvents = document.getElementById('tm-events');
let scrubBaseMs = Date.now();
const NOTABLE_EVENTS = [
  { label: 'Great Conjunction 2020 (Jup–Sat)', date: '2020-12-21' },
  { label: 'Mars opposition 2018', date: '2018-07-27' },
  { label: 'Jupiter opposition 2023', date: '2023-11-03' },
  { label: 'Saturn opposition 2024', date: '2024-09-08' },
  { label: 'Halley perihelion 1986', date: '1986-02-09' },
  { label: 'Voyager 2 at Neptune', date: '1989-08-25' },
  { label: 'Total solar eclipse 2017', date: '2017-08-21' },
];

function setSimDate(iso, pushUrl = true) {
  const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00Z' : ''));
  if (isNaN(d)) return;
  time.simMs = d.getTime();
  scrubBaseMs = time.simMs;
  if (tmScrub) tmScrub.value = 0;
  time.paused = true;
  refreshHud();
  if (pushUrl) {
    try { const u = new URL(location.href); u.searchParams.set('date', iso.slice(0,10)); history.replaceState(null,'',u); } catch {}
  }
}
tmToggle.addEventListener('click', () => tmPanel.classList.toggle('open'));
tmGo.addEventListener('click', () => { if (tmDate.value) setSimDate(tmDate.value); });
tmToday.addEventListener('click', () => { time.simMs = Date.now(); scrubBaseMs = time.simMs; if (tmScrub) tmScrub.value = 0; time.paused = false; refreshHud(); try { const u=new URL(location.href); u.searchParams.delete('date'); history.replaceState(null,'',u);} catch{} });
if (tmNow) tmNow.addEventListener('click', () => { time.simMs = Date.now(); scrubBaseMs = time.simMs; if (tmScrub) tmScrub.value = 0; time.paused = true; refreshHud(); try { const u=new URL(location.href); u.searchParams.delete('date'); history.replaceState(null,'',u);} catch{} });
if (tmScrub) tmScrub.addEventListener('input', () => {
  const days = parseInt(tmScrub.value, 10) || 0;
  time.simMs = scrubBaseMs + days * 86400000;
  time.paused = true;
  refreshHud();
});
NOTABLE_EVENTS.forEach(ev => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.textContent = ev.label;
  b.addEventListener('click', () => { tmDate.value = ev.date; setSimDate(ev.date); });
  tmEvents.appendChild(b);
});

/* ================================================================== */
/* SOUND — Web Audio ambience + arrival chime, mute by default         */
/* ================================================================== */
let audioCtx = null, ambience = null, masterGain = null;
function ensureAudio() {
  if (audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.0001;
  masterGain.connect(audioCtx.destination);

  // subtle drone: two detuned oscillators through slow filter sweep
  const o1 = audioCtx.createOscillator(), o2 = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  const f = audioCtx.createBiquadFilter();
  o1.type = 'sine'; o2.type = 'triangle';
  o1.frequency.value = 55; o2.frequency.value = 55.6;
  g.gain.value = 0.03;
  f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 0.7;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(masterGain);
  o1.start(); o2.start();
  // slow sweep
  const lfo = audioCtx.createOscillator(); const lfoG = audioCtx.createGain();
  lfo.frequency.value = 0.05; lfoG.gain.value = 80;
  lfo.connect(lfoG); lfoG.connect(f.frequency); lfo.start();
  ambience = { o1, o2, g, f };
}
function setAudioEnabled(on) {
  if (on) {
    ensureAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (masterGain) masterGain.gain.setTargetAtTime(0.12, audioCtx.currentTime, 0.3);
  } else if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.2);
  }
}
function playChime() {
  if (!view.sound || !audioCtx || !masterGain) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + 0.7);
}
function onSoundToggle() {
  setAudioEnabled(view.sound);
  if (view.sound) { try { localStorage.setItem('sol-toggles', JSON.stringify(view)); } catch {} }
}

/* ================================================================== */
/* INFO PANEL                                                           */
/* ================================================================== */
const infoPanel = document.getElementById('info-panel');
const infoClose = document.getElementById('info-close');
const btnInfo = document.getElementById('btn-info');
const btnReplay = document.getElementById('btn-replay');
btnInfo.addEventListener('click', () => infoPanel.classList.toggle('open'));
infoClose.addEventListener('click', () => infoPanel.classList.remove('open'));
// btnReplay wired after tour is defined

function showCustomCard({ name, type, stats = [], fact = '' }) {
  selected = null; follow = false; fly = null; setStripSelection(null);
  controls.zoomToCursor = true;
  factCardTarget = null;
  factName.textContent = name;
  factType.textContent = type || '';
  factStats.innerHTML = stats.map(([k,v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  factText.textContent = fact;
  factCard.classList.add('open');
  try { const u = new URL(location.href); u.searchParams.delete('body'); history.replaceState(null,'',u); } catch {}
}

const milkyWayPoint = document.getElementById('milkyway-point');
if (milkyWayPoint) {
  milkyWayPoint.addEventListener('click', () => {
    infoPanel.classList.remove('open');
    showCustomCard({
      name: 'The Milky Way',
      type: 'Galaxy',
      stats: [['Type', 'Barred spiral galaxy'], ['Stars', '~100–400 billion'], ['Our location', 'Orion Arm']],
      fact: 'Our home galaxy — a vast disk of stars, gas, and dust. The glowing band in the sky is its crowded plane seen from within; our solar system is a tiny speck in one of its spiral arms.'
    });
    controls.target.set(0,0,0);
    camera.position.set(0, 700, 2200);
  });
}

/* Guided chapters with step-through */
const CHAPTERS = [
  { id:'galaxy', title:'Our Galaxy', steps:[
      { caption:'We live inside the Milky Way — a spiral galaxy of hundreds of billions of stars.', run: () => { controls.target.set(0,0,0); camera.position.set(0,700,2200); showCustomCard({ name:'The Milky Way', type:'Galaxy', stats:[['Type','Barred spiral galaxy'],['Our location','Orion Arm']], fact:'The glowing band around you is our galaxy seen from within. The solar system is just one tiny neighborhood here.' }); } },
      { caption:'Use the Milky Way button anytime to return to this galaxy view.', run: () => { if (milkyWayPoint) milkyWayPoint.click(); } },
    ]},
  { id:'constellations', title:'Constellations', steps:[
      { caption:'Constellations are patterns we draw between stars to navigate and tell stories.', run: () => { view.constellations = true; applyToggles(); controls.target.set(0,0,0); camera.position.set(400,350,1400); showCustomCard({ name:'Constellations', type:'Sky patterns', stats:[['Shown','14 famous patterns']], fact:'Turn on Constellations and hover a name to read its story. Try finding Orion or the Southern Cross (Crux).' }); } },
      { caption:'Prompt: hover a constellation label — can you spot Orion’s belt of three stars?', run: () => { view.constellations = true; applyToggles(); } },
    ]},
  { id:'planets', title:'Solar System & Planets', steps:[
      { caption:'The Sun anchors eight planets, each on its own path and rhythm.', run: () => { resetHome(true); showCustomCard({ name:'The Solar System', type:'Planetary system', stats:[['Star','1 (Sun)'],['Planets','8']], fact:'Use the body strip or click any world to fly there. The time machine lets you see where they were on any date.' }); } },
      { caption:'Take the grand tour for a guided glide past every planet.', run: () => { infoPanel.classList.remove('open'); startTour(true); } },
    ]},
  { id:'moons', title:'Moons', steps:[
      { caption:'Moons are worlds of their own, orbiting planets.', run: () => { const t=selectableByKey['earth']; if(t) flyTo(t); } },
      { caption:'Jupiter’s Galilean moons — Io, Europa, Ganymede, Callisto — are easy to spot up close.', run: () => { const t=selectableByKey['jupiter']; if(t) flyTo(t); } },
      { caption:'Prompt: zoom near Saturn to find Titan, or Neptune to glimpse Triton.', run: () => { const t=selectableByKey['saturn']; if(t) flyTo(t); } },
    ]},
  { id:'dwarfs', title:'Dwarf Planets & Comets', steps:[
      { caption:'Dwarf planets and comets trace long, distant paths.', run: () => { const t=selectableByKey['ceres']; if(t) flyTo(t); } },
      { caption:'Halley’s comet grows a tail near the Sun — jump to 1986 in the time machine to see it blaze.', run: () => { setSimDate('1986-02-09'); const t=selectableByKey['halley']; if(t) flyTo(t); } },
    ]},
];
let activeChapter = null; // { idx, step }
function renderChapters() {
  const list = document.getElementById('chapters-list');
  if (!list) return;
  list.innerHTML = '';
  if (activeChapter) {
    const ch = CHAPTERS[activeChapter.idx];
    const step = ch.steps[activeChapter.step];
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div style="font-size:12px;color:var(--accent);margin-bottom:4px">${ch.title} — step ${activeChapter.step+1}/${ch.steps.length}</div>
      <div style="font-size:12px;color:rgba(242,239,230,0.9);line-height:1.4;margin-bottom:8px">${step.caption}</div>`;
    const row = document.createElement('div'); row.style.display='flex'; row.style.gap='6px';
    const back = document.createElement('button'); back.className='chip'; back.textContent='Back';
    back.disabled = activeChapter.step === 0;
    back.onclick = () => { activeChapter.step--; runChapterStep(); };
    const next = document.createElement('button'); next.className='chip'; next.textContent = activeChapter.step < ch.steps.length-1 ? 'Next' : 'Finish';
    next.onclick = () => { if (activeChapter.step < ch.steps.length-1) { activeChapter.step++; runChapterStep(); } else { activeChapter = null; renderChapters(); } };
    const exit = document.createElement('button'); exit.className='chip'; exit.textContent='Chapters';
    exit.onclick = () => { activeChapter = null; renderChapters(); };
    row.append(back,next,exit); wrap.appendChild(row); list.appendChild(wrap);
    return;
  }
  CHAPTERS.forEach((ch, idx) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.style.textAlign = 'left';
    b.textContent = ch.title;
    b.addEventListener('click', () => { activeChapter = { idx, step: 0 }; infoPanel.classList.remove('open'); runChapterStep(); });
    list.appendChild(b);
  });
}
function runChapterStep() {
  if (!activeChapter) return;
  const ch = CHAPTERS[activeChapter.idx];
  const step = ch.steps[activeChapter.step];
  try { step.run(); } catch(e) { console.warn(e); }
  infoPanel.classList.add('open'); // keep panel open to show progress
  renderChapters();
}
renderChapters();

/* ================================================================== */
/* INTERACTION — selection, fly-to/follow, facts, strip, keyboard, URL */
/* ================================================================== */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const _wp = new THREE.Vector3();
const _wp2 = new THREE.Vector3();
const _dir = new THREE.Vector3();

const factCard = document.getElementById('fact-card');
const factName = document.getElementById('fact-name');
const factType = document.getElementById('fact-type');
const factStats = document.getElementById('fact-stats');
const factText = document.getElementById('fact-text');
const factClose = document.getElementById('fact-close');
const bodyStrip = document.getElementById('body-strip');

// Build selectable list: all planets+sun, moons, dwarfs/comet
const selectables = [];
function addSelectable(key, rec, body, kind) {
  const s = {
    key, rec, body, kind,
    name: body.name,
    type: body.type || (body.sun ? 'Star' : kind),
    diameterKm: body.radiusKm * 2,
    dayH: body.rotH,
    yearD: body.periodD || null,
    fact: body.fact || '',
    color: body.color || 0xcccccc,
  };
  rec.selectable = s;
  selectables.push(s);
  rec.mesh.userData.selectable = s;
}
for (const b of BODIES) addSelectable(b.key, bodiesByKey[b.key], b, b.sun ? 'star' : 'planet');
for (const m of MOONS) addSelectable(m.key, moonsByKey[m.key], m, 'moon');
for (const k of KEPLER_BODIES) addSelectable(k.key, bodiesByKey[k.key], k, k.comet ? 'comet' : 'dwarf');

const selectableByKey = Object.fromEntries(selectables.map(s => [s.key, s]));
// Major bodies for strip and arrow stepping: Sun + 8 planets
const majorKeys = ['sun','mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'];

function bodyWorldPos(s, out) {
  s.rec.group.getWorldPosition(out);
  return out;
}
function bodyDisplayRadius(s) {
  // world-ish scale: rec.scaleR is local spinEl scale (mesh radius 1)
  return s.rec.scaleR || bodyRadiusUnits(s.body.radiusKm);
}

let selected = null;
let follow = false;
let fly = null; // { fromPos, toPos, fromTarget, toTarget, t0, dur }
let factCardTarget = null;

function auDist(a, b) { return a.distanceTo(b) / AU_UNITS; }
function compareEarth(s) {
  if (s.key === 'earth') return '1× Earth diameter';
  const r = (s.diameterKm / 12742);
  if (r >= 1) return r.toFixed(r >= 10 ? 1 : 2) + '× Earth diameter';
  return (1/r).toFixed(r < 0.1 ? 0 : 1) + '× smaller than Earth';
}
function buildFactStats(s) {
  const stats = [
    ['Diameter', fmtDiameter(s.diameterKm)],
    ['Day length', fmtDay(s.dayH || 0)],
    ['Year length', fmtYear(s.yearD)],
    ['Vs Earth', compareEarth(s)],
  ];
  // dynamic distances
  bodyWorldPos(s, _wp);
  if (s.key !== 'sun') {
    const sun = bodiesByKey.sun.group.position; // origin
    stats.push(['From Sun', auDist(_wp, sun).toFixed(2) + ' AU']);
  }
  if (s.key !== 'earth' && bodiesByKey.earth) {
    bodiesByKey.earth.group.getWorldPosition(_wp2);
    stats.push(['From Earth', auDist(_wp, _wp2).toFixed(2) + ' AU']);
  }
  return stats;
}
function renderFactStats(stats) {
  factStats.innerHTML = stats.map(([k,v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}
function openFactCard(s) {
  factCardTarget = s;
  factName.textContent = s.name;
  factType.textContent = s.type;
  renderFactStats(buildFactStats(s));
  factText.textContent = s.fact;
  factCard.classList.add('open');
}
function updateFactCardLive() {
  if (!factCard.classList.contains('open') || !factCardTarget) return;
  renderFactStats(buildFactStats(factCardTarget));
}
function closeFactCard() {
  factCard.classList.remove('open');
  factCardTarget = null;
}

function setStripSelection(key) {
  bodyStrip.querySelectorAll('.strip-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.key === key);
  });
}

function deselect() {
  selected = null;
  follow = false;
  fly = null;
  controls.zoomToCursor = true; // back to cursor-anchored free zoom
  closeFactCard();
  setStripSelection(null);
  // keep camera where it is, just stop following
  try {
    const u = new URL(location.href);
    u.searchParams.delete('body');
    history.replaceState(null, '', u);
  } catch {}
}

function flyTo(s, immediate = false) {
  selected = s;
  follow = false;
  controls.zoomToCursor = false; // keep zoom centred on the selected body
  openFactCard(s);
  setStripSelection(s.key);
  try {
    const u = new URL(location.href);
    u.searchParams.set('body', s.key);
    history.replaceState(null, '', u);
  } catch {}

  bodyWorldPos(s, _wp);
  const r = bodyDisplayRadius(s);
  // smarter framing: rings, moon systems, tiny bodies
  let frame = r;
  if (s.key === 'saturn') frame = Math.max(frame, r * 2.4);
  if (s.kind === 'planet') {
    // include nearby moons in view a bit
    const hasMoons = MOONS.some(m => m.parent === s.key);
    if (hasMoons) frame = Math.max(frame, r * 1.8);
  }
  if (s.kind === 'moon') frame = Math.max(frame, r * 1.4);
  if (s.kind === 'comet') frame = Math.max(frame, 0.6);
  const minDist = view.trueScale ? frame * 10 : 10;
  const dist = Math.max(frame * 4.8, minDist);
  // approach from current camera direction relative to body
  _dir.copy(camera.position).sub(_wp);
  if (_dir.lengthSq() < 1e-6) _dir.set(0, 0.3, 1);
  _dir.normalize();
  const toTarget = _wp.clone();
  const toPos = _wp.clone().addScaledVector(_dir, dist);
  toPos.y += dist * 0.2;

  if (immediate) {
    controls.target.copy(toTarget);
    camera.position.copy(toPos);
    fly = null;
    follow = true;
  } else {
    fly = {
      fromPos: camera.position.clone(),
      toPos,
      fromTarget: controls.target.clone(),
      toTarget,
      t0: performance.now(),
      dur: 1200,
    };
  }
}

factClose.addEventListener('click', () => deselect());

// Body strip (major bodies)
for (const key of majorKeys) {
  const s = selectableByKey[key];
  if (!s) continue;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'strip-item';
  btn.dataset.key = key;
  btn.innerHTML = `<span class="strip-dot" style="background:#${s.color.toString(16).padStart(6,'0')}"></span><span class="strip-name">${s.name}</span>`;
  btn.addEventListener('click', () => flyTo(s));
  bodyStrip.appendChild(btn);
}

// Drag guard + picking + hover highlight
let down = null;
let hovered = null;

function setHover(s) {
  if (hovered === s) return;
  if (hovered && hovered.rec && hovered.rec.mat && hovered.rec.mat.emissive) {
    hovered.rec.mat.emissive.setHex(hovered._origEmissive || 0x000000);
    hovered.rec.mat.emissiveIntensity = hovered._origEmissiveI || 0;
  }
  hovered = s || null;
  if (hovered && hovered.rec && hovered.rec.mat && hovered.rec.mat.emissive) {
    hovered._origEmissive = hovered.rec.mat.emissive.getHex();
    hovered._origEmissiveI = hovered.rec.mat.emissiveIntensity || 0;
    hovered.rec.mat.emissive.setHex(0x333333);
    hovered.rec.mat.emissiveIntensity = 0.35;
  }
  canvas.style.cursor = hovered ? 'pointer' : '';
}

canvas.addEventListener('pointermove', (e) => {
  if (down) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(selectables.map(s => s.rec.mesh), false);
  setHover(hits.length ? hits[0].object.userData.selectable : null);
});
canvas.addEventListener('pointerleave', () => setHover(null));
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  setHover(null);
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || down.id !== e.pointerId) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  down = null;
  if (dx*dx + dy*dy > DRAG_PX*DRAG_PX) return; // drag, not tap
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const meshes = selectables.map(s => s.rec.mesh);
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length) {
    const s = hits[0].object.userData.selectable;
    if (s) flyTo(s);
  }
});
canvas.addEventListener('pointercancel', () => { down = null; });

// Keyboard
function stepSelection(dir) {
  const list = majorKeys;
  let idx = selected ? list.indexOf(selected.key) : -1;
  if (idx === -1) idx = dir > 0 ? 0 : list.length - 1;
  else idx = (idx + dir + list.length) % list.length;
  flyTo(selectableByKey[list[idx]]);
}
window.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(time); refreshHud(); }
  else if (e.code === 'Escape') {
    if (infoPanel.classList.contains('open')) infoPanel.classList.remove('open');
    else if (selected) deselect();
    else resetHome(false);
  }
  else if (e.code === 'ArrowRight') { e.preventDefault(); stepSelection(1); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); stepSelection(-1); }
  else if (e.key === 'l' || e.key === 'L') { view.labels = !view.labels; applyToggles(); }
  else if (e.key === 'o' || e.key === 'O') { view.orbits = !view.orbits; applyToggles(); }
  else if (e.key === 'h' || e.key === 'H') { resetHome(false); }
});

// URL params: ?body=, ?tour=0 (tour handled in Phase 6), ?date= already parsed
let pendingBody = null;
{
  const p = new URLSearchParams(location.search);
  const body = p.get('body');
  if (body) pendingBody = body.toLowerCase();
  // ?tour=0 acknowledged (grand tour is Phase 6)
}

function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }
function easeInOutQuint(t) { return t < 0.5 ? 16*t*t*t*t*t : 1 - Math.pow(-2*t + 2, 5) / 2; }

function resetHome(immediate = false) {
  if (tour) { stopTour(true); return; }
  selected = null; follow = false; fly = null; closeFactCard(); setStripSelection(null);
  controls.zoomToCursor = true;
  try { const u = new URL(location.href); u.searchParams.delete('body'); history.replaceState(null,'',u); } catch {}
  if (immediate) {
    controls.target.set(0,0,0);
    camera.position.set(0, 420, 1450);
  } else {
    fly = {
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(0, 420, 1450),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(0,0,0),
      t0: performance.now(),
      dur: 1100,
      home: true,
    };
  }
}

function updateInteraction() {
  // Follow moving body: translate camera by body's movement to keep relative view
  if (follow && selected && !fly) {
    bodyWorldPos(selected, _wp);
    _dir.copy(_wp).sub(controls.target);
    if (_dir.lengthSq() > 0) {
      controls.target.add(_dir);
      camera.position.add(_dir);
    }
  }
  // Fly animation
  if (fly) {
    const t = Math.min(1, (performance.now() - fly.t0) / fly.dur);
    const k = fly.home ? easeInOutCubic(t) : easeInOutQuint(t);
    controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
    camera.position.lerpVectors(fly.fromPos, fly.toPos, k);
    // keep target tracking body as it moves during flight
    if (selected && !fly.home) {
      bodyWorldPos(selected, _wp);
      const drift = _wp.clone().sub(fly.toTarget);
      fly.toTarget.add(drift);
      controls.target.add(drift.multiplyScalar(k * 0.15));
    }
    if (t >= 1) {
      const wasHome = !!fly.home;
      fly = null;
      if (wasHome) { follow = false; }
      else { follow = true; playChime(); }
    }
  }
}

/* ================================================================== */
/* GRAND TOUR — cinematic intro, skippable and replayable               */
/* ================================================================== */
const introEl = document.getElementById('intro');
const introNarration = document.getElementById('intro-narration');
const introSkip = document.getElementById('intro-skip');
let tour = null;

const TOUR_STOPS = [
  { type: 'intro', line: 'Inside the Milky Way — our home galaxy, a sea of hundreds of billions of stars.',
    cam: () => ({ toPos: new THREE.Vector3(0, 900, 2600), toT: new THREE.Vector3(0,0,0) }), dur: 3800, hold: 3200 },
  { type: 'constellations', line: 'Constellations — patterns we draw in the stars to tell stories and find our way.',
    cam: () => ({ toPos: new THREE.Vector3(400, 350, 1400), toT: new THREE.Vector3(0,0,0) }), dur: 3200, hold: 3400, showConstellations: true },
  { key: 'neptune', line: 'Neptune — a blue world of supersonic winds at the edge of the planets.' },
  { key: 'uranus',  line: 'Uranus — an ice giant tipped on its side, rolling through the dark.' },
  { key: 'saturn',  line: 'Saturn — crowned with rings of ice and stone.' },
  { key: 'jupiter', line: 'Jupiter — a storm-wrapped giant that shepherds its many moons.' },
  { key: 'mars',    line: 'Mars — a cold desert with the tallest volcano we know.' },
  { key: 'earth',   line: 'Earth — a small blue world, bright with water and cloud.' },
  { key: 'venus',   line: 'Venus — veiled in acid clouds, hotter than Mercury.' },
  { key: 'mercury', line: 'Mercury — a scorched, cratered rock racing close to the Sun.' },
  { key: 'sun',     line: 'The Sun — the star that holds this whole clockwork together.' },
];

function tourCamFor(stopOrKey) {
  const key = typeof stopOrKey === 'string' ? stopOrKey : stopOrKey.key;
  if (key) {
    const s = selectableByKey[key];
    bodyWorldPos(s, _wp);
    const r = bodyDisplayRadius(s);
    const dist = Math.max(r * 5.5, key === 'sun' ? 40 : 14);
    const ang = (key === 'sun') ? 0.6 : 0.8;
    const toPos = _wp.clone().add(new THREE.Vector3(Math.sin(ang)*dist, dist*0.35, Math.cos(ang)*dist));
    return { toPos, toT: _wp.clone() };
  }
  return stopOrKey.cam();
}

function showNarration(text) {
  introNarration.textContent = text || '';
  introNarration.classList.toggle('show', !!text);
}

let toastTimer = null;
function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function restoreTourConsts() {
  if (tour && tour.prevConstellations !== undefined) {
    view.constellations = tour.prevConstellations;
    if (constellationGroup) constellationGroup.visible = !!view.constellations;
    applyToggles();
  }
}

function stopTour(toFree = true) {
  if (!tour) return;
  restoreTourConsts();
  tour = null;
  introEl.classList.remove('open');
  introSkip.classList.remove('show');
  showNarration('');
  controls.enabled = true;
  if (toFree) {
    selected = null; follow = false; fly = null; closeFactCard(); setStripSelection(null);
    controls.zoomToCursor = true;
    controls.target.set(0,0,0);
    camera.position.set(0, 420, 1450);
  }
}

function cancelTour() { if (tour) { stopTour(true); } }

function startTour(fromReplay = false) {
  deselect();
  tour = { phase: 'title', idx: 0, t0: performance.now(), titleUntil: performance.now() + 3200,
           prevConstellations: view.constellations };
  controls.enabled = false;
  introEl.classList.add('open');
  introSkip.classList.add('show');
  showNarration('');
  const ne = selectableByKey['neptune']; bodyWorldPos(ne, _wp);
  camera.position.set(_wp.x + 120, _wp.y + 80, _wp.z + 260);
  controls.target.copy(_wp);
}

function beginTourStop(idx) {
  if (!tour) return;
  tour.idx = idx;
  // manage constellation overlay for tour steps
  const stop = TOUR_STOPS[idx];
  if (stop && stop.showConstellations) {
    view.constellations = true;
    if (constellationGroup) constellationGroup.visible = true;
  } else if (tour.prevConstellations !== undefined) {
    // keep restored state except during special step
    view.constellations = tour.prevConstellations;
    if (constellationGroup) constellationGroup.visible = !!view.constellations;
  }

  if (idx >= TOUR_STOPS.length) {
    tour.phase = 'ending';
    tour.t0 = performance.now();
    tour.dur = 2600;
    tour.fromPos = camera.position.clone();
    tour.fromT = controls.target.clone();
    tour.toPos = new THREE.Vector3(0, 420, 1450);
    tour.toT = new THREE.Vector3(0,0,0);
    showNarration('');
    return;
  }
  const cam = tourCamFor(stop);
  tour.phase = 'move';
  tour.t0 = performance.now();
  tour.dur = stop.dur || 3600;
  tour.holdDur = stop.hold || 2600;
  tour.fromPos = camera.position.clone();
  tour.fromT = controls.target.clone();
  tour.toPos = cam.toPos.clone ? cam.toPos.clone() : new THREE.Vector3().copy(cam.toPos);
  tour.toT = cam.toT.clone ? cam.toT.clone() : new THREE.Vector3().copy(cam.toT);
  showNarration(stop.line);
}

function updateTour(now) {
  if (!tour) return;
  if (tour.phase === 'title') {
    if (now >= tour.titleUntil) {
      introEl.classList.remove('open');
      beginTourStop(0);
    }
    return;
  }
  const stop = TOUR_STOPS[tour.idx];
  if (tour.phase === 'move' || tour.phase === 'ending') {
    const t = Math.min(1, (now - tour.t0) / tour.dur);
    const k = easeInOutCubic(t);
    if (tour.phase === 'move' && stop && stop.key) {
      const cam = tourCamFor(stop);
      tour.toPos.copy(cam.toPos);
      tour.toT.copy(cam.toT);
    }
    camera.position.lerpVectors(tour.fromPos, tour.toPos, k);
    controls.target.lerpVectors(tour.fromT, tour.toT, k);
    if (t >= 1) {
      if (tour.phase === 'ending') { stopTour(true); }
      else { tour.phase = 'hold'; tour.t0 = now; tour.holdUntil = now + (tour.holdDur || 2600); }
    }
    return;
  }
  if (tour.phase === 'hold') {
    if (stop && stop.key) {
      const cam = tourCamFor(stop);
      camera.position.lerp(cam.toPos, 0.04);
      controls.target.lerp(cam.toT, 0.08);
    }
    if (now >= tour.holdUntil) beginTourStop(tour.idx + 1);
  }
}

introSkip.addEventListener('click', (e) => { e.stopPropagation(); cancelTour(); });
// Any input cancels tour (but let skip/title tap be handled)
['pointerdown','wheel','keydown','touchstart'].forEach(ev => {
  window.addEventListener(ev, (e) => {
    if (!tour) return;
    if (ev === 'pointerdown' && (e.target === introSkip || introSkip.contains(e.target))) return;
    // tapping title card also skips/starts exploration
    cancelTour();
  }, { passive: true });
});
btnReplay.addEventListener('click', () => { infoPanel.classList.remove('open'); startTour(true); });
const btnHome = document.getElementById('btn-home');
if (btnHome) btnHome.addEventListener('click', () => resetHome(false));

// double-click empty space to reset view
canvas.addEventListener('dblclick', (e) => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(selectables.map(s => s.rec.mesh), false);
  if (!hits.length) resetHome(false);
});

// Start tour on first open unless ?tour=0 or ?body specified
{
  const p = new URLSearchParams(location.search);
  const noTour = p.get('tour') === '0' || p.has('body');
  // defer to after first positions are ready
  if (!noTour) {
    // mark pending start; will trigger once sim positioned
    window.__startTourPending = true;
  } else {
    introSkip.classList.remove('show');
  }
}

/* ================================================================== */
/* Sanity log — verified against published values at build time        */
/* ================================================================== */
try {
  const date = new Date(time.simMs);
  for (const key of ['Earth', 'Mars', 'Jupiter']) {
    const v = helioVector(key.toLowerCase(), date);
    const r = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    const e = eqToEct(v);
    const lat = Math.asin(e.z / r) * 180 / Math.PI; // e.z = ecliptic-north component
    console.info(`[solar-system] ${key}: |r| = ${r.toFixed(3)} AU, ecliptic lat = ${lat.toFixed(2)}°`);
  }
  for (const el of KEPLER_BODIES) {
    const p = keplerScenePos(el, time.simMs);
    const rAU = Math.hypot(p.x, p.y, p.z) / AU_UNITS;
    console.info(`[solar-system] ${el.name}: |r| = ${rAU.toFixed(2)} AU (Kepler)`);
  }
} catch (err) {
  console.warn('[solar-system] ephemeris module failed:', err);
}

/* ================================================================== */
/* Animation loop — advance sim clock, then positions, then spin       */
/* ================================================================== */
let lastReal = performance.now();
let hidden = document.hidden;
let frameCount = 0;
let soundHintShown = false;
document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  lastReal = performance.now();
});
// subtle one-time hint: sound is mute by default
window.addEventListener('pointerdown', () => {
  if (soundHintShown || view.sound) return;
  soundHintShown = true;
  // only hint if not during tour title (tour handles its own UX)
  if (!tour) showToast('Sound is off — tap Sound to enable');
}, { once: true, passive: true });

renderer.setAnimationLoop(() => {
  if (hidden) return; // pause when tab hidden (saves CPU/GPU)
  frameCount++;
  const now = performance.now();
  const dt = clampDt((now - lastReal) / 1000); // clamp tab-restore jumps
  lastReal = now;

  const running = !time.paused;
  advanceClock(time, dt);
  if (running) {
    for (const belt of beltGroups) belt.dirty = true;
  }

  updatePositions(time.simMs);
  if (window.__startTourPending) { window.__startTourPending = false; startTour(false); }
  if (pendingBody) {
    const s = selectableByKey[pendingBody];
    pendingBody = null;
    if (s) flyTo(s, true);
  }
  updateBelts(time.simMs);
  dateReadout.textContent = formatUtc(time.simMs);
  if (frameCount % 10 === 0) updateFactCardLive(); // distances change slowly
  // throttle label work on low-power devices
  if (!lowPower || (frameCount % 2 === 0)) {
    updateLabels();
    updateConstellationLabels();
    updateBrightStarLabels();
  }
  if (tour) updateTour(performance.now());
  else updateInteraction();

  // Spin from the *simulated* delta so pause truly freezes the worlds.
  const deltaH = (time.simMs - time.prevSimMs) / 3.6e6;
  for (const rec of Object.values(bodiesByKey)) {
    rec.mesh.rotation.y += (deltaH / rec.body.rotH) * Math.PI * 2;
  }

  controls.update();
  renderer.render(scene, camera);
});
