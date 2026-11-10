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
        | 'help'
        | 'diagnose'
        | 'settings'
        | 'activities'
        | 'report'
        | 'quiz'
        | 'author';
    }
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
  help: { width: 780, height: 540 },
  diagnose: { width: 600, height: 520 },
  settings: { width: 560, height: 520 },
  activities: { width: 560, height: 460 },
  report: { width: 760, height: 560 },
  quiz: { width: 560, height: 520 },
  author: { width: 760, height: 580 },
};

const MIN_WIDTH = 320;
const MIN_HEIGHT = 180;
/** Free space kept around a window that fits in the stage. */
const MARGIN = 8;
/** Shift between two windows opened one after the other. */
const CASCADE = 26;
/** A window never takes more than this share of the stage width by default. */
const MAX_WIDTH_SHARE = 0.55;
/** Part of the title bar that always stays reachable. */
const GRIP_WIDTH = 120;
const GRIP_HEIGHT = 36;

/** Size a window would like to have. */
export function defaultWindowSize(kind: WindowKind): Size {
  if (kind.type === 'app') return APP_SIZE[kind.app] ?? { width: 600, height: 440 };
  return TYPE_SIZE[kind.type];
}

/** Size of a window in a stage of the given size (unknown in the tests). */
export function fitWindow(size: Size, stage: Size | null): Size {
  if (!stage) return size;
  const maxWidth = Math.max(MIN_WIDTH, Math.min(stage.width - 2 * MARGIN, stage.width * MAX_WIDTH_SHARE));
  const maxHeight = Math.max(MIN_HEIGHT, stage.height - 2 * MARGIN);
  return {
    width: Math.round(Math.min(size.width, maxWidth)),
    height: Math.round(Math.min(size.height, maxHeight)),
  };
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
