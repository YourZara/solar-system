/* ================================================================== */
/* systems/interaction — selection, fly-to/follow, fact card, strip,   */
/* picking, keyboard and URL deep links.                               */
/*                                                                     */
/* This is the only module allowed to write state.sel. The fact card    */
/* lives here too: it is the read-out of whatever sel points at, and   */
/* splitting them would mean two owners for one piece of state.        */
/* ================================================================== */
import * as THREE from 'three';

import { AU_UNITS, DRAG_PX, easeInOutCubic, easeInOutQuint } from '../config.js';
import { view, sel, time, bodyRadiusUnits } from '../state.js';
import { BODIES, MOONS, KEPLER_BODIES } from '../data/bodies.js';
import { bodiesByKey, moonsByKey } from '../scene/bodies.js';
import { togglePause, toggleReverse } from './time.js';
import { traceIntercept, clearTrails } from './trails.js';
import { playChime } from '../audio.js';
import { ctx } from '../ctx.js';

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

let camera = null;
let controls = null;
let canvas = null;

/* Build selectable list: all planets+sun, moons, dwarfs/comet.
   Filled from initInteraction(), not at import time: the body records are
   created by initBodies() while the entry module runs, which is after all
   imports have been evaluated. */
const selectables = [];
export const selectableByKey = {};

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
  selectableByKey[key] = s;
  rec.mesh.userData.selectable = s;
}
function buildSelectables() {
  for (const b of BODIES) addSelectable(b.key, bodiesByKey[b.key], b, b.sun ? 'star' : 'planet');
  for (const m of MOONS) addSelectable(m.key, moonsByKey[m.key], m, 'moon');
  for (const k of KEPLER_BODIES) addSelectable(k.key, bodiesByKey[k.key], k, k.comet ? 'comet' : 'dwarf');
}
// Major bodies for strip and arrow stepping: Sun + 8 planets
const majorKeys = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

export function bodyWorldPos(s, out) {
  s.rec.group.getWorldPosition(out);
  return out;
}
export function bodyDisplayRadius(s) {
  // world-ish scale: rec.scaleR is local spinEl scale (mesh radius 1)
  return s.rec.scaleR || bodyRadiusUnits(s.body.radiusKm);
}

let factCardTarget = null;

/* --- Fact card ------------------------------------------------------ */
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

function auDist(a, b) { return a.distanceTo(b) / AU_UNITS; }
function compareEarth(s) {
  if (s.key === 'earth') return '1× Earth diameter';
  const r = (s.diameterKm / 12742);
  if (r >= 1) return r.toFixed(r >= 10 ? 1 : 2) + '× Earth diameter';
  return (1 / r).toFixed(r < 0.1 ? 0 : 1) + '× smaller than Earth';
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
  factStats.innerHTML = stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}
export function openFactCard(s) {
  factCardTarget = s;
  factName.textContent = s.name;
  factType.textContent = s.type;
  renderFactStats(buildFactStats(s));
  factText.textContent = s.fact;
  factCard.classList.add('open');
}
export function updateFactCardLive() {
  if (!factCard.classList.contains('open') || !factCardTarget) return;
  renderFactStats(buildFactStats(factCardTarget));
}
export function closeFactCard() {
  factCard.classList.remove('open');
  factCardTarget = null;
}

/* A hand-written card (Milky Way, chapter intros) shares the card shell
   but is not about a selectable body. */
export function showCustomCard({ name, type, stats = [], fact = '' }) {
  sel.current = null; sel.follow = false; sel.fly = null;
  controls.zoomToCursor = true;
  factCardTarget = null;
  factName.textContent = name;
  factType.textContent = type || '';
  factStats.innerHTML = stats.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  factText.textContent = fact;
  factCard.classList.add('open');
  setStripSelection(null);
  try { const u = new URL(location.href); u.searchParams.delete('body'); history.replaceState(null, '', u); } catch {}
}

/* --- Selection ------------------------------------------------------ */
export function setStripSelection(key) {
  bodyStrip.querySelectorAll('.strip-item').forEach((el) => {
    el.classList.toggle('selected', el.dataset.key === key);
  });
}

export function deselect() {
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

export function flyTo(s, immediate = false) {
  if (traceIntercept(s)) return; // tracing: keep the centre fixed, just add the path
  sel.current = s;
  sel.follow = false;
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
    const hasMoons = MOONS.some((m) => m.parent === s.key);
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

/* --- Home ----------------------------------------------------------- */
export function resetHome(immediate = false) {
  if (ctx.isTouring && ctx.isTouring()) { ctx.stopTour(true); return; }
  sel.current = null; sel.follow = false; sel.fly = null; closeFactCard(); setStripSelection(null);
  controls.zoomToCursor = true;
  try { const u = new URL(location.href); u.searchParams.delete('body'); history.replaceState(null, '', u); } catch {}
  if (immediate) {
    controls.target.set(0, 0, 0);
    camera.position.set(0, 420, 1450);
  } else {
    sel.fly = {
      fromPos: camera.position.clone(),
      toPos: new THREE.Vector3(0, 420, 1450),
      fromTarget: controls.target.clone(),
      toTarget: new THREE.Vector3(0, 0, 0),
      t0: performance.now(),
      dur: 1100,
      home: true,
    };
  }
}

/* --- URL ?body= — consumed once, after the first positions exist --- */
let pendingBody = null;
{
  const p = new URLSearchParams(location.search);
  const body = p.get('body');
  if (body) pendingBody = body.toLowerCase();
}
export function consumePendingBody() {
  const key = pendingBody;
  pendingBody = null;
  return key;
}

/* --- Per-frame animation -------------------------------------------- */
export function updateInteraction() {
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
/* Wiring                                                             */
/* ================================================================== */
export function initInteraction(deps) {
  camera = deps.camera;
  controls = deps.controls;
  canvas = deps.canvas;

  buildSelectables();

  factClose.addEventListener('click', () => deselect());

  // Body strip (major bodies)
  for (const key of majorKeys) {
    const s = selectableByKey[key];
    if (!s) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'strip-item';
    btn.dataset.key = key;
    btn.innerHTML = `<span class="strip-dot" style="background:#${s.color.toString(16).padStart(6, '0')}"></span><span class="strip-name">${s.name}</span>`;
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
    const hits = raycaster.intersectObjects(selectables.map((s) => s.rec.mesh), false);
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
    if (dx * dx + dy * dy > DRAG_PX * DRAG_PX) return; // drag, not tap
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const meshes = selectables.map((s) => s.rec.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length) {
      const s = hits[0].object.userData.selectable;
      if (s) flyTo(s);
    }
  });
  canvas.addEventListener('pointercancel', () => { down = null; });

  // double-click empty space to reset view
  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(selectables.map((s) => s.rec.mesh), false);
    if (!hits.length) resetHome(false);
  });

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
    if (e.code === 'Space') { e.preventDefault(); togglePause(time); ctx.refreshHud(); }
    else if (e.code === 'Escape') {
      if (ctx.isInfoPanelOpen()) ctx.closeInfoPanel();
      else if (sel.current) deselect();
      else resetHome(false);
    }
    else if (e.code === 'ArrowRight') { e.preventDefault(); stepSelection(1); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); stepSelection(-1); }
    else if (e.key === 'l' || e.key === 'L') { view.labels = !view.labels; ctx.applyToggles(); }
    else if (e.key === 'o' || e.key === 'O') { view.orbits = !view.orbits; ctx.applyToggles(); }
    else if (e.key === 'h' || e.key === 'H') { resetHome(false); }
    else if (e.key === 'r' || e.key === 'R') { toggleReverse(time); ctx.refreshHud(); }
    else if (e.key === 'x') { view.trace = !view.trace; ctx.applyToggles(); }
    else if (e.key === 'X') { clearTrails(); }
  });
}
