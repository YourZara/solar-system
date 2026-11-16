/* ================================================================== */
/* ui/share-url — pure URL building for a shared moment.               */
/*                                                                     */
/* The page already understands ?date=, ?body= and ?tour=0, so sharing  */
/* is only string building. The base is passed in so this module has    */
/* no browser imports and can be tested under Node.                    */
/* ================================================================== */

export function buildShareUrl({ origin, pathname, dateISO, bodyKey }) {
  const u = new URL(origin + pathname);
  if (dateISO) u.searchParams.set('date', dateISO);
  if (bodyKey) u.searchParams.set('body', bodyKey);
  u.searchParams.set('tour', '0'); // land on the scene, not the intro
  return u.toString();
}
