/* ================================================================== */
/* systems/trails — the motion tracer.                                 */
/*                                                                     */
/* Turn Trace on, click a body: it becomes the fixed centre. Click     */
/* others and they leave a glowing path drawn *relative to that        */
/* centre*, which is the only way a planet's path reads as a shape     */
/* instead of a curve sliding off screen.                              */
/*                                                                     */
/* The panel, save file and star-path restore all live here; the maths */
/* is in trail-buffer.js. This module talks to the scene and to state, */
/* never to the UI: the entry point injects notify/applyToggles/       */
/* setSimDate, so the dependency direction stays one-way.              */
/* ================================================================== */
import * as THREE from 'three';

import { SPEEDS } from '../config.js';
import { time, view, sel } from '../state.js';
import { bodiesByKey, moonsByKey } from '../scene/bodies.js';
import {
  starPathNames, setAllStarPaths, restoreStarPaths,
} from '../scene/star-paths.js';
import {
  MAX_VERTICES, detectJump, createTrail, seedTrail, recordSample,
} from './trail-buffer.js';

const STORE_KEY = 'sol-trails';

const trails = new Map();   // key -> { line, arr, n }
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();

let ready = false;
let trailRoot = null;
let lastSim = null;
let anchorKey = null;       // the body fixed at the centre
let wasOn = false;

let panel, listEl, centreEl, starBtn, fileEl;
let notify = () => {};
let setSimDate = () => {};
let applyToggles = () => {};

const recOf = (key) => bodiesByKey[key] || moonsByKey[key];
const nameOf = (key) => recOf(key)?.body?.name ?? recOf(key)?.moon?.name ?? key;

/* ---------- trail lifecycle ---------- */
export function addTrail(key, pts) {
  if (!ready) return false;
  const rec = recOf(key);
  if (!rec || key === anchorKey || trails.has(key)) return false;
  const t = createTrail(MAX_VERTICES);
  if (pts && pts.length) seedTrail(t, pts);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(t.arr, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, t.n + 1);
  const color = rec.body?.color ?? rec.moon?.color ?? 0xd9b36a;
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color, transparent: true, opacity: 0.95,
  }));
  line.frustumCulled = false;
  trailRoot.add(line);
  trails.set(key, { ...t, line });
  renderList();
  return true;
}

export function removeTrail(key) {
  const t = trails.get(key);
  if (!t) return;
  trailRoot.remove(t.line);
  t.line.geometry.dispose();
  t.line.material.dispose();
  trails.delete(key);
  renderList();
}

export function clearTrails(resetCentre = false) {
  [...trails.keys()].forEach(removeTrail);
  if (resetCentre) { anchorKey = null; renderCentre(); }
}

function setAnchor(key) {
  // Paths are relative to the centre; a new centre makes them meaningless.
  [...trails.keys()].forEach(removeTrail);
  anchorKey = key;
  renderCentre();
  if (key) notify(`${nameOf(key)} is now the fixed centre — click another body to trace its path`);
}

/* Called by flyTo(). Returns true when the click was spent on tracing,
   so the camera stays on the centre instead of flying away. */
export function traceIntercept(s) {
  if (!view.trace || !ready) return false;
  if (!anchorKey) { setAnchor(s.key); return false; }  // first click picks the centre
  if (s.key === anchorKey) return false;
  if (trails.has(s.key)) { removeTrail(s.key); notify(`Stopped tracing ${nameOf(s.key)}`); }
  else if (addTrail(s.key)) notify(`Tracing ${nameOf(s.key)} as seen from ${nameOf(anchorKey)}`);
  return true;
}

/* ---------- per-frame recording ---------- */
export function recordTrails(simMs, dt) {
  if (!ready) return;
  panel.classList.toggle('open', !!view.trace);
  trailRoot.visible = !!view.trace;
  if (!view.trace) {
    if (wasOn) { clearTrails(true); wasOn = false; }
    lastSim = simMs;
    return;
  }
  wasOn = true;
  if (!anchorKey && sel.current) setAnchor(sel.current.key); // Trace on with a body already selected
  if (!anchorKey) { lastSim = simMs; return; }
  const anchor = recOf(anchorKey);
  if (!anchor) { anchorKey = null; renderCentre(); lastSim = simMs; return; }
  anchor.group.getWorldPosition(_a);
  trailRoot.position.copy(_a);

  const expected = dt * 1000 * SPEEDS[time.speedIdx].mult; // magnitude; sign is irrelevant
  const jumped = detectJump(lastSim, simMs, expected);
  const moving = !time.paused && lastSim !== null && simMs !== lastSim && !jumped;
  lastSim = simMs;

  for (const [key, t] of trails) {
    if (jumped) t.n = 0;   // a time jump would draw a false straight line
    const rec = recOf(key);
    if (!rec) continue;
    rec.group.getWorldPosition(_v).sub(_a);
    recordSample(t, _v.x, _v.y, _v.z, moving);
    t.line.geometry.setDrawRange(0, t.n + 1);
    t.line.geometry.attributes.position.needsUpdate = true;
  }
}

/* ---------- save / load ---------- */
function snapshot() {
  return {
    v: 2,
    centre: anchorKey,
    savedSim: new Date(time.simMs).toISOString(),
    trails: [...trails].map(([key, t]) => ({
      key,
      pts: Array.from({ length: t.n * 3 }, (_, i) => +t.arr[i].toFixed(3)),
    })),
    stars: starPathNames(),
  };
}

function applySnapshot(d) {
  if (!d || !Array.isArray(d.trails)) { notify('Not a valid trails file'); return; }
  clearTrails(true);
  anchorKey = d.centre ?? null;
  renderCentre();
  if (d.savedSim) { setSimDate(d.savedSim, false); lastSim = time.simMs; } // head must meet the saved path
  d.trails.forEach((t) => addTrail(t.key, t.pts));
  restoreStarPaths(d.stars || []);
  renderStarBtn();
  view.trace = true;
  applyToggles();
  notify(`Loaded ${d.trails.length} trail(s) around ${anchorKey ? nameOf(anchorKey) : 'the Sun'} — dated ${String(d.savedSim).slice(0, 10)}`);
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(snapshot()));
    notify('Trails saved in this browser');
  } catch {
    notify('Could not save (storage full or blocked) — use Export');
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) { notify('No saved trails yet'); return; }
    applySnapshot(JSON.parse(raw));
  } catch {
    notify('Saved trails are unreadable');
  }
}

function exportFile() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(snapshot())], { type: 'application/json' }));
  a.download = `solar-trails-${new Date(time.simMs).toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- panel ---------- */
function renderCentre() {
  centreEl.replaceChildren();
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip' + (anchorKey ? ' on' : '');
  b.textContent = anchorKey ? `Centre: ${nameOf(anchorKey)} ×` : 'Centre: click a body';
  b.title = anchorKey ? 'Clear the centre' : 'Click a body in the scene';
  if (anchorKey) {
    b.addEventListener('click', () => {
      clearTrails(true);
      notify('Centre cleared — click a body to choose a new one');
    });
  }
  centreEl.appendChild(b);
}

function renderList() {
  listEl.replaceChildren(...[...trails.keys()].map((key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.title = 'Remove this trail';
    b.textContent = `${nameOf(key)} ×`;
    b.addEventListener('click', () => removeTrail(key));
    return b;
  }));
  if (!trails.size) {
    listEl.textContent = anchorKey ? 'Click another body to trace it, then press play.' : '';
  }
}

let allStars = false;
function renderStarBtn() {
  allStars = starPathNames().length > 0 && allStars;
  starBtn.classList.toggle('on', allStars);
}

/* ---------- wiring ---------- */
export function initTrails(deps) {
  trailRoot = new THREE.Group();
  trailRoot.name = 'trails';
  deps.scene.add(trailRoot);

  notify = deps.notify;
  setSimDate = deps.setSimDate;
  applyToggles = deps.applyToggles;

  panel = document.getElementById('trail-panel');
  listEl = document.getElementById('tr-list');
  centreEl = document.getElementById('tr-centre');
  starBtn = document.getElementById('tr-stars');
  fileEl = document.getElementById('tr-file');

  document.getElementById('tr-clear').addEventListener('click', () => clearTrails());
  document.getElementById('tr-save').addEventListener('click', save);
  document.getElementById('tr-load').addEventListener('click', load);
  document.getElementById('tr-export').addEventListener('click', exportFile);
  document.getElementById('tr-import').addEventListener('click', () => fileEl.click());
  starBtn.addEventListener('click', () => {
    allStars = !allStars;
    setAllStarPaths(allStars);
    renderStarBtn();
    if (allStars) notify('Star paths: precession circles, a tick ≈ every 1,000 years');
  });
  fileEl.addEventListener('change', async () => {
    try { applySnapshot(JSON.parse(await fileEl.files[0].text())); }
    catch { notify('Could not read that file'); }
    fileEl.value = '';
  });

  ready = true;
  renderList();
  renderCentre();
}
