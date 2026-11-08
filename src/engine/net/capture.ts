import type { EthernetFrame } from './frames';

export interface CaptureEntry {
  readonly no: number;
  readonly time: number;
  readonly iface: number;
  readonly direction: 'in' | 'out';
  readonly frame: EthernetFrame;
}

/** Bounded log of the frames seen by a device ("échanges de données"). */
export class CaptureLog {
  private items: CaptureEntry[] = [];
  private counter = 0;

  constructor(private readonly limit = 5000) {}

  record(time: number, iface: number, direction: 'in' | 'out', frame: EthernetFrame): void {
    this.items.push({ no: ++this.counter, time, iface, direction, frame });
    if (this.items.length > this.limit) this.items = this.items.slice(-this.limit);
  }

  get entries(): readonly CaptureEntry[] {
    return this.items;
  }

  clear(): void {
    this.items = [];
    this.counter = 0;
  }
}
