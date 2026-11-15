import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { SPEEDS, AU_UNITS } from './src/config.js';
import {
  time, view, lowPower, qualityScale,
  parseUrlParams, bodyRadiusUnits,
} from './src/state.js';
import { KEPLER_BODIES } from './src/data/bodies.js';
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
import { ctx } from './src/ctx.js';
import {
  initInteraction, updateInteraction,
  flyTo, resetHome, showCustomCard, updateFactCardLive,
  selectableByKey, consumePendingBody,
} from './src/systems/interaction.js';
import {
  initTour, startTour, stopTour, updateTour, isTouring, consumePendingTour,
} from './src/systems/tour.js';
import { showToast } from './src/ui/toast.js';

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
btnReplay.addEventListener('click', () => { infoPanel.classList.remove('open'); startTour(true); });

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
/* Wiring — hand the live camera and controls to the layers            */
/* ================================================================== */
initInteraction({ camera, controls, canvas });
initTour({ camera, controls });
Object.assign(ctx, {
  isTouring,
  startTour,
  stopTour,
  refreshHud,
  applyToggles,
  isInfoPanelOpen: () => infoPanel.classList.contains('open'),
  closeInfoPanel: () => infoPanel.classList.remove('open'),
});

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
  if (!isTouring()) showToast('Sound is off — tap Sound to enable');
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
  if (consumePendingTour()) startTour(false);
  const pendingBody = consumePendingBody();
  if (pendingBody) {
    const s = selectableByKey[pendingBody];
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
  if (isTouring()) updateTour(performance.now());
  else updateInteraction();

  // Spin from the *simulated* delta so pause truly freezes the worlds.
  const deltaH = (time.simMs - time.prevSimMs) / 3.6e6;
  for (const rec of Object.values(bodiesByKey)) {
    rec.mesh.rotation.y += (deltaH / rec.body.rotH) * Math.PI * 2;
  }

  controls.update();
  renderer.render(scene, camera);
});
