/* ================================================================== */
/* main — the entry point.                                             */
/*                                                                     */
/* Boot order matters and is the only thing this file really does:     */
/*   renderer/camera -> scene geometry -> UI -> interaction -> ctx.    */
/* The UI needs body records to exist before it can apply the saved    */
/* toggles; interaction needs the camera; and the ctx object can only  */
/* be filled once every module that reads it has been defined.         */
/* ================================================================== */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { AU_UNITS } from './config.js';
import { time, view, lowPower, qualityScale, parseUrlParams } from './state.js';
import { KEPLER_BODIES } from './data/bodies.js';
import { eqToEct } from './astronomy/coordinates.js';
import { keplerScenePos } from './astronomy/kepler.js';
import { helioVector } from './astronomy/ephemeris.js';
import { initBodies, bodiesByKey } from './scene/bodies.js';
import { initStructures, updateBelts, beltGroups } from './scene/structures.js';
import { initLabels, updateLabels } from './scene/labels.js';
import { initSky, updateConstellationLabels, updateBrightStarLabels } from './scene/sky.js';
import { initStarPaths, toggleStarPath, updateStarMarkers } from './scene/star-paths.js';
import { clampDt, advanceClock } from './systems/time.js';
import {
  initInteraction, updateInteraction,
  flyTo, updateFactCardLive, selectableByKey, consumePendingBody,
} from './systems/interaction.js';
import {
  initTour, startTour, stopTour, updateTour, isTouring, consumePendingTour,
} from './systems/tour.js';
import {
  initHud, applyToggles, refreshHud, updateDateReadout, isInfoPanelOpen, closeInfoPanel,
  toggleInfoPanel,
} from './ui/hud.js';
import { initTimeMachine, setSimDate } from './ui/time-machine.js';
import { initChapters } from './ui/chapters.js';
import { initScreenshot, takePendingShot, requestShot } from './ui/screenshot.js';
import { initTrails, recordTrails } from './systems/trails.js';
import { showToast } from './ui/toast.js';
import { ctx } from './ctx.js';

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
  canvas, antialias: !lowPower, logarithmicDepthBuffer: true,
  powerPreference: lowPower ? 'low-power' : 'high-performance',
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
/* SCENE — light, sun, planets, moons, rings                           */
/* ================================================================== */
const { updatePositions } = initBodies({ scene, textureLoader, renderer });
initStructures({ scene, textureLoader });
initLabels();
initStarPaths({ scene });
initSky({
  scene,
  textureLoader,
  labelsRoot: document.getElementById('labels'),
  // Scene code does not talk to the UI; the entry point decides how to
  // report the result of clicking a star.
  onStarPathToggle: (name) => {
    const on = toggleStarPath(name);
    showToast(on ? `${name}: precession path traced (tick ≈ 1,000 yr)` : `${name}: path hidden`);
  },
});

/* ================================================================== */
/* UI — toggles, time machine, chapters, info panel                    */
/* ================================================================== */
initHud({ camera, controls });
initTimeMachine();
initChapters({ camera, controls });
initScreenshot({ canvas, notify: showToast });

/* ================================================================== */
/* Interaction and the tour, then the shared entry points              */
/* ================================================================== */
initInteraction({ camera, controls, canvas });
initTour({ camera, controls });
initTrails({
  scene,
  notify: showToast,
  setSimDate,
  applyToggles,
});

Object.assign(ctx, {
  isTouring,
  startTour,
  stopTour,
  refreshHud,
  applyToggles,
  isInfoPanelOpen,
  closeInfoPanel,
  toggleInfoPanel,
  requestShot,
});

parseUrlParams();
applyToggles();
refreshHud();

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
  updateStarMarkers(time.simMs);
  recordTrails(time.simMs, dt);
  if (consumePendingTour()) startTour(false);
  const pendingBody = consumePendingBody();
  if (pendingBody) {
    const s = selectableByKey[pendingBody];
    if (s) flyTo(s, true);
  }
  updateBelts(time.simMs);
  updateDateReadout(time.simMs);
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
  takePendingShot(); // same task as the render: the buffer is still valid
});
