import type { FrameVerdict } from './drop';
import type { EthernetFrame } from './frames';

export interface CaptureEntry {
  readonly no: number;
  readonly time: number;
  readonly iface: number;
  readonly direction: 'in' | 'out';
  readonly frame: EthernetFrame;
  /** What the device did with a received frame (absent for a sent one). */
  readonly verdict?: FrameVerdict;
}

/** Bounded log of the frames seen by a device ("échanges de données"). */
export class CaptureLog {
  private items: CaptureEntry[] = [];
  private counter = 0;

  constructor(private readonly limit = 5000) {}

  /** Adds an entry and returns its number. */
  record(time: number, iface: number, direction: 'in' | 'out', frame: EthernetFrame): number {
    this.items.push({ no: ++this.counter, time, iface, direction, frame });
    if (this.items.length > this.limit) this.items = this.items.slice(-this.limit);
    return this.counter;
  }

  /**
   * Completes a received frame once it has been processed. The frame is
   * recorded first, so that it comes before the answers it triggers.
   */
  setVerdict(no: number, verdict: FrameVerdict): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (!item || item.no < no) return;
      if (item.no === no) {
        this.items[i] = { ...item, verdict };
        return;
      }
    }
  }

  get entries(): readonly CaptureEntry[] {
    return this.items;
  }

  clear(): void {
    this.items = [];
    this.counter = 0;
  }
}
