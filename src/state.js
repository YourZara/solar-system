/* ================================================================== */
/* state — the one mutable store.                                      */
/*                                                                     */
/* OWNERSHIP (do not break — this is what keeps the modules from        */
/* collapsing back into a god object):                                 */
/*   time  — written ONLY by systems/time.js (via ui/hud.js handlers)   */
/*   view  — written ONLY by ui/hud.js (toggles) and systems/tour.js    */
/*           (which saves/restores `view.constellations` around a tour) */
/*   sel   — written ONLY by systems/interaction.js                     */
/*   everyone else reads.                                              */
/* ================================================================== */
import { kmToUnits, compressedRadius, trueRadius } from './config.js';

/* --- simulation clock --- */
/* --- simulation clock --- */
export const time = {
  simMs: Date.now(),
  paused: false,
  dir: 1,       // -1 runs the clock backwards; toggled from the HUD or "R"
  speedIdx: 2,  // start at 1 day/s — the system should visibly live
  prevSimMs: Date.now(),
};

/* --- what the user has switched on, remembered across reloads --- */
/* `trace` is deliberately excluded from the saved preferences: trails
   themselves are not persisted, so restoring the flag would open an
   empty tracer on every reload. */
export const view = {
  labels: true, orbits: true, belts: true, constellations: false,
  brightStars: false, grid: false, trueScale: false, sound: false, // mute by default
  trace: false,
};

/* --- selection / camera follow. Written by systems/interaction.js --- */
export const sel = {
  current: null,   // selectable record { key, rec, body, kind, ... }
  follow: false,
  fly: null,       // { fromPos, toPos, fromTarget, toTarget, t0, dur }
};

/* --- device capability, measured once at boot --- */
export const isCoarse = matchMedia('(pointer: coarse)').matches;
export const lowPower = isCoarse ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
  window.devicePixelRatio > 2.5;
export const qualityScale = lowPower ? 1 : Math.min(window.devicePixelRatio, 2);

/* ?date=YYYY-MM-DD pins the clock to that date and pauses.
   ?body= and ?tour=0 are honoured in systems/interaction.js. */
export function parseUrlParams() {
  const p = new URLSearchParams(location.search);
  const date = p.get('date');
  if (date) {
    const d = new Date(date + (date.length <= 10 ? 'T00:00:00Z' : ''));
    if (!isNaN(d)) { time.simMs = d.getTime(); time.paused = true; }
  }
}

export function bodyRadiusUnits(km) {
  return view.trueScale ? trueRadius(km) : compressedRadius(km);
}

/* Moon orbit distances: schematic (compressed) or real (true scale).
   Compressed: parent-scale * min(9, 1.8·√(dist/parentRadius)) — keeps
   ordering and rough spacing, stays visible. */
export function moonOrbitUnits(moon, parent) {
  if (view.trueScale) return kmToUnits(moon.distKm);
  const ratio = moon.distKm / parent.body.radiusKm;
  return parent.scaleR * Math.min(9, 1.8 * Math.sqrt(ratio));
}
