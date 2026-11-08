import type { Mac } from '../core/mac';
import type { Scheduler } from '../core/scheduler';
import type { EthernetFrame } from './frames';

/** Services shared by every object of a simulated network. */
export interface SimContext {
  readonly scheduler: Scheduler;
  /** Virtual milliseconds needed for a frame to cross a cable. */
  readonly linkDelay: number;
  /** Called whenever a frame enters a cable (used for animation). */
  onTransmit(cable: Cable, from: Port, frame: EthernetFrame): void;
  /** Called when the observable state of a device changes. */
  changed(deviceId: string): void;
}

/** Something that owns ports and processes the frames they receive. */
export interface PortOwner {
  readonly id: string;
  receiveFrame(port: Port, frame: EthernetFrame): void;
  frameSent?(port: Port, frame: EthernetFrame): void;
}

export class Port {
  cable: Cable | null = null;

  constructor(
    readonly owner: PortOwner,
    /** Position on the device; renumbered when a router interface is removed. */
    public index: number,
    public mac: Mac,
  ) {}

  get isConnected(): boolean {
    return this.cable !== null;
  }

  send(frame: EthernetFrame): void {
    if (!this.cable) return;
    this.owner.frameSent?.(this, frame);
    this.cable.transmit(this, frame);
  }

  deliver(frame: EthernetFrame): void {
    this.owner.receiveFrame(this, frame);
  }
}

/** Full-duplex point-to-point link between two ports. Frames stay in order. */
export class Cable {
  private attached = true;

  constructor(
    readonly id: string,
    readonly a: Port,
    readonly b: Port,
    private readonly ctx: SimContext,
  ) {
    if (a.cable || b.cable) throw new Error('Port déjà connecté');
    if (a.owner === b.owner) throw new Error('Un câble doit relier deux équipements différents');
    a.cable = this;
    b.cable = this;
  }

  other(port: Port): Port {
    return port === this.a ? this.b : this.a;
  }

  transmit(from: Port, frame: EthernetFrame): void {
    if (!this.attached) return;
    const to = this.other(from);
    this.ctx.onTransmit(this, from, frame);
    this.ctx.scheduler.schedule(this.ctx.linkDelay, () => {
      if (this.attached) to.deliver(frame);
    });
  }

  detach(): void {
    this.attached = false;
    this.a.cable = null;
    this.b.cable = null;
  }
}
