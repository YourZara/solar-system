/* ================================================================== */
/* systems/tour — the cinematic intro and the guided fly-past.         */
/*                                                                     */
/* A tour is a sequence of stops; each stop flies the camera to a      */
/* framing and then holds while the narration reads. Any user input    */
/* cancels it, and the constellation overlay is restored to whatever   */
/* the user had before the tour started.                               */
/*                                                                     */
/* The tour writes state.view.constellations temporarily; it saves and */
/* restores the user's own value, so hud.js still owns the toggle.     */
/* ================================================================== */
import * as THREE from 'three';

import { easeInOutCubic } from '../config.js';
import { view, sel } from '../state.js';
import { constellationGroup } from '../scene/sky.js';
import {
  selectableByKey, bodyWorldPos, bodyDisplayRadius,
  deselect, closeFactCard, setStripSelection,
} from './interaction.js';

const introEl = document.getElementById('intro');
const introNarration = document.getElementById('intro-narration');
const introSkip = document.getElementById('intro-skip');

let tour = null;
let pendingStart = false;

/* Set once by initTour(); the camera and its controls are created by the
   entry module, and the tour only ever nudges them. */
let camera = null;
let controls = null;

const _wp = new THREE.Vector3();

/* Camera moves are recomputed during a hold so the framing keeps up
   with a planet that is still travelling along its orbit. */
const TOUR_STOPS = [
  { type: 'intro', line: 'Inside the Milky Way — our home galaxy, a sea of hundreds of billions of stars.',
    cam: () => ({ toPos: new THREE.Vector3(0, 900, 2600), toT: new THREE.Vector3(0, 0, 0) }), dur: 3800, hold: 3200 },
  { type: 'constellations', line: 'Constellations — patterns we draw in the stars to tell stories and find our way.',
    cam: () => ({ toPos: new THREE.Vector3(400, 350, 1400), toT: new THREE.Vector3(0, 0, 0) }), dur: 3200, hold: 3400, showConstellations: true },
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
    const toPos = _wp.clone().add(new THREE.Vector3(Math.sin(ang) * dist, dist * 0.35, Math.cos(ang) * dist));
    return { toPos, toT: _wp.clone() };
  }
  return stopOrKey.cam();
}

function showNarration(text) {
  introNarration.textContent = text || '';
  introNarration.classList.toggle('show', !!text);
}

function restoreTourConsts() {
  if (tour && tour.prevConstellations !== undefined) {
    view.constellations = tour.prevConstellations;
    if (constellationGroup) constellationGroup.visible = !!view.constellations;
  }
}

export function isTouring() { return !!tour; }

export function stopTour(toFree = true) {
  if (!tour) return;
  restoreTourConsts();
  tour = null;
  introEl.classList.remove('open');
  introSkip.classList.remove('show');
  showNarration('');
  controls.enabled = true;
  if (toFree) {
    sel.current = null; sel.follow = false; sel.fly = null;
    closeFactCard();
    setStripSelection(null);
    controls.zoomToCursor = true;
    controls.target.set(0, 0, 0);
    camera.position.set(0, 420, 1450);
  }
}

export function cancelTour() { if (tour) stopTour(true); }

export function startTour(fromReplay = false) {
  deselect();
  tour = {
    phase: 'title', idx: 0, t0: performance.now(), titleUntil: performance.now() + 3200,
    prevConstellations: view.constellations,
  };
  controls.enabled = false;
  introEl.classList.add('open');
  introSkip.classList.add('show');
  showNarration('');
  const ne = selectableByKey['neptune'];
  bodyWorldPos(ne, _wp);
  camera.position.set(_wp.x + 120, _wp.y + 80, _wp.z + 260);
  controls.target.copy(_wp);
}

function beginTourStop(idx) {
  if (!tour) return;
  tour.idx = idx;

  // The constellations step switches the overlay on; every other step
  // restores whatever the user had before the tour began.
  const stop = TOUR_STOPS[idx];
  if (stop && stop.showConstellations) {
    view.constellations = true;
    if (constellationGroup) constellationGroup.visible = true;
  } else if (tour.prevConstellations !== undefined) {
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
    tour.toT = new THREE.Vector3(0, 0, 0);
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
  tour.toPos = cam.toPos.clone();
  tour.toT = cam.toT.clone();
  showNarration(stop.line);
}

export function updateTour(now = performance.now()) {
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

/* ================================================================== */
/* Wiring                                                             */
/* ================================================================== */
export function initTour(deps) {
  camera = deps.camera;
  controls = deps.controls;

  introSkip.addEventListener('click', (e) => { e.stopPropagation(); cancelTour(); });
  // Any input cancels the tour, except the skip button itself.
  ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => {
    window.addEventListener(ev, (e) => {
      if (!tour) return;
      if (ev === 'pointerdown' && (e.target === introSkip || introSkip.contains(e.target))) return;
      cancelTour();
    }, { passive: true });
  });

  // Start on first open unless ?tour=0 or a ?body deep link is present.
  const p = new URLSearchParams(location.search);
  pendingStart = !(p.get('tour') === '0' || p.has('body'));
  if (!pendingStart) introSkip.classList.remove('show');
}

/* The auto-start is consumed by the first frame, once the planets have
   positions — starting earlier frames the camera on the origin. */
export function consumePendingTour() {
  const start = pendingStart;
  pendingStart = false;
  return start;
}
