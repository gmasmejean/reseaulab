import type { Scheduler } from '../engine/core/scheduler';

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

/** Largest simulated step per animation frame, so a hidden tab does not burst. */
const MAX_FRAME_MS = 100;

/**
 * Drives the virtual scheduler from real time: each animation frame advances
 * the simulation by (elapsed real ms × speed).
 */
export class SimulationClock {
  speed = 0.5;
  private handle: number | null = null;
  private last: number | null = null;

  constructor(
    private readonly scheduler: () => Scheduler,
    private readonly onFrame: () => void,
    private readonly frames: FrameSource = browserFrames,
  ) {}

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
    const scheduler = this.scheduler();
    scheduler.runUntil(scheduler.now + elapsed * this.speed);
    this.onFrame();
    this.handle = this.frames.request(this.tick);
  };
}
