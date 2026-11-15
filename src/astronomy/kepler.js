/* ================================================================== */
/* astronomy/kepler — two-body Keplerian propagation from osculating   */
/* orbital elements (ecliptic frame).                                  */
/*                                                                     */
/* Used for dwarf planets, asteroids and comets: published elements    */
/* are approximate away from their epochs — see README "Accuracy".     */
/*                                                                     */
/* Pure maths only — no three.js, no DOM. Returns plain {x, y, z} in   */
/* scene units.                                                        */
/* ================================================================== */
import { AU_UNITS } from '../config.js';
import { daysSinceJ2000, jdToMs } from './coordinates.js';

/* Solve Kepler's equation M = E - e·sin(E) by Newton-Raphson. */
export function keplerEccentricAnomaly(M, e) {
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 30; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-9) break;
  }
  return E;
}

/* Perifocal -> ecliptic: Rz(Ω)·Rx(i)·Rz(ω), then ecliptic -> scene. */
export function orbitPoint(el, E) {
  const xv = el.a * (Math.cos(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const cw = Math.cos(el.w * Math.PI / 180), sw = Math.sin(el.w * Math.PI / 180);
  const ci = Math.cos(el.i * Math.PI / 180), si = Math.sin(el.i * Math.PI / 180);
  const co = Math.cos(el.om * Math.PI / 180), so = Math.sin(el.om * Math.PI / 180);
  const x1 = xv * cw - yv * sw, y1 = xv * sw + yv * cw;
  const x2 = x1, y2 = y1 * ci, z2 = y1 * si;
  const xe = x2 * co - y2 * so, ye = x2 * so + y2 * co, ze = z2;
  return { x: xe * AU_UNITS, y: ze * AU_UNITS, z: -ye * AU_UNITS };
}

/* Position at a given instant: mean anomaly from M0, n and the epoch jd0. */
export function keplerScenePos(el, simMs) {
  const M = ((el.M0 + el.n * (daysSinceJ2000(simMs) - daysSinceJ2000(jdToMs(el.jd0)))) %
             360) * Math.PI / 180;
  return orbitPoint(el, keplerEccentricAnomaly(M, el.e));
}

/* Position at a given eccentric anomaly — used to sample orbit lines
   uniformly in E, which keeps the line dense near perihelion. */
export function keplerScenePosFromE(el, E) {
  return orbitPoint(el, E);
}
