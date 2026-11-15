# The Solar System

A real-3D solar system you can explore in the browser — planets in their actual
positions for any date, with a time machine, a guided tour, and a sky full of
stars and constellations.

**Live demo:** https://yourzara.github.io/solar-system/

---

## What it is

A hand-built toy solar system with no build step and no framework. The Sun,
eight planets, major moons, dwarf planets, two famous comets, and the asteroid
and Kuiper belts are rendered in 3D. Planet and Moon positions come from a real
ephemeris, so you can travel to any date and see where the worlds actually were.

Everything is plain HTML, CSS, and JavaScript. The only externals are pinned
CDN libraries and texture maps.

## Features

- **Bodies:** Sun, 8 planets, the Moon, Io, Europa, Ganymede, Callisto, Titan,
  Triton, Saturn's rings, Ceres, Eris, Makemake, Haumea, Vesta, Pallas, Halley,
  and Hale–Bopp.
- **Time machine:** date picker, timeline scrubber, "Today"/"Tonight", and
  presets including planetary oppositions, the 2020 Great Conjunction, Halley's
  1986 perihelion, and the 2017 total solar eclipse.
- **Sky:** toggleable constellations with short intros, the brightest named
  stars (including Polaris), a Milky Way info point, and a celestial-equator /
  ecliptic grid.
- **Guided chapters:** step-through explanations with Next/Back, plus a
  cinematic grand tour on first open (skippable and replayable).
- **Fact cards:** live distance from the Sun and Earth, size comparison with
  Earth, and a short fact for every body.
- **Comfort:** responsive HUD for phones, hover highlighting, label
  deconfliction, home/reset, and automatic quality scaling.

## Run locally

The app loads ES modules and textures, so serve it over HTTP rather than opening
the file directly:

```bash
python3 -m http.server 8090
```

Then open <http://localhost:8090>.

Needs a modern browser with WebGL2 and an internet connection on first load.
The ~9.7 MB of libraries and textures are browser-cached afterwards.

## Controls

- **Mouse:** drag to orbit, scroll to zoom, right-drag to pan, click a body to
  fly to it, double-click empty space to reset.
- **Touch:** drag to orbit, pinch to zoom, tap to select.
- **Keyboard:** `Space` pause/play, `Esc` close/back/reset, `←/→` step through
  bodies, `L` labels, `O` orbits, `H` home.
- **Toggles:** Labels, Orbits, Constellations, Stars, Grid, True scale, Belts,
  Sound, Home, Info.
- **Deep links:** `?body=jupiter`, `?body=hale-bopp`, `?date=1986-02-09`,
  `?tour=0`.

## Accuracy

- Planet and Moon positions use VSOP87 via astronomy-engine — roughly
  arcminute-class, good enough to trust and beautiful enough to feel, but not a
  mission-planning tool.
- Dwarf planets, asteroids, and comets use two-body Kepler propagation from
  published osculating elements, so they are approximate away from their epochs.
- Visual sizes and distances are compressed by default for visibility. The
  **True scale** toggle shows real relative scales.
- Bright-star positions are approximate placements for orientation and
  learning.

## Credits and licence

- Code: **MIT** — see [LICENSE](LICENSE).
- Libraries: three.js (MIT), astronomy-engine (MIT).
- Textures: Solar System Scope (CC BY 4.0) via Wikimedia Commons.
- Full attribution and data sources: [CREDITS.md](CREDITS.md).

This is an independent project, not affiliated with NASA, ESA, or any of the
credited authors.
