# Credits

This project reuses open-source code, public texture maps, and published
orbital data. Their licences and sources are listed here.

## Code libraries

| Library | Version | Licence | Use |
|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | 0.187.0 | MIT | 3D rendering, OrbitControls |
| [astronomy-engine](https://github.com/cosinekitty/astronomy-engine) | 2.1.19 | MIT | Planet and Moon ephemeris (VSOP87) |

Both are loaded from pinned jsDelivr URLs; no local copies are bundled.

## Textures — Solar System Scope (CC BY 4.0)

Surface maps for the Sun, Mercury, Venus, Earth (day map and clouds), Mars,
Jupiter, Saturn, Saturn's rings, Uranus, Neptune, the Moon, Ceres, Haumea, and
the Milky Way skybox come from the
[Solar System Scope texture set](https://www.solarsystemscope.com/textures/),
licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

They are delivered through Wikimedia Commons
(`upload.wikimedia.org`) with CORS enabled. Attribution is also shown in the
app's **Info** panel.

## Procedural surfaces

The following bodies have no free, budget-appropriate texture map and use
procedural surfaces generated in code: Eris, Makemake, Io, Europa, Ganymede,
Callisto, Titan, Triton, and the Halley nucleus. This is declared rather than
silently substituted.

## Orbital data

- Planets and the Moon: **astronomy-engine** (VSOP87-based).
- Dwarf planets (Ceres, Eris, Makemake, Haumea), asteroids (Vesta, Pallas), and
  comets (1P/Halley, C/1995 O1 Hale–Bopp): osculating Keplerian elements from
  JPL SBDB / JPL Horizons values as published in Wikipedia infoboxes, propagated
  as two-body orbits. Hale–Bopp, Vesta, and Pallas are anchored at published
  perihelion dates.
- Notable-event dates (oppositions, conjunctions, eclipses, Halley's 1986
  perihelion) are approximate to the day for illustration.

## Star and sky data

Constellation figures and bright-star positions are simplified, approximate
placements for orientation and learning — not a precise star catalogue.

## Licence of this project

The original code and documentation in this repository are released under the
MIT licence (see [LICENSE](LICENSE)). Reused libraries and textures remain under
their own licences above.
