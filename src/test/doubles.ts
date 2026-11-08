import type { FrameSource } from '../ui/clock';
import type { Storage } from '../ui/session';

/** Animation frames driven by hand: `step(ms)` fires the pending frame. */
export class ManualFrames implements FrameSource {
  private pending: ((time: number) => void) | null = null;
  private time = 0;
  request(callback: (time: number) => void): number {
    this.pending = callback;
    return 1;
  }
  cancel(): void {
    this.pending = null;
  }
  get active(): boolean {
    return this.pending !== null;
  }
  step(ms: number): void {
    this.time += ms;
    const cb = this.pending;
    this.pending = null;
    cb?.(this.time);
  }
}

export class MemoryStorage implements Storage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}
