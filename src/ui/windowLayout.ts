import type { AppId } from '../engine/services/catalog';

/* Size and position of the floating windows. Kept apart from the session so
 * that the rules can be tested alone: on a classroom screen (1366 × 768) a
 * window must not hide the device it was opened from, nor leave the stage. */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** What a window shows; mirrors `WindowSpec` without importing the session. */
export type WindowKind =
  | {
      readonly type:
        | 'desktop'
        | 'capture'
        | 'switch'
        | 'router'
        | 'diagnose'
        | 'settings'
        | 'activities'
        | 'report'
        | 'quiz'
        | 'author'
        | 'answers';
    }
  /** `alone`: a card read for itself, without the list of the cards beside it. */
  | { readonly type: 'help'; readonly alone?: boolean }
  | { readonly type: 'app'; readonly app: AppId | 'software' };

const APP_SIZE: Partial<Record<AppId | 'software', Size>> = {
  terminal: { width: 640, height: 400 },
  browser: { width: 760, height: 520 },
  mailclient: { width: 720, height: 520 },
  dnsserver: { width: 640, height: 520 },
  dhcpserver: { width: 640, height: 560 },
  mailserver: { width: 640, height: 520 },
  firewall: { width: 760, height: 460 },
  software: { width: 560, height: 520 },
};

const TYPE_SIZE: Record<Exclude<WindowKind['type'], 'app'>, Size> = {
  desktop: { width: 560, height: 360 },
  capture: { width: 900, height: 520 },
  switch: { width: 520, height: 380 },
  router: { width: 680, height: 460 },
  help: { width: 960, height: 620 },
  diagnose: { width: 600, height: 520 },
  settings: { width: 560, height: 520 },
  activities: { width: 560, height: 460 },
  report: { width: 760, height: 560 },
  quiz: { width: 560, height: 520 },
  author: { width: 760, height: 580 },
  answers: { width: 780, height: 600 },
};

/**
 * A card read alone: a column of text about 65 characters wide, as high as
 * the stage allows, since a card is longer than it is wide.
 */
const CARD_SIZE: Size = { width: 560, height: 720 };
/**
 * On a wide stage the card takes half of it, up to the width where its lines
 * reach 42 em: longer ones are harder to read, whatever the room left.
 */
const CARD_WIDTH_SHARE = 0.5;
const CARD_MAX_WIDTH = 720;

const MIN_WIDTH = 320;
const MIN_HEIGHT = 180;
/** Free space kept around a window that fits in the stage. */
const MARGIN = 8;
/** Shift between two windows opened one after the other. */
const CASCADE = 26;
/** A window never takes more than this share of the stage width by default. */
const MAX_WIDTH_SHARE = 0.55;
/**
 * The help is read for itself, not beside a device: it may take more room,
 * so that a card keeps a readable width beside the list of the cards.
 */
const HELP_WIDTH_SHARE = 0.85;
/** Part of the title bar that always stays reachable. */
const GRIP_WIDTH = 120;
const GRIP_HEIGHT = 36;

/** Size a window would like to have. */
export function defaultWindowSize(kind: WindowKind): Size {
  if (kind.type === 'app') return APP_SIZE[kind.app] ?? { width: 600, height: 440 };
  if (kind.type === 'help' && kind.alone === true) return CARD_SIZE;
  return TYPE_SIZE[kind.type];
}

/** Size of a window in a stage of the given size (unknown in the tests). */
export function fitWindow(size: Size, stage: Size | null, kind?: WindowKind): Size {
  if (!stage) return size;
  const share = kind?.type === 'help' ? HELP_WIDTH_SHARE : MAX_WIDTH_SHARE;
  const maxWidth = Math.max(MIN_WIDTH, Math.min(stage.width - 2 * MARGIN, stage.width * share));
  const maxHeight = Math.max(MIN_HEIGHT, stage.height - 2 * MARGIN);
  const alone = kind?.type === 'help' && kind.alone === true;
  const wanted = alone
    ? Math.max(size.width, Math.min(CARD_MAX_WIDTH, stage.width * CARD_WIDTH_SHARE))
    : size.width;
  return {
    width: Math.round(Math.min(wanted, maxWidth)),
    height: Math.round(Math.min(size.height, maxHeight)),
  };
}

/**
 * Left edge of a window whose width changes: its right edge stays where it
 * is, as long as the window stays in the stage.
 */
export function widenFromRight(window: Rect, width: number, stage: Size | null): number {
  const x = window.x + window.width - width;
  if (!stage) return Math.max(0, x);
  return Math.round(Math.max(MARGIN, Math.min(x, stage.width - width - MARGIN)));
}

/** Keeps the title bar of a window reachable. */
export function clampWindow(position: Point, stage: Size | null): Point {
  if (!stage) return { x: Math.max(0, position.x), y: Math.max(0, position.y) };
  return {
    x: Math.round(Math.min(Math.max(0, position.x), Math.max(0, stage.width - GRIP_WIDTH))),
    y: Math.round(Math.min(Math.max(0, position.y), Math.max(0, stage.height - GRIP_HEIGHT))),
  };
}

/**
 * Position of the `index`-th window: against the `side` edge of the stage, each
 * one a title bar lower than the previous one. Windows do not shift sideways,
 * so that they hide as little of the plan as possible. The whole window stays
 * in the stage when it fits.
 */
export function placeWindow(size: Size, stage: Size | null, side: 'left' | 'right', index: number): Point {
  const step = index % 6;
  if (!stage) return { x: 80 + step * 28, y: 60 + step * 28 };
  const maxX = Math.max(MARGIN, stage.width - size.width - MARGIN);
  const maxY = Math.max(MARGIN, stage.height - size.height - MARGIN);
  return {
    x: Math.round(side === 'right' ? maxX : MARGIN),
    y: Math.round(Math.min(MARGIN + step * CASCADE, maxY)),
  };
}

export interface Rect extends Point, Size {}

/** What a new window should hide as little as possible, in the coordinates of the stage. */
export interface Obstacles {
  /** The devices drawn on the plan. */
  readonly devices: readonly Rect[];
  /** The device the window is opened from: the last one to hide. */
  readonly own?: Rect | null;
  /** The windows already open. */
  readonly windows: readonly Rect[];
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Hiding the device one works on is the worst. Then the title bar of another
 * window: it holds its close button, and a pupil cannot guess that a window is
 * underneath, while a hidden device shows again as soon as a window is moved.
 * Then any device.
 */
const COST_OWN = 1000;
const COST_TITLE = 100;
const COST_DEVICE = 10;
const COST_OTHER_SIDE = 1;
/** For each title bar of height given up. */
const COST_SHORTER = 1;
/** For each step away from the edge, which covers a little more of the plan. */
const COST_INSET = 2;
/** End of a title bar that is enough to catch a window, or to close it (its button is at the right end). */
const GRIP = 44;
/** A window is opened at most this many grips away from its edge. */
const MAX_INSET = 2;

/** True when `rect` leaves neither end of the title bar of `window` reachable. */
function hidesTitle(rect: Rect, window: Rect): boolean {
  const bar = { y: window.y, width: GRIP, height: CASCADE };
  return (
    overlaps({ ...bar, x: window.x }, rect) && overlaps({ ...bar, x: window.x + window.width - GRIP }, rect)
  );
}
/** A window is not opened under this share of its height to spare the plan. */
const MIN_HEIGHT_SHARE = 0.75;

/**
 * Where to open a window so that the plan stays readable: against the left or
 * the right edge of the stage, at the height where it hides the fewest devices.
 * A pupil who types `ping` must still see the routers the packet goes through.
 * Near the bottom of the stage the window is opened less high rather than over
 * a device. Devices already under another window cost nothing more, so the
 * windows of a computer pile up in the same corner, each one a title bar lower
 * when there is room, a little away from the edge otherwise: the title bar of
 * the window underneath, with its close button, stays reachable. With nothing
 * to avoid: the top of the `side` edge.
 */
export function chooseWindowPlace(
  size: Size,
  stage: Size,
  side: 'left' | 'right',
  obstacles: Obstacles,
): Rect {
  const maxX = Math.max(MARGIN, stage.width - size.width - MARGIN);
  const minHeight = Math.min(size.height, Math.max(MIN_HEIGHT, Math.round(size.height * MIN_HEIGHT_SHARE)));
  /** Lowest place of the window, at its full height then at its smallest one. */
  const fullY = Math.max(MARGIN, stage.height - size.height - MARGIN);
  const lastY = Math.max(fullY, stage.height - minHeight - MARGIN);
  const visible = obstacles.devices.filter((d) => !obstacles.windows.some((w) => overlaps(d, w)));
  const tops: number[] = [];
  for (let y = MARGIN; y < lastY; y += CASCADE) {
    // The lowest place of the whole window is always tried.
    if (y > fullY && (tops.at(-1) ?? fullY) < fullY) tops.push(fullY);
    tops.push(y);
  }
  if (!tops.includes(fullY)) tops.push(fullY);
  tops.push(lastY);
  let best: { rect: Rect; cost: number } | null = null;
  for (const edge of side === 'right' ? (['right', 'left'] as const) : (['left', 'right'] as const)) {
    for (let inset = 0; inset <= MAX_INSET; inset++) {
      const x = Math.round(edge === 'right' ? maxX - inset * GRIP : MARGIN + inset * GRIP);
      if (inset > 0 && (x < MARGIN || x > maxX)) break;
      for (const y of tops) {
        const height = Math.round(y <= fullY ? size.height : stage.height - MARGIN - y);
        const rect = { x, y: Math.round(y), width: size.width, height };
        const cost =
          (obstacles.own && overlaps(obstacles.own, rect) ? COST_OWN : 0) +
          COST_DEVICE * visible.filter((d) => overlaps(d, rect)).length +
          COST_TITLE * obstacles.windows.filter((w) => hidesTitle(rect, w)).length +
          COST_SHORTER * Math.ceil((size.height - height) / CASCADE) +
          COST_INSET * inset +
          (edge === side ? 0 : COST_OTHER_SIDE);
        // The first of the cheapest: the preferred edge, against it, then the highest place.
        if (!best || cost < best.cost) best = { rect, cost };
      }
    }
  }
  return best?.rect ?? { x: MARGIN, y: MARGIN, ...size };
}
