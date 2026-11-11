/* Width of the activity panel, chosen by hand. Kept apart from the component
 * so that the rules can be tested alone: the panel may grow for reading, but
 * the plan must stay usable next to it. */

/** Width of the panel when nobody has resized it. */
export const ACTIVITY_DEFAULT_WIDTH = 320;
/** Below this, the questions and their choices no longer fit. */
export const ACTIVITY_MIN_WIDTH = 280;
/** What the plan keeps at least, so that devices can still be reached. */
export const MIN_STAGE_WIDTH = 360;
/** One press on an arrow key. */
export const ACTIVITY_WIDTH_STEP = 40;
/** Beyond any screen: a stored value above this is ignored. */
const MAX_STORED_WIDTH = 4000;

/**
 * The width actually given to the panel. `available` is the room shared by
 * the plan and the panel; 0 when it is unknown (no layout yet), and then only
 * the minimum applies.
 */
export function clampActivityWidth(width: number, available: number): number {
  const max = available > 0 ? Math.max(ACTIVITY_MIN_WIDTH, available - MIN_STAGE_WIDTH) : Infinity;
  return Math.round(Math.min(max, Math.max(ACTIVITY_MIN_WIDTH, width)));
}

/** A width read back from the browser; null when absent or unusable. */
export function parseActivityWidth(text: string | null): number | null {
  if (text === null || text.trim() === '') return null;
  const width = Number(text);
  if (!Number.isFinite(width) || width < ACTIVITY_MIN_WIDTH || width > MAX_STORED_WIDTH) return null;
  return Math.round(width);
}
