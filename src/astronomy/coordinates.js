/* ================================================================== */
/* astronomy/coordinates — time scales and frame conversions.          */
/*                                                                     */
/* astronomy-engine vectors are EQJ (J2000 equatorial). Rotate to the  */
/* J2000 ecliptic (ECT) with the fixed obliquity, then map to the scene */
/* so orbits hug the XZ plane:  ECT (x, y, z) -> scene (x, z, -y).      */
/*                                                                     */
/* Pure maths only — no three.js, no DOM. Returns plain {x, y, z}.      */
/* ================================================================== */
import { AU_UNITS } from '../config.js';

export const OBLIQUITY = 23.4392911 * Math.PI / 180; // J2000 mean obliquity

/* Julian-day helpers (ms epoch <-> days since J2000, i.e. JD 2451545.0) */
export const J2000_MS = Date.UTC(2000, 0, 1, 12);
export const daysSinceJ2000 = (ms) => (ms - J2000_MS) / 86400000;
export const jdToMs = (jd) => J2000_MS + (jd - 2451545.0) * 86400000;

/* EQJ -> J2000 ecliptic. Rotation about the X axis; |v| is preserved. */
export function eqToEct(v) {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return { x: v.x, y: c * v.y + s * v.z, z: -s * v.y + c * v.z };
}

/* Ecliptic (AU) -> scene units. */
export function toScene(ect) {
  return { x: ect.x * AU_UNITS, y: ect.z * AU_UNITS, z: -ect.y * AU_UNITS };
}

/* Right ascension (hours) / declination (degrees) -> point on a sphere of
   `radius`. Used for constellations and bright stars. */
export function radecToVector(raHours, decDeg, radius) {
  const ra = raHours * 15 * Math.PI / 180;
  const dec = decDeg * Math.PI / 180;
  return {
    x: radius * Math.cos(dec) * Math.cos(ra),
    y: radius * Math.sin(dec),
    z: -radius * Math.cos(dec) * Math.sin(ra),
  };
}

/* ms epoch -> "YYYY-MM-DD HH:MM UTC" */
export function formatUtc(ms) {
  const d = new Date(ms);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
         `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}
