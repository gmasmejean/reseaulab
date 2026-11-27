/* Width of the activity panel, chosen by hand. Kept apart from the component
 * so that the rules can be tested alone: the panel may grow for reading, but
 * the plan must stay usable next to it. */

/** Width of the panel when nobody has resized it, on a classroom screen (1366 px). */
export const ACTIVITY_DEFAULT_WIDTH = 320;
/** On a wider screen the panel takes this share of the window by default... */
const ACTIVITY_WIDE_SHARE = 0.23;
/** ...up to lines of about 60 characters: beyond that the plan pays for nothing. */
export const ACTIVITY_WIDE_WIDTH = 440;
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

/**
 * Width of the panel when nobody has resized it, in a window of the given
 * width: the instructions get longer lines where the plan can spare the room.
 */
export function defaultActivityWidth(windowWidth: number): number {
  const wanted = Math.round(windowWidth * ACTIVITY_WIDE_SHARE);
  return Math.min(ACTIVITY_WIDE_WIDTH, Math.max(ACTIVITY_DEFAULT_WIDTH, wanted));
}

/** A width read back from the browser; null when absent or unusable. */
export function parseActivityWidth(text: string | null): number | null {
  if (text === null || text.trim() === '') return null;
  const width = Number(text);
  if (!Number.isFinite(width) || width < ACTIVITY_MIN_WIDTH || width > MAX_STORED_WIDTH) return null;
  return Math.round(width);
}
