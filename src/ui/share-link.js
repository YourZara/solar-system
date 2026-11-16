/* ================================================================== */
/* ui/share-link — copy a URL that reopens this moment.                */
/*                                                                     */
/* Only the browser-facing half lives here; the string itself is built */
/* in share-url.js, which is pure and tested.                          */
/* ================================================================== */
import { time, sel } from '../state.js';
import { formatUtc } from '../astronomy/coordinates.js';
import { buildShareUrl } from './share-url.js';

export function currentShareUrl() {
  return buildShareUrl({
    origin: location.origin,
    pathname: location.pathname,
    dateISO: formatUtc(time.simMs).slice(0, 10),
    bodyKey: sel.current ? sel.current.key : null,
  });
}

/* Clipboard needs a secure context and permission; if either is missing
   the link is shown instead of silently doing nothing. */
export async function copyShareLink({ notify }) {
  const text = currentShareUrl();
  try {
    await navigator.clipboard.writeText(text);
    notify('Link copied — opens this date and body');
  } catch {
    notify(text);
  }
}
