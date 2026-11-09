import type { Scheduler } from '../engine/core/scheduler';
import { LINK_DELAY } from '../engine/network';

export interface FrameSource {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
}

export const browserFrames: FrameSource = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (h) => {
    cancelAnimationFrame(h);
  },
};

/** Largest real time handled per animation frame, so a hidden tab does not burst. */
const MAX_FRAME_MS = 100;

/** Real milliseconds a frame takes to cross a cable at speed × 1. */
export const HOP_MS = 400;

/** Guard against a scheduler that keeps scheduling events at the same instant. */
const MAX_STEPS_PER_FRAME = 10_000;

/**
 * Drives the virtual scheduler from real time, in slow motion while frames
 * are on the cables so that pupils can follow them:
 * - while a frame crosses a cable, the simulation runs so that one crossing
 *   takes HOP_MS / speed real milliseconds;
 * - otherwise (waiting for a timer: interval between pings, timeouts…) the
 *   simulated time flows like real time, faster when speed > 1.
 */
export class SimulationClock {
  speed = 1;
  private handle: number | null = null;
  private last: number | null = null;

  constructor(
    private readonly scheduler: () => Scheduler,
    private readonly onFrame: () => void,
    private readonly frames: FrameSource = browserFrames,
    /** Simulated time when the last frame now on a cable arrives, or null. */
    private readonly busyUntil: () => number | null = () => null,
  ) {}

  /** Simulated ms per real ms while a frame is on a cable. */
  get transitRate(): number {
    return (LINK_DELAY * this.speed) / HOP_MS;
  }

  /** Simulated ms per real ms while the cables are idle. */
  get idleRate(): number {
    return Math.max(1, this.speed);
  }

  /** Advances the simulation by `real` milliseconds of real time. */
  advance(real: number): void {
    const scheduler = this.scheduler();
    let budget = real;
    for (let step = 0; budget > 0 && step < MAX_STEPS_PER_FRAME; step++) {
      const start = scheduler.now;
      const busyUntil = this.busyUntil();
      if (busyUntil !== null && busyUntil > start) {
        const rate = this.transitRate;
        const target = Math.min(busyUntil, start + budget * rate);
        scheduler.runUntil(target);
        budget -= (target - start) / rate;
      } else {
        // Idle: jump to the next event, which may put a frame on a cable.
        const rate = this.idleRate;
        const limit = start + budget * rate;
        const next = scheduler.nextEventTime();
        const target = next === null ? limit : Math.min(next, limit);
        scheduler.runUntil(target);
        budget -= (target - start) / rate;
      }
    }
  }

  get running(): boolean {
    return this.handle !== null;
  }

  start(): void {
    if (this.handle !== null) return;
    this.last = null;
    this.handle = this.frames.request(this.tick);
  }

  stop(): void {
    if (this.handle !== null) this.frames.cancel(this.handle);
    this.handle = null;
    this.last = null;
  }

  private readonly tick = (time: number): void => {
    const elapsed = this.last === null ? 0 : Math.min(time - this.last, MAX_FRAME_MS);
    this.last = time;
    this.advance(elapsed);
    this.onFrame();
    this.handle = this.frames.request(this.tick);
  };
}
