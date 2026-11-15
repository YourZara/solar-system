/* ================================================================== */
/* ui/chapters — the guided lesson list in the info panel.             */
/*                                                                     */
/* Each chapter is a short sequence of steps; a step is a caption plus  */
/* an action that moves the camera or switches something on. Chapters   */
/* deliberately use the same public entry points as a user would, so    */
/* the lesson can never do something the UI cannot.                    */
/* ================================================================== */
import { view } from '../state.js';
import { selectableByKey, flyTo, resetHome, showCustomCard } from '../systems/interaction.js';
import { startTour } from '../systems/tour.js';
import { setSimDate } from './time-machine.js';
import { applyToggles, closeInfoPanel, openInfoPanel, showGalaxy } from './hud.js';

let camera = null;
let controls = null;

const CHAPTERS = [
  { id: 'galaxy', title: 'Our Galaxy', steps: [
    { caption: 'We live inside the Milky Way — a spiral galaxy of hundreds of billions of stars.',
      run: () => {
        controls.target.set(0, 0, 0);
        camera.position.set(0, 700, 2200);
        showCustomCard({
          name: 'The Milky Way', type: 'Galaxy',
          stats: [['Type', 'Barred spiral galaxy'], ['Our location', 'Orion Arm']],
          fact: 'The glowing band around you is our galaxy seen from within. The solar system is just one tiny neighborhood here.',
        });
      } },
    { caption: 'Use the Milky Way button anytime to return to this galaxy view.',
      run: () => showGalaxy() },
  ] },
  { id: 'constellations', title: 'Constellations', steps: [
    { caption: 'Constellations are patterns we draw between stars to navigate and tell stories.',
      run: () => {
        view.constellations = true;
        applyToggles();
        controls.target.set(0, 0, 0);
        camera.position.set(400, 350, 1400);
        showCustomCard({
          name: 'Constellations', type: 'Sky patterns',
          stats: [['Shown', '14 famous patterns']],
          fact: 'Turn on Constellations and hover a name to read its story. Try finding Orion or the Southern Cross (Crux).',
        });
      } },
    { caption: 'Prompt: hover a constellation label — can you spot Orion’s belt of three stars?',
      run: () => { view.constellations = true; applyToggles(); } },
  ] },
  { id: 'planets', title: 'Solar System & Planets', steps: [
    { caption: 'The Sun anchors eight planets, each on its own path and rhythm.',
      run: () => {
        resetHome(true);
        showCustomCard({
          name: 'The Solar System', type: 'Planetary system',
          stats: [['Star', '1 (Sun)'], ['Planets', '8']],
          fact: 'Use the body strip or click any world to fly there. The time machine lets you see where they were on any date.',
        });
      } },
    { caption: 'Take the grand tour for a guided glide past every planet.',
      run: () => { closeInfoPanel(); startTour(true); } },
  ] },
  { id: 'moons', title: 'Moons', steps: [
    { caption: 'Moons are worlds of their own, orbiting planets.',
      run: () => flyToKey('earth') },
    { caption: 'Jupiter’s Galilean moons — Io, Europa, Ganymede, Callisto — are easy to spot up close.',
      run: () => flyToKey('jupiter') },
    { caption: 'Prompt: zoom near Saturn to find Titan, or Neptune to glimpse Triton.',
      run: () => flyToKey('saturn') },
  ] },
  { id: 'dwarfs', title: 'Dwarf Planets & Comets', steps: [
    { caption: 'Dwarf planets and comets trace long, distant paths.',
      run: () => flyToKey('ceres') },
    { caption: 'Halley’s comet grows a tail near the Sun — jump to 1986 in the time machine to see it blaze.',
      run: () => { setSimDate('1986-02-09'); flyToKey('halley'); } },
  ] },
];

function flyToKey(key) {
  const s = selectableByKey[key];
  if (s) flyTo(s);
}

let activeChapter = null; // { idx, step }

const chapterList = () => document.getElementById('chapters-list');

function renderChapters() {
  const list = chapterList();
  if (!list) return;
  list.innerHTML = '';

  if (activeChapter) {
    const ch = CHAPTERS[activeChapter.idx];
    const step = ch.steps[activeChapter.step];
    const wrap = document.createElement('div');
    wrap.innerHTML =
      `<div style="font-size:12px;color:var(--accent);margin-bottom:4px">${ch.title} — step ${activeChapter.step + 1}/${ch.steps.length}</div>
       <div style="font-size:12px;color:rgba(242,239,230,0.9);line-height:1.4;margin-bottom:8px">${step.caption}</div>`;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '6px';

    const back = document.createElement('button');
    back.className = 'chip';
    back.textContent = 'Back';
    back.disabled = activeChapter.step === 0;
    back.onclick = () => { activeChapter.step--; runChapterStep(); };

    const next = document.createElement('button');
    next.className = 'chip';
    next.textContent = activeChapter.step < ch.steps.length - 1 ? 'Next' : 'Finish';
    next.onclick = () => {
      if (activeChapter.step < ch.steps.length - 1) { activeChapter.step++; runChapterStep(); }
      else { activeChapter = null; renderChapters(); }
    };

    const exit = document.createElement('button');
    exit.className = 'chip';
    exit.textContent = 'Chapters';
    exit.onclick = () => { activeChapter = null; renderChapters(); };

    row.append(back, next, exit);
    wrap.appendChild(row);
    list.appendChild(wrap);
    return;
  }

  CHAPTERS.forEach((ch, idx) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.style.textAlign = 'left';
    b.textContent = ch.title;
    b.addEventListener('click', () => {
      activeChapter = { idx, step: 0 };
      closeInfoPanel();
      runChapterStep();
    });
    list.appendChild(b);
  });
}

function runChapterStep() {
  if (!activeChapter) return;
  const ch = CHAPTERS[activeChapter.idx];
  const step = ch.steps[activeChapter.step];
  try { step.run(); } catch (e) { console.warn('[chapters] step failed:', e); }
  openInfoPanel(); // keep the panel open so the progress is visible
  renderChapters();
}

export function initChapters(deps) {
  camera = deps.camera;
  controls = deps.controls;
  renderChapters();
}
