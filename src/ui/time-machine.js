/* ================================================================== */
/* ui/time-machine — jump the simulation clock to a date.              */
/*                                                                     */
/* Writes state.time only; everything that draws the clock reads it.    */
/* The scrub slider is relative to the date last set, so dragging it    */
/* never accumulates rounding error.                                   */
/* ================================================================== */
import { time } from '../state.js';
import { refreshHud } from './hud.js';

const tmToggle = document.getElementById('tm-toggle');
const tmPanel = document.getElementById('time-machine');
const tmDate = document.getElementById('tm-date');
const tmGo = document.getElementById('tm-go');
const tmToday = document.getElementById('tm-today');
const tmNow = document.getElementById('tm-now');
const tmScrub = document.getElementById('tm-scrub');
const tmEvents = document.getElementById('tm-events');

let scrubBaseMs = Date.now();

/* Moments worth visiting: oppositions, a perihelion, an eclipse. */
export const NOTABLE_EVENTS = [
  { label: 'Great Conjunction 2020 (Jup–Sat)', date: '2020-12-21' },
  { label: 'Mars opposition 2018', date: '2018-07-27' },
  { label: 'Jupiter opposition 2023', date: '2023-11-03' },
  { label: 'Saturn opposition 2024', date: '2024-09-08' },
  { label: 'Halley perihelion 1986', date: '1986-02-09' },
  { label: 'Voyager 2 at Neptune', date: '1989-08-25' },
  { label: 'Total solar eclipse 2017', date: '2017-08-21' },
];

export function setSimDate(iso, pushUrl = true) {
  const d = new Date(iso + (iso.length <= 10 ? 'T12:00:00Z' : ''));
  if (isNaN(d)) return;
  time.simMs = d.getTime();
  scrubBaseMs = time.simMs;
  if (tmScrub) tmScrub.value = 0;
  time.paused = true;
  refreshHud();
  if (pushUrl) {
    try {
      const u = new URL(location.href);
      u.searchParams.set('date', iso.slice(0, 10));
      history.replaceState(null, '', u);
    } catch { /* file:// */ }
  }
}

function setClockNow(paused) {
  time.simMs = Date.now();
  scrubBaseMs = time.simMs;
  if (tmScrub) tmScrub.value = 0;
  time.paused = paused;
  refreshHud();
  try {
    const u = new URL(location.href);
    u.searchParams.delete('date');
    history.replaceState(null, '', u);
  } catch { /* file:// */ }
}

export function initTimeMachine() {
  tmToggle.addEventListener('click', () => tmPanel.classList.toggle('open'));
  tmGo.addEventListener('click', () => { if (tmDate.value) setSimDate(tmDate.value); });
  tmToday.addEventListener('click', () => setClockNow(false));
  if (tmNow) tmNow.addEventListener('click', () => setClockNow(true));
  if (tmScrub) {
    tmScrub.addEventListener('input', () => {
      const days = parseInt(tmScrub.value, 10) || 0;
      time.simMs = scrubBaseMs + days * 86400000;
      time.paused = true;
      refreshHud();
    });
  }
  for (const ev of NOTABLE_EVENTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = ev.label;
    b.addEventListener('click', () => { tmDate.value = ev.date; setSimDate(ev.date); });
    tmEvents.appendChild(b);
  }
}
