/* ================================================================== */
/* systems/time — the simulation clock's arithmetic.                   */
/*                                                                     */
/* Pure functions over a clock-shaped object { simMs, paused, speedIdx, */
/* prevSimMs }, so they can be tested under Node without a browser.    */
/* The owning object lives in state.js; the loop and the HUD drive it. */
/* ================================================================== */
import { SPEEDS } from '../config.js';

/* Clamp a real-time delta so a backgrounded tab doesn't jump the clock. */
export const MAX_DT_S = 0.1;
export function clampDt(seconds) { return Math.min(seconds, MAX_DT_S); }

/* Advance the clock by dtSeconds of real time. Returns the new simMs.
   prevSimMs is always recorded — the render loop uses it for spin.
   time.dir is +1 or -1; an object without one (older callers, tests)
   still runs forward. */
export function advanceClock(time, dtSeconds, speeds = SPEEDS) {
  time.prevSimMs = time.simMs;
  if (!time.paused) time.simMs += dtSeconds * 1000 * speeds[time.speedIdx].mult * (time.dir ?? 1);
  return time.simMs;
}

export function changeSpeed(time, delta, speeds = SPEEDS) {
  time.speedIdx = Math.min(speeds.length - 1, Math.max(0, time.speedIdx + delta));
  return time.speedIdx;
}

export function togglePause(time) {
  time.paused = !time.paused;
  return time.paused;
}

/* Reverse is a direction, not a pause: pressing it on a paused clock
   resumes it, so the user sees the motion they just asked for. */
export function toggleReverse(time) {
  time.dir = (time.dir ?? 1) * -1;
  if (time.paused) time.paused = false;
  return time.dir;
}
