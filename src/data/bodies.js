/* ================================================================== */
/* data/bodies — the body tables. Inert records only: no three.js, no  */
/* DOM, no astronomy-engine. Shared by scene building, ephemeris,      */
/* labels and the fact card.                                           */
/*                                                                     */
/* radius km · sidereal rotation hours (negative = retrograde) ·       */
/* axial tilt deg · orbital period days · texture · fallback colour    */
/* ================================================================== */
import { W } from '../config.js';

export const BODIES = [
  { key: 'sun', name: 'Sun', type: 'Star', radiusKm: 696000, rotH: 609.12, tilt: 7.25,
    tex: W + 'c/cb/Solarsystemscope_texture_2k_sun.jpg', color: 0xffb84d, sun: true,
    fact: 'A G-type star holding 99.8% of the solar system’s mass — the quiet engine of every orbit you see.' },
  { key: 'mercury', name: 'Mercury', type: 'Planet', radiusKm: 2439.7, rotH: 1407.6, tilt: 0.03, periodD: 87.969,
    tex: W + '9/92/Solarsystemscope_texture_2k_mercury.jpg', color: 0x9c9c94,
    fact: 'The smallest planet and the fastest, racing around the Sun in just 88 Earth days.' },
  { key: 'venus', name: 'Venus', type: 'Planet', radiusKm: 6051.8, rotH: -5832.5, tilt: 177.4, periodD: 224.701,
    tex: W + '6/63/Solarsystemscope_texture_2k_venus_atmosphere.jpg', color: 0xe6c98a,
    fact: 'Wrapped in crushing clouds, it spins backward so slowly that its day outlasts its year.' },
  { key: 'earth', name: 'Earth', type: 'Planet', radiusKm: 6371, rotH: 23.9345, tilt: 23.44, periodD: 365.256,
    tex: W + 'c/c3/Solarsystemscope_texture_2k_earth_daymap.jpg', color: 0x6b93d6,
    fact: 'The only world known to keep oceans of liquid water on its surface — and life to notice them.' },
  { key: 'mars', name: 'Mars', type: 'Planet', radiusKm: 3389.5, rotH: 24.6229, tilt: 25.19, periodD: 686.980,
    tex: W + '4/46/Solarsystemscope_texture_2k_mars.jpg', color: 0xc1440e,
    fact: 'Home to Olympus Mons, a volcano so vast its slopes would cover a country.' },
  { key: 'jupiter', name: 'Jupiter', type: 'Planet', radiusKm: 69911, rotH: 9.925, tilt: 3.13, periodD: 4332.59,
    tex: W + 'b/be/Solarsystemscope_texture_2k_jupiter.jpg', color: 0xd8ca9d,
    fact: 'A giant of storms and moons, more massive than all the other planets combined.' },
  { key: 'saturn', name: 'Saturn', type: 'Planet', radiusKm: 58232, rotH: 10.66, tilt: 26.73, periodD: 10759.22,
    tex: W + 'e/ea/Solarsystemscope_texture_2k_saturn.jpg', color: 0xe3b98a,
    fact: 'Its rings are countless shards of ice and rock, bright enough to be seen from Earth with a small telescope.' },
  { key: 'uranus', name: 'Uranus', type: 'Planet', radiusKm: 25362, rotH: -17.24, tilt: 97.77, periodD: 30688.5,
    tex: W + '9/95/Solarsystemscope_texture_2k_uranus.jpg', color: 0xc7e3e8,
    fact: 'Knocked onto its side long ago, it rolls around the Sun like a pale, icy barrel.' },
  { key: 'neptune', name: 'Neptune', type: 'Planet', radiusKm: 24622, rotH: 16.11, tilt: 28.32, periodD: 60182,
    tex: W + '1/1e/Solarsystemscope_texture_2k_neptune.jpg', color: 0x4d70db,
    fact: 'The farthest planet, swept by supersonic winds in a deep blue no human has seen up close but once.' },
];

/* Moons. Earth's Moon uses the real ephemeris (astronomy-engine GeoMoon);
   the others use fitted circular orbits (real distance, period, rough
   inclination; J2000 mean-longitude phases approximated). No free texture
   maps exist for them — procedural surfaces, declared in the credits. */
export const MOONS = [
  { key: 'moon', name: 'Moon', type: 'Moon', parent: 'earth', radiusKm: 1737.4, distKm: 384400,
    periodD: 27.321661, rotH: 27.321661 * 24, inc: 5.14, eph: true,
    tex: W + '2/26/Solarsystemscope_texture_2k_moon.jpg', color: 0xb5b5b5,
    fact: 'Earth’s companion, locked to show the same face — the only other world humans have walked on.' },
  { key: 'io', name: 'Io', type: 'Moon', parent: 'jupiter', radiusKm: 1821.6, distKm: 421700,
    periodD: 1.769138, rotH: 1.769138 * 24, inc: 0.05, phase0: 343.6, color: 0xd9c25f,
    fact: 'Stretched and squeezed by Jupiter’s gravity, it erupts with hundreds of active volcanoes.' },
  { key: 'europa', name: 'Europa', type: 'Moon', parent: 'jupiter', radiusKm: 1560.8, distKm: 671100,
    periodD: 3.551181, rotH: 3.551181 * 24, inc: 0.47, phase0: 129.5, color: 0xcdb89a,
    fact: 'Beneath its cracked ice shell, a saltwater ocean may hold more water than all Earth’s seas.' },
  { key: 'ganymede', name: 'Ganymede', type: 'Moon', parent: 'jupiter', radiusKm: 2634.1, distKm: 1070400,
    periodD: 7.154553, rotH: 7.154553 * 24, inc: 0.20, phase0: 217.7, color: 0xa89a8a,
    fact: 'The largest moon in the solar system — bigger than Mercury — and the only one with its own magnetic field.' },
  { key: 'callisto', name: 'Callisto', type: 'Moon', parent: 'jupiter', radiusKm: 2410.3, distKm: 1882700,
    periodD: 16.689017, rotH: 16.689017 * 24, inc: 0.28, phase0: 317.7, color: 0x8a7f70,
    fact: 'An ancient, cratered ice world that has kept its scars for billions of years.' },
  { key: 'titan', name: 'Titan', type: 'Moon', parent: 'saturn', radiusKm: 2574.7, distKm: 1221870,
    periodD: 15.945421, rotH: 15.945421 * 24, inc: 0.33, phase0: 190, color: 0xd8a95e,
    fact: 'Shrouded in orange haze, it has rivers and lakes — but of liquid methane, not water.' },
  { key: 'triton', name: 'Triton', type: 'Moon', parent: 'neptune', radiusKm: 1353.4, distKm: 354760,
    periodD: 5.876854, rotH: -5.876854 * 24, inc: 157, phase0: 40, color: 0xc9d4d8,
    fact: 'A captured wanderer orbiting backward, with geysers that loft dark plumes into its thin air.' },
];

/* Dwarf planets + comet: 2-body Keplerian propagation from JPL-sourced
   elements (Wikipedia infoboxes, JPL SBDB / Horizons values). Honest
   accuracy note: planets use VSOP87 (astronomy-engine); these four dots
   use osculating elements — sub-degree for decades around their epoch. */
export const KEPLER_BODIES = [
  { key: 'ceres', name: 'Ceres', type: 'Dwarf planet', radiusKm: 473, rotH: 9.074, periodD: 1680.3, jd0: 2459600.5,
    a: 2.76604, e: 0.0785010, i: 10.58769, om: 80.26860, w: 73.63704, M0: 291.37560, n: 360 / 1680.300,
    tex: W + 'f/f0/Solarsystemscope_texture_2k_ceres_fictional.jpg', color: 0x8f8880,
    fact: 'The largest resident of the asteroid belt — a small world of rock and briny ice, once called a planet.' },
  { key: 'vesta', name: 'Vesta', type: 'Asteroid', radiusKm: 262.7, rotH: 5.342, periodD: 1325.86, jd0: 2460901.5,
    a: 2.3615, e: 0.0894, i: 7.1422, om: 103.71, w: 151.66, M0: 0, n: 360 / 1325.86,
    color: 0xb8b0a5,
    fact: 'One of the brightest asteroids — a rocky protoplanet with a giant impact basin at its south pole.' },
  { key: 'pallas', name: 'Pallas', type: 'Asteroid', radiusKm: 256, rotH: 7.813, periodD: 1684.0, jd0: 2461694.5,
    a: 2.77, e: 0.2302, i: 34.93, om: 172.9, w: 310.9, M0: 0, n: 360 / 1684.0,
    color: 0x9e9a92,
    fact: 'A large, tilted asteroid on an unusually inclined path — a relic from the solar system’s chaotic youth.' },
  { key: 'eris', name: 'Eris', type: 'Dwarf planet', radiusKm: 1163, rotH: 25.9, periodD: 204199, jd0: 2461000.5,
    a: 67.69, e: 0.44, i: 44.18, om: 36.02, w: 151.66, M0: 205.11, n: 0.00177,
    color: 0xdfe3e6,
    fact: 'A distant, icy world whose discovery helped redraw the map of the solar system — and demote Pluto.' },
  { key: 'makemake', name: 'Makemake', type: 'Dwarf planet', radiusKm: 715, rotH: 22.83, periodD: 112022, jd0: 2461000.5,
    a: 45.499, e: 0.1604, i: 29.002, om: 79.441, w: 296.065, M0: 170.497, n: 0.0032136,
    color: 0xc7a072,
    fact: 'A dim red inhabitant of the Kuiper belt, so cold its surface is frozen methane and nitrogen.' },
  { key: 'haumea', name: 'Haumea', type: 'Dwarf planet', radiusKm: 780, rotH: 3.915, periodD: 103410, jd0: 2459200.5,
    a: 43.116, e: 0.19642, i: 28.2137, om: 122.167, w: 239.041, M0: 218.205, n: 0.00348140,
    tex: W + '4/4b/Solarsystemscope_texture_2k_haumea_fictional.jpg', color: 0xd8d3c8,
    fact: 'Spun into an oval by a frantic four-hour day, it tumbles end over end in the deep cold.' },
  { key: 'halley', name: 'Halley', type: 'Comet', radiusKm: 5.5, rotH: 52.8, periodD: 74.7 * 365.25, jd0: 2446470.96,
    a: 17.737, e: 0.96658, i: 161.96, om: 59.396, w: 112.05, M0: 0, n: 360 / (74.7 * 365.25),
    color: 0xb9c2c9, comet: true,
    fact: 'The famous wanderer on a long, tilted loop — a dirty snowball that grows a tail when the Sun warms it.' },
  { key: 'hale-bopp', name: 'Hale–Bopp', type: 'Comet', radiusKm: 30, rotH: 11.77, periodD: 2364 * 365.25, jd0: 2450539.5,
    a: 182.07, e: 0.99498, i: 89.288, om: 282.73, w: 130.41, M0: 0, n: 360 / (2364 * 365.25),
    color: 0xcfe3ff, comet: true, tailScale: 2.2,
    fact: 'The Great Comet of 1997 — unusually bright for months, with a vast dust tail and a striking blue ion tail.' },
];
