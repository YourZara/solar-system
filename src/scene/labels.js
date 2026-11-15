/* ================================================================== */
/* scene/labels — projected DOM labels for bodies and moons.           */
/*                                                                     */
/* Labels are DOM elements positioned from world coordinates each      */
/* frame, so they live with the scene rather than in ui/ (which never  */
/* imports three.js). One deconfliction pass keeps them readable.      */
/* ================================================================== */
import * as THREE from 'three';

import { view, sel } from '../state.js';
import { bodiesByKey, moonsByKey } from './bodies.js';

export const labelsRoot = document.getElementById('labels');

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

/* Create the labels. Call after initBodies() so the records exist. */
export function initLabels() {
  addLabel('Sun', new THREE.Vector3(0, 0, 0));
  for (const rec of Object.values(bodiesByKey)) {
    if (rec.body.sun) continue;
    addLabel(rec.body.name, rec.group);
  }
  for (const rec of Object.values(moonsByKey)) {
    addLabel(rec.moon.name, rec.group, { small: true, parentKey: rec.moon.parent });
  }
  return labels;
}

const _proj = new THREE.Vector3();
const _world = new THREE.Vector3();

export function updateLabels(camera) {
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
    const isSelected = sel.current && L.obj === sel.current.rec.group;
    const alpha = isSelected ? 1 : Math.max(0.25, Math.min(1, 1.15 - d / 3500));
    L.el.style.display = 'block';
    L.el.style.left = x + 'px';
    L.el.style.top = y + 'px';
    L.el.style.opacity = alpha.toFixed(2);
    labelCandidates.push({ L, x, y, d, priority: isSelected ? 2 : (L.parentKey ? 0 : 1) });
  }
  // simple deconfliction: hide lower-priority labels that overlap
  labelCandidates.sort((a, b) => b.priority - a.priority || a.d - b.d);
  const placed = [];
  for (const c of labelCandidates) {
    if (c.L.el.style.display === 'none') continue;
    const w = c.L.parentKey ? 46 : 60, h = 14;
    let hit = false;
    for (const p of placed) {
      if (Math.abs(c.x - p.x) < (w / 2 + p.w / 2) && Math.abs(c.y - p.y) < (h / 2 + p.h / 2)) { hit = true; break; }
    }
    if (hit && c.priority < 2) { c.L.el.style.display = 'none'; }
    else placed.push({ x: c.x, y: c.y, w, h });
  }
}
