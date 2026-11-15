/* ================================================================== */
/* ui/hud — the persistent chrome: time controls, toggles, info panel.  */
/*                                                                     */
/* Only the panels the user keeps reaching for; the fact card lives    */
/* with the selection it describes (systems/interaction.js).           */
/*                                                                     */
/* This module owns every write to state.view, apart from the tour,    */
/* which saves and restores the user's constellation setting.          */
/* ================================================================== */
import { SPEEDS } from '../config.js';
import { time, view, bodyRadiusUnits } from '../state.js';
import { formatUtc } from '../astronomy/coordinates.js';
import { bodiesByKey, moonsByKey } from '../scene/bodies.js';
import { orbitLines, beltGroups } from '../scene/structures.js';
import { labelsRoot } from '../scene/labels.js';
import { constellationGroup, brightStarsGroup, skyGridGroup } from '../scene/sky.js';
import { togglePause, changeSpeed } from '../systems/time.js';
import { onSoundToggle } from '../audio.js';
import { startTour } from '../systems/tour.js';
import { showCustomCard } from '../systems/interaction.js';

const dateReadout = document.getElementById('date-readout');
const speedLabel = document.getElementById('speed-label');
const btnPause = document.getElementById('btn-pause');
const btnSlower = document.getElementById('btn-slower');
const btnFaster = document.getElementById('btn-faster');
const infoPanel = document.getElementById('info-panel');
const infoClose = document.getElementById('info-close');
const btnInfo = document.getElementById('btn-info');
const btnReplay = document.getElementById('btn-replay');
const milkyWayBtn = document.getElementById('milkyway-point');

let camera = null;
let controls = null;

/* --- Clock readout -------------------------------------------------- */
export function refreshHud() {
  speedLabel.textContent = SPEEDS[time.speedIdx].label;
  btnPause.textContent = time.paused ? '▶' : '⏸';
  btnPause.classList.toggle('on', time.paused);
}

export function updateDateReadout(ms) {
  dateReadout.textContent = formatUtc(ms);
}

/* --- Visibility toggles --------------------------------------------- */
const toggleBtns = [...document.querySelectorAll('#toggles button')];

export function applyToggles() {
  for (const rec of Object.values(bodiesByKey)) {
    if (rec.body.sun) continue;
    // Kepler dwarfs/comet have visibility floors in compressed mode only.
    const base = bodyRadiusUnits(rec.body.radiusKm);
    rec.scaleR = (!view.trueScale && rec.isKepler)
      ? Math.max(base, rec.body.comet ? 0.12 : 0.22)
      : base;
    rec.spinEl.scale.setScalar(rec.scaleR);
  }
  const sunR = bodyRadiusUnits(696000);
  bodiesByKey.sun.spinEl.scale.setScalar(view.trueScale ? sunR : 6);
  bodiesByKey.sun.scaleR = view.trueScale ? sunR : 6;
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

/* --- Info panel ----------------------------------------------------- */
export function openInfoPanel() { infoPanel.classList.add('open'); }
export function closeInfoPanel() { infoPanel.classList.remove('open'); }
export function isInfoPanelOpen() { return infoPanel.classList.contains('open'); }

/* --- Milky Way framing ---------------------------------------------- */
/* Reused by the toolbar button and the galaxy chapter step. */
export function showGalaxy() {
  closeInfoPanel();
  showCustomCard({
    name: 'The Milky Way',
    type: 'Galaxy',
    stats: [['Type', 'Barred spiral galaxy'], ['Stars', '~100–400 billion'], ['Our location', 'Orion Arm']],
    fact: 'Our home galaxy — a vast disk of stars, gas, and dust. The glowing band in the sky is its crowded plane seen from within; our solar system is a tiny speck in one of its spiral arms.',
  });
  controls.target.set(0, 0, 0);
  camera.position.set(0, 700, 2200);
}

/* ================================================================== */
/* Wiring                                                             */
/* ================================================================== */
export function initHud(deps) {
  camera = deps.camera;
  controls = deps.controls;

  btnPause.addEventListener('click', () => { togglePause(time); refreshHud(); });
  btnSlower.addEventListener('click', () => { changeSpeed(time, -1); refreshHud(); });
  btnFaster.addEventListener('click', () => { changeSpeed(time, +1); refreshHud(); });

  btnInfo.addEventListener('click', () => infoPanel.classList.toggle('open'));
  infoClose.addEventListener('click', closeInfoPanel);
  btnReplay.addEventListener('click', () => { closeInfoPanel(); startTour(true); });
  if (milkyWayBtn) milkyWayBtn.addEventListener('click', showGalaxy);

  toggleBtns.forEach((btn) => btn.addEventListener('click', () => {
    if (!btn.dataset.toggle) return; // the info button is handled above
    view[btn.dataset.toggle] = !view[btn.dataset.toggle];
    applyToggles();
    if (btn.dataset.toggle === 'sound') onSoundToggle();
  }));

  try {
    const saved = JSON.parse(localStorage.getItem('sol-toggles') || 'null');
    if (saved) Object.assign(view, saved);
  } catch { /* ignore a corrupt preference */ }

  refreshHud();
}
