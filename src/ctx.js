/* ================================================================== */
/* ctx — the small set of cross-module entry points.                   */
/*                                                                     */
/* systems/interaction.js, systems/tour.js and ui/hud.js all call into  */
/* each other (Esc closes the info panel, Home stops the tour, the      */
/* tour needs the HUD refreshed). Importing one another directly would  */
/* be a cycle: ES modules allow it, but only for hoisted function       */
/* declarations, so an accidental top-level read would break at load.   */
/*                                                                     */
/* Instead main.js fills this object once, after every module is        */
/* defined, and the modules call ctx.foo() at interaction time.        */
/* Nothing else may write to it.                                       */
/*                                                                     */
/* Pure maths helpers (easings) are deliberately NOT in here — they are */
/* imported from config.js, because they have no state and no cycle.    */
/* ================================================================== */

export const ctx = {};
