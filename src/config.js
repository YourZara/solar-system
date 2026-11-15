/* ================================================================== */
/* config — pure constants and scale maths.                            */
/* No DOM, no three.js, no browser globals: this module is imported by */
/* the tests, so it must load under plain Node.                        */
/* ================================================================== */

/* Texture base URL (Solar System Scope set, CC BY 4.0 — see CREDITS.md) */
export const W = 'https://upload.wikimedia.org/wikipedia/commons/';

/* Simulation speeds. mult is "simulated ms per real ms". */
export const SPEEDS = [
  { label: 'real time',   mult: 1 },
  { label: '1 day/s',     mult: 86400 },
  { label: '1 month/s',   mult: 2592000 },
  { label: '1 yr/s',      mult: 31557600 },
  { label: '10 yr/s',     mult: 315576000 },
];

/* ================================================================== */
/* SCALES — distances are always true-relative: 1 AU = 60 units.       */
/* Body sizes: compressed (power law, everything visible) by default;  */
/* the True-scale toggle switches to real radii — space becomes empty. */
/* ================================================================== */
export const AU_UNITS = 60;
export const AU_KM = 1.495978707e8;
export const kmToUnits = (km) => km / AU_KM * AU_UNITS;
export const compressedRadius = (km) => 1.5 * Math.pow(km / 6371, 0.42);
export const trueRadius = kmToUnits;

/* Sky dome. Stars sit just inside the Milky Way skybox. */
export const SKYBOX_RADIUS = 20000;
export const STAR_COUNTS = { low: 3000, high: 6000 };

/* Tap-vs-drag threshold, in CSS pixels. */
export const DRAG_PX = 6;

/* ================================================================== */
/* Easings — pure functions of t in [0, 1]. Camera flights use these,  */
/* so they live with the other pure numbers, not with the DOM.         */
/* ================================================================== */
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutQuint = (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2);
