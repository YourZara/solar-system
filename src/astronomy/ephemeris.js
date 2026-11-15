/* ================================================================== */
/* astronomy/ephemeris — the astronomy-engine adapter.                 */
/*                                                                     */
/* Split out from coordinates.js on purpose: astronomy-engine resolves */
/* from a CDN import map in the browser and has no Node counterpart,   */
/* so anything importing it cannot be unit-tested. Keeping it here     */
/* lets coordinates.js and kepler.js stay pure and testable.           */
/* ================================================================== */
import * as Astronomy from 'astronomy-engine';

/* Sun-centred planets handled by VSOP87 (±1 arcminute). */
export const ASTRONOMY_BODY = {
  sun: null, mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus,
  earth: Astronomy.Body.Earth, mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn,
  uranus: Astronomy.Body.Uranus, neptune: Astronomy.Body.Neptune,
};

/* EQJ heliocentric vector for a planet. */
export function helioVector(key, date) {
  return Astronomy.HelioVector(ASTRONOMY_BODY[key], date);
}

/* EQJ geocentric vector for the Moon. */
export function geoMoon(date) {
  return Astronomy.GeoMoon(date);
}

/* Body enum by name — used by the build-time sanity log. */
export function bodyEnum(name) {
  return Astronomy.Body[name];
}
