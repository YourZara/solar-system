import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { W, SPEEDS, AU_UNITS, SKYBOX_RADIUS, STAR_COUNTS, DRAG_PX,
         compressedRadius, trueRadius } from './src/config.js';
import {
  time, view, isCoarse, lowPower, qualityScale,
  parseUrlParams, bodyRadiusUnits, moonOrbitUnits,
} from './src/state.js';
import { BODIES, MOONS, KEPLER_BODIES } from './src/data/bodies.js';
import { CONSTELLATIONS, BRIGHT_STARS } from './src/data/sky.js';
import {
  J2000_MS, OBLIQUITY, daysSinceJ2000, eqToEct, toScene, formatUtc,
} from './src/astronomy/coordinates.js';
import { keplerScenePos, keplerScenePosFromE } from './src/astronomy/kepler.js';
import { helioVector, geoMoon } from './src/astronomy/ephemeris.js';
import { initBodies, bodiesByKey, moonsByKey } from './src/scene/bodies.js';
import { initStructures, updateBelts, beltGroups, orbitLines } from './src/scene/structures.js';
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
/* SCENE — light, sun, planets, moons, rings (see src/scene/)          */
/* ================================================================== */
const { updatePositions } = initBodies({ scene, textureLoader, renderer });
initStructures({ scene, textureLoader });

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
