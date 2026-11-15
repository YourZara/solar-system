import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { SPEEDS, AU_UNITS, DRAG_PX } from './src/config.js';
import {
  time, view, sel, lowPower, qualityScale,
  parseUrlParams, bodyRadiusUnits, moonOrbitUnits,
} from './src/state.js';
import { BODIES, MOONS, KEPLER_BODIES } from './src/data/bodies.js';
import { eqToEct, formatUtc } from './src/astronomy/coordinates.js';
import { keplerScenePos } from './src/astronomy/kepler.js';
import { helioVector } from './src/astronomy/ephemeris.js';
import { initBodies, bodiesByKey, moonsByKey } from './src/scene/bodies.js';
import { initStructures, updateBelts, beltGroups, orbitLines } from './src/scene/structures.js';
import { labelsRoot, initLabels, updateLabels } from './src/scene/labels.js';
import {
  initSky, constellationGroup, brightStarsGroup, skyGridGroup,
  updateConstellationLabels, updateBrightStarLabels,
} from './src/scene/sky.js';
import { clampDt, advanceClock, changeSpeed, togglePause } from './src/systems/time.js';
import { playChime, onSoundToggle } from './src/audio.js';

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
initLabels();
initSky({ scene, textureLoader, labelsRoot });

/* ================================================================== */
/* Toggles (labels / orbits / true scale / belts), remembered          */
/* ================================================================== */
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
  sel.current = null; sel.follow = false; sel.fly = null; setStripSelection(null);
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
  sel.current = null;
  sel.follow = false;
  sel.fly = null;
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
  sel.current = s;
  sel.follow = false;
  controls.zoomToCursor = false; // keep zoom centred on the sel.current body
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
    sel.fly = null;
    sel.follow = true;
  } else {
    sel.fly = {
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
  let idx = sel.current ? list.indexOf(sel.current.key) : -1;
  if (idx === -1) idx = dir > 0 ? 0 : list.length - 1;
  else idx = (idx + dir + list.length) % list.length;
  flyTo(selectableByKey[list[idx]]);
}
window.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(time); refreshHud(); }
  else if (e.code === 'Escape') {
    if (infoPanel.classList.contains('open')) infoPanel.classList.remove('open');
    else if (sel.current) deselect();
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
  sel.current = null; sel.follow = false; sel.fly = null; closeFactCard(); setStripSelection(null);
  controls.zoomToCursor = true;
  try { const u = new URL(location.href); u.searchParams.delete('body'); history.replaceState(null,'',u); } catch {}
  if (immediate) {
    controls.target.set(0,0,0);
    camera.position.set(0, 420, 1450);
  } else {
    sel.fly = {
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
  if (sel.follow && sel.current && !sel.fly) {
    bodyWorldPos(sel.current, _wp);
    _dir.copy(_wp).sub(controls.target);
    if (_dir.lengthSq() > 0) {
      controls.target.add(_dir);
      camera.position.add(_dir);
    }
  }
  // Fly animation
  if (sel.fly) {
    const t = Math.min(1, (performance.now() - sel.fly.t0) / sel.fly.dur);
    const k = sel.fly.home ? easeInOutCubic(t) : easeInOutQuint(t);
    controls.target.lerpVectors(sel.fly.fromTarget, sel.fly.toTarget, k);
    camera.position.lerpVectors(sel.fly.fromPos, sel.fly.toPos, k);
    // keep target tracking body as it moves during flight
    if (sel.current && !sel.fly.home) {
      bodyWorldPos(sel.current, _wp);
      const drift = _wp.clone().sub(sel.fly.toTarget);
      sel.fly.toTarget.add(drift);
      controls.target.add(drift.multiplyScalar(k * 0.15));
    }
    if (t >= 1) {
      const wasHome = !!sel.fly.home;
      sel.fly = null;
      if (wasHome) { sel.follow = false; }
      else { sel.follow = true; playChime(); }
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
    sel.current = null; sel.follow = false; sel.fly = null; closeFactCard(); setStripSelection(null);
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
    updateLabels(camera);
    updateConstellationLabels(camera);
    updateBrightStarLabels(camera);
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
