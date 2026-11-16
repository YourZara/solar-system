/* ================================================================== */
/* systems/trail-buffer — the arithmetic behind the motion tracer.     */
/*                                                                     */
/* A trail is a ring buffer of scene-space points plus one live head   */
/* vertex that sits on the body itself. Keeping this pure means the    */
/* interesting cases — trimming, the minimum-step filter, and telling  */
/* a scrub from normal motion — are testable under Node.               */
/* ================================================================== */

export const MAX_VERTICES = 6000;   // per trail; oldest dropped first
export const MIN_STEP = 0.15;       // scene units between recorded points

/* A jump is a change the sim clock did not produce: a date pick, a      */
/* scrub, "Today". The slack absorbs a slow frame before we call it     */
/* artificial. A reversed clock has the same magnitude, so this is       */
/* direction-agnostic.                                                  */
export const JUMP_SLACK = 1.5;
export const JUMP_FLOOR_MS = 1000;

export function detectJump(prevSimMs, simMs, expectedMs) {
  if (prevSimMs === null || prevSimMs === undefined) return false;
  return Math.abs(simMs - prevSimMs) > Math.abs(expectedMs) * JUMP_SLACK + JUMP_FLOOR_MS;
}

export function createTrail(max = MAX_VERTICES) {
  // +1: the live head vertex
  return { arr: new Float32Array((max + 1) * 3), n: 0, max };
}

/* Fill a trail from saved points, keeping the newest ones. */
export function seedTrail(t, pts) {
  const keep = Math.min(pts.length, t.max * 3);
  const from = pts.length - keep;
  for (let i = 0; i < keep; i++) t.arr[i] = pts[from + i];
  t.n = Math.floor(keep / 3);
  return t.n;
}

/* Record one position. `moving` gates appending: a paused clock still    */
/* moves the head so the line meets the body, but adds no history.       */
export function recordSample(t, x, y, z, moving, minStep = MIN_STEP) {
  if (moving) {
    const o = (t.n - 1) * 3;
    const stepped = t.n === 0 ||
      Math.abs(x - t.arr[o]) + Math.abs(y - t.arr[o + 1]) + Math.abs(z - t.arr[o + 2]) >= minStep;
    if (stepped) {
      if (t.n >= t.max) {                 // drop the oldest point
        t.arr.copyWithin(0, 3, (t.max + 1) * 3);
        t.n = t.max - 1;
      }
      t.arr[t.n * 3] = x;
      t.arr[t.n * 3 + 1] = y;
      t.arr[t.n * 3 + 2] = z;
      t.n++;
    }
  }
  t.arr[t.n * 3] = x;
  t.arr[t.n * 3 + 1] = y;
  t.arr[t.n * 3 + 2] = z;
  return t.n;
}
