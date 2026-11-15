/* ================================================================== */
/* ui/toast — the one-line transient message.                          */
/*                                                                     */
/* Smallest possible module, but shared: the entry point (sound hint), */
/* the HUD (toggle feedback) and the tour all need the same element.   */
/* Creating it lazily keeps index.html free of empty markup.           */
/* ================================================================== */

let toastTimer = null;

export function showToast(msg, ms = 2600) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
