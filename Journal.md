# Journal

| Date | Step | File | Purpose | Added | Removed |
|---|---|---|---|---|---|
| 2026-11-14 | Phase 1 close | AgentDoc/Task.md | Record doc approval + confirmed build location | ~+2 | ~-2 |
| 2026-11-14 | Phase 1 close | AgentDoc/Requirement.md | Approval stamp + location note | ~+3 | ~-1 |
| 2026-11-14 | Phase 1 close | AgentDoc/Design.md | Approval stamp | ~+1 | ~-1 |
| 2026-11-14 | Phase 1 close | AgentDoc/Memory.md | Approved status + new folder path | ~+2 | ~-2 |
| 2026-11-14 | Phase 1 close | AgentDoc/SESSION-BRIEF.md | Approval status + location fix | ~+6 | ~-6 |
| 2026-11-14 | Phase 2 | index.html | Skeleton: pinned import map, empty scene, starfield (points + Milky Way skybox), loading line, ephemeris smoke test | +213 | -0 |
| 2026-11-14 | Phase 2 | AgentDoc/Credit.md | Verified sources, licences, budget measurement | +76 | -0 |
| 2026-11-14 | Phase 3 | index.html | Core system: sun + 8 planets (textured, colour fallback, tilt, spin), real ephemeris via astronomy-engine (ecliptic mapping), TIME module (pause, 5 speeds, sim clock), HUD (wordmark, UTC readout, time controls), sun corona sprite | ~+390 | ~-15 |
| 2026-11-14 | Phase 4 | index.html | Richness complete: 7 moons, Saturn rings, 4 dwarfs + Halley (Kepler), belts, comet tail, labels/orbit lines, toggles+localStorage, minimal ?date= param; verification fixes (GeoMoon API, label projection) | ~+560 | ~-35 |
| 2026-11-14 | Phase 4 | AgentDoc/Credit.md | Added dwarf/comet element sources, procedural-surface declarations for Eris/Makemake/moons/Halley | ~+22 | ~-8 |
| 2026-11-14 | Phase 4 | AgentDoc/SESSION-BRIEF.md | Marked Phase 4 complete with verification notes; Phase 5 next | ~+18 | ~-18 |
| 2026-11-14 | Phase 4 (backup) | backup-2026-11-14-phase4-wip/ | WIP snapshot + tmp-opencode artifacts kept for reference | n/a | n/a |

Phase 4 verified 2026-11-14 (headless, console clean): real ephemeris planets
sane; Kepler bodies at correct distances (today and Halley 0.59 AU at
1986-02-09 perihelion anchor); no runtime errors; budget unchanged (~9.7 MB).
| 2026-11-14 | Phase 5 | index.html | Interaction polish: raycast pick + drag guard, fly-to/follow camera, fact cards for all bodies, body strip, keyboard shortcuts, URL ?body= handling (?tour=0 acknowledged) | ~+260 | ~-10 |
| 2026-11-14 | Phase 5 | AgentDoc/SESSION-BRIEF.md | Marked Phase 5 complete; Phase 6 next | ~+10 | ~-6 |
| 2026-11-14 | Phase 6 | index.html | Time machine UI + notable events, grand tour intro (skippable/replayable, ?tour=0), Web Audio ambience/chime + sound toggle, ⓘ credits panel | ~+280 | ~-5 |
| 2026-11-14 | Phase 6 | AgentDoc/SESSION-BRIEF.md | Marked Phase 6 complete; Phase 7 next | ~+18 | ~-6 |
| 2026-11-14 | Phase 7 | README.md | Added usage, controls, URL params, accuracy notes, credits, budget | +58 | -0 |
| 2026-11-14 | Phase 7 | AgentDoc/SESSION-BRIEF.md | Marked Phase 7/all phases complete with verification summary | ~+16 | ~-8 |

Phase 5 verified 2026-11-14 (headless, console clean): default load and
`?body=jupiter` load without runtime errors.
Phase 6 verified 2026-11-14 (headless, console clean): `?tour=0` and
`?tour=0&date=2020-12-21` loads without runtime errors.
Phase 7 verified 2026-11-14 (headless, console clean): key states
(`?tour=0`, `?tour=0&body=jupiter`, `?tour=0&body=saturn`,
`?tour=0&date=2020-12-21`, `?tour=0&date=1986-02-09`) produced no runtime
errors; sanity logs correct (Halley 0.59 AU at 1986-02-09). Budget ~9.7 MB
unchanged. Screenshot-file capture unreliable in this headless mode; offline
reload-after-cache noted for manual browser check. All planned phases complete.
| 2026-11-14 | Enhancement | index.html | Added toggleable famous constellations overlay (lines + labels) on celestial sphere | ~+90 | ~-2 |
| 2026-11-14 | Enhancement | README.md, AgentDoc/SESSION-BRIEF.md | Documented constellations feature | ~+4 | ~-1 |
| 2026-11-14 | Enhancement | index.html, style.css, app.js | Refactored into separate files; added Explorer's Guide (galaxy/constellations/planets/moons/dwarfs/comets intros) and expanded grand tour with galaxy+constellation intro | ~+120 | ~-20 (net restructure) |
| 2026-11-14 | Enhancement | README.md, AgentDoc/SESSION-BRIEF.md, Journal.md | Documented multi-file structure and new intro/guide features | ~+30 | ~-10 |
| 2026-11-14 | Enhancement | index.html, style.css, app.js | Added clickable Milky Way info point, per-constellation hover/tap intros, and guided chapters in ⓘ panel | ~+140 | ~-15 |
| 2026-11-14 | Enhancement | README.md, AgentDoc/SESSION-BRIEF.md, Journal.md | Documented new interaction/guide features | ~+8 | ~-2 |

Approximate counts (not a git repository). Phase 2 verified: skeleton renders
starfield via `http://` **and** `file://` in headless Brave; console clean;
Earth heliocentric position from astronomy-engine ≈ 0.989 AU (correct for the
date); first-open budget ≈ 9.7 MB, inside the approved 8–12 MB.
Phase 3 verified 2026-11-14: sun + 8 planets render with real textures and
corona; ephemeris sanity log |r| = Earth 0.989 AU / Mars 1.608 AU / Jupiter
5.321 AU with ecliptic lat ≈ 0–1.6° (plausible, frame conversion correct);
time controls advance the UTC readout; pause freezes spin. Verification shots:
/tmp/opencode/ss_phase3b.png (overview), ss_phase3_close.png (inner system).
| 2026-11-14 | Polish/features | index.html, style.css, app.js | Loading/perf UX, hover/reset/home, label dimming/deconflict, mobile HUD/cards, time scrubber+Tonight+presets, bright Stars/Grid toggles, Vesta/Pallas/Hale–Bopp, comet tail/compare/distances, chapter step-through | ~+520 | ~-120 |
| 2026-11-14 | Polish/features | README.md, AgentDoc/SESSION-BRIEF.md, Journal.md | Documented latest features and shutdown checkpoint | ~+60 | ~-25 |

Polish/features verified 2026-11-14 (headless Brave over HTTP `http://127.0.0.1:8090/index.html?tour=0`, virtual-time): console clean (`OK`, no uncaught/runtime errors). No new texture/external asset downloads added. Budget remains ~9.7 MB (measured earlier). Shutdown checkpoint: `backup-2026-11-14-polish-checkpoint/` + `.tar.gz`.
| 2026-11-15 | Regression fix | app.js | Hoisted brightStarsGroup/skyGridGroup/brightStarLabels declarations above applyToggles to fix TDZ startup ReferenceError | ~+4 | ~-3 |

Fix verified 2026-11-15 in headless Brave: after hoisting, `?tour=0`, `?body=hale-bopp`, and `?body=vesta` loaded without runtime errors. NOTE: these headless runs used unique browser profiles and therefore re-fetched CDN assets; flagged as a data-saver violation. Checkpoint refreshed locally (no network).
| 2026-11-15 | Cursor zoom | app.js | Free-view zoom anchors to cursor (wheel) / pinch midpoint (touch); disabled on selection so a body stays centred | +8 | -0 |
| 2026-11-15 | Docs sync | README.md, CREDITS.md, LICENSE | Rewrote public README; added detailed credits and MIT licence | +174 | -40 |
| 2026-11-15 | Docs | Journal.md | Record cursor zoom and GitHub publication | ~+5 | -0 |

Cursor zoom: verified against the pinned three.js 0.187 OrbitControls source
(`zoomToCursor` supports wheel and pinch midpoint) and by `node --check` on
app.js. Full browser runtime check deferred to respect the data-saver limit.

## 2026-11-15 — Refactor (local)

Branch `Refactor` only; `main` is untouched at `e84e4b6`. No new runtime
dependencies: three.js and astronomy-engine stay pinned in `index.html`'s
import map, tests run on `node --test`, nothing is bundled. Feature freeze —
this is a move-only refactor; the only intentional behaviour change is that
`easeOutQuint` (defined but never called upstream) is gone.

| Date | Step | File | Purpose | Added | Removed |
| --- | --- | --- | --- | --- | --- |
| 2026-11-15 | A | package.json | `"type": "module"` so `node --test` can load the sources; `test` script | +11 | -0 |
| 2026-11-15 | A | src/config.js | Scales, speeds, sky constants, easing functions | +42 | -0 |
| 2026-11-15 | A | src/state.js | The one mutable store: time/view/sel plus ownership rules, device detection, URL date | +64 | -0 |
| 2026-11-15 | A | src/astronomy/coordinates.js | J2000 epoch, EQJ→ecliptic rotation, scene mapping, RA/Dec, UTC formatting | +48 | -0 |
| 2026-11-15 | A | src/astronomy/kepler.js | Kepler equation solver and two-body propagation for dwarfs/comets | +49 | -0 |
| 2026-11-15 | A | src/astronomy/ephemeris.js | astronomy-engine adapter, isolated so the maths stays testable under Node | +32 | -0 |
| 2026-11-15 | A | src/systems/time.js | Clock arithmetic as pure functions (clamp, advance, speed, pause) | +30 | -0 |
| 2026-11-15 | A | tests/coordinates.test.js | 8 tests: epochs, rotation invariants, frame mapping, formatting | +69 | -0 |
| 2026-11-15 | A | tests/kepler.test.js | 7 tests: solver residuals, Halley perihelion, finite positions | +73 | -0 |
| 2026-11-15 | A | tests/time.test.js | 7 tests: speed ordering, advance, pause, clamping | +58 | -0 |
| 2026-11-15 | B | src/data/bodies.js | Sun/planets/moons/dwarfs/comet tables as inert records | +107 | -0 |
| 2026-11-15 | B | src/data/sky.js | Constellations and bright stars, unpicked from the anonymous build blocks | +74 | -0 |
| 2026-11-15 | C | src/scene/bodies.js | Lights, body construction, comet tails, per-frame position pass | +268 | -0 |
| 2026-11-15 | C | src/scene/structures.js | Saturn's rings, instanced belts, orbit polylines | +133 | -0 |
| 2026-11-15 | C | src/scene/sky.js | Starfield, constellations, bright stars, ecliptic/equator grid | +195 | -0 |
| 2026-11-15 | C | src/scene/labels.js | Projected DOM labels and the overlap-deconfliction pass | +90 | -0 |
| 2026-11-15 | C | src/audio.js | WebAudio ambience and arrival chime, created on first enable | +65 | -0 |
| 2026-11-15 | D | src/ctx.js | The cross-module entry points, filled once by the entry point | +18 | -0 |
| 2026-11-15 | D | src/systems/interaction.js | Selection, fly-to/follow, fact card, strip, picking, keyboard, `?body` | +408 | -0 |
| 2026-11-15 | D | src/systems/tour.js | Cinematic intro and fly-past; saves/restores the constellation overlay | +221 | -0 |
| 2026-11-15 | E | src/ui/hud.js | Time controls, visibility toggles, info panel, Milky Way framing | +129 | -0 |
| 2026-11-15 | E | src/ui/time-machine.js | Notable events, date jump, scrub slider, now/today | +84 | -0 |
| 2026-11-15 | E | src/ui/chapters.js | Five chapters with step-through, built on the same public entry points | +156 | -0 |
| 2026-11-15 | E | src/ui/toast.js | The transient one-line message, shared by entry point and HUD | +22 | -0 |
| 2026-11-15 | E | src/main.js | Entry point: renderer, scene boot order, ctx wiring, animation loop | +225 | -0 |
| 2026-11-15 | E | index.html | Script entry `app.js` → `src/main.js` | +1 | -1 |
| 2026-11-15 | E | app.js | Deleted: the 1,873-line file this branch splits up | +0 | -1873 |
| 2026-11-15 | E | Journal.md | This section | ~+40 | -0 |

Verification: `node --test tests/` was 22/22 at every stage, including after
`app.js` was removed; every module passes `node --check`. A headless Brave run
against `http://localhost:8091/` once `index.html` pointed at `src/main.js`
reported zero uncaught / ReferenceError / TypeError, with the ephemeris sanity
log unchanged (Earth 0.989 AU, Mars 1.609 AU, Jupiter 5.322 AU; Kepler bodies
as before).

Deferred at the user's request: the info-panel and chapter click paths have
not been driven in a browser since the last extraction. The headless harness
began timing out on `--dump-dom` / `--screenshot` while the page still loaded
and rendered, so that check belongs to the next step. Nothing is pushed — all
six commits are local to `Refactor`.

## 2026-11-16 — Trace (features ported from the parallel build)

Branch `Trace`, cut from `a949e05`. `main` stays at `e84e4b6` and `Refactor`
is untouched. No new dependencies. Five commits, one feature each:

`12980db` clock · `3c6cb1f` star precession · `a2021da` motion tracer ·
`e900909` screenshot + share · `3bb3098` keyboard map + meta.

| Date | Step | File | Purpose | Added | Removed |
|---|---|---|---|---|---|
| 2026-11-16 | Clock | src/config.js | `1 hour/s` tier between real time and 1 day/s | +1 | -0 |
| 2026-11-16 | Clock | src/state.js | `time.dir` and `speedIdx` 2 so startup stays 1 day/s | +3 | -1 |
| 2026-11-16 | Clock | src/systems/time.js | `advanceClock` honours direction; `toggleReverse` resumes a paused clock | +12 | -2 |
| 2026-11-16 | Clock | src/ui/hud.js | Reverse button wiring and a ◀ prefix on the speed label | +5 | -2 |
| 2026-11-16 | Clock | index.html | Reverse button; key hints in the time-control titles | +4 | -3 |
| 2026-11-16 | Clock | src/systems/interaction.js | `R` shortcut | +2 | -1 |
| 2026-11-16 | Clock | tests/time.test.js | Reverse, default direction, new tier, resume-on-reverse | +30 | -1 |
| 2026-11-16 | Star paths | src/astronomy/coordinates.js | Precession pole, angle and Rodrigues rotation (pure, Node-testable) | +36 | -0 |
| 2026-11-16 | Star paths | src/scene/star-paths.js | Path geometry, markers on the sim date, disposal on toggle | +99 | -0 |
| 2026-11-16 | Star paths | src/scene/sky.js | Register bright stars; report label clicks through a dep | +8 | -2 |
| 2026-11-16 | Star paths | src/main.js | Init order, toggle callback with toast, per-frame marker update | +14 | -1 |
| 2026-11-16 | Star paths | tests/precession.test.js | Period, linearity, unit pole, length, right-hand rule | +46 | -0 |
| 2026-11-16 | Motion tracer | src/systems/trail-buffer.js | Ring buffer, min-step filter, jump detection (pure) | +61 | -0 |
| 2026-11-16 | Motion tracer | src/systems/trails.js | Relative-to-centre tracer, panel, save/load/export/import | +264 | -0 |
| 2026-11-16 | Motion tracer | src/systems/interaction.js | `traceIntercept` in flyTo; `X` clears trails | +4 | -0 |
| 2026-11-16 | Motion tracer | src/main.js | `initTrails` deps and per-frame `recordTrails` | +9 | -1 |
| 2026-11-16 | Motion tracer | src/state.js | `view.trace` (session-only, not persisted) | +4 | -0 |
| 2026-11-16 | Motion tracer | src/ui/hud.js | Persist the toggle set without `trace` | +5 | -1 |
| 2026-11-16 | Motion tracer | index.html | Trace toggle, trail panel, file input | +19 | -0 |
| 2026-11-16 | Motion tracer | style.css | Trail panel, chip `on` state, mobile position | +13 | -0 |
| 2026-11-16 | Motion tracer | tests/trails.test.js | Append, trim, min step, pause, jump, seed | +92 | -0 |
| 2026-11-16 | Screenshot + share | src/ui/screenshot.js | Flag consumed right after render (no `preserveDrawingBuffer`) | +37 | -0 |
| 2026-11-16 | Screenshot + share | src/ui/share-url.js | Pure share URL builder | +15 | -0 |
| 2026-11-16 | Screenshot + share | src/ui/share-link.js | Current moment + clipboard, with a visible fallback | +30 | -0 |
| 2026-11-16 | Screenshot + share | src/ui/hud.js | Wire 📷 and 🔗 | +7 | -0 |
| 2026-11-16 | Screenshot + share | src/systems/interaction.js | `P` shortcut through `ctx` | +1 | -0 |
| 2026-11-16 | Screenshot + share | src/main.js | `initScreenshot`, `ctx.requestShot`, capture after render | +4 | -0 |
| 2026-11-16 | Screenshot + share | index.html | 📷 and 🔗 buttons | +2 | -0 |
| 2026-11-16 | Screenshot + share | tests/share-link.test.js | Date, body, `tour=0`, base path | +28 | -0 |
| 2026-11-16 | Keyboard + meta | src/systems/interaction.js | Full key map; modifier guard so Ctrl+C stays copy | +12 | -3 |
| 2026-11-16 | Keyboard + meta | src/ui/hud.js | `toggleInfoPanel` | +1 | -0 |
| 2026-11-16 | Keyboard + meta | src/main.js | Expose `toggleInfoPanel` through `ctx` | +2 | -0 |
| 2026-11-16 | Keyboard + meta | index.html | Keyboard grid; description and OG tags | +16 | -1 |
| 2026-11-16 | Keyboard + meta | style.css | `kbd`, focus rings, reduced-motion, panel rise | +28 | -0 |

Verification: `npm test` is 47/47 (was 22/22) and every module passes
`node --check`. Headless Brave against `http://localhost:8091/` boots with the
ephemeris sanity log intact and zero uncaught / ReferenceError / TypeError,
both on `/` and on `/?body=mars`. The headless `--screenshot` / `--dump-dom`
timeout is unchanged and is a `ReadPixels` stall in the harness, not a page
fault — it predates this work and was reproduced on the baseline first.

Not driven in a browser yet: tracer clicks, star-path clicks, the screenshot
capture, and clipboard copy. Those belong to the deferred browser pass. Not
pushed and not merged into `Refactor`.

