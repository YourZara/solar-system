/* ================================================================== */
/* ui/screenshot — capture the canvas as a PNG.                        */
/*                                                                     */
/* The request is a flag, not an immediate capture: the loop renders    */
/* and then captures in the same task, so the drawing buffer is still   */
/* valid and no preserveDrawingBuffer cost is paid on every frame.      */
/* ================================================================== */
import { time, sel } from '../state.js';
import { formatUtc } from '../astronomy/coordinates.js';

let canvas = null;
let notify = () => {};
let wanted = false;

export function initScreenshot(deps) {
  canvas = deps.canvas;
  notify = deps.notify;
}

export function requestShot() { wanted = true; }

/* Called by the entry point immediately after renderer.render(). */
export function takePendingShot() {
  if (!wanted || !canvas) return;
  wanted = false;
  canvas.toBlob((blob) => {
    if (!blob) { notify('Screenshot failed'); return; }
    const day = formatUtc(time.simMs).slice(0, 10);
    const key = sel.current ? '-' + sel.current.key : '';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `solar-system-${day}${key}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    notify('Screenshot saved');
  }, 'image/png');
}
