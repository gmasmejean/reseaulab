import type { EthernetFrame } from '../net/frames';
import { Port, type PortOwner, type SimContext } from '../net/link';

/**
 * Terminals: all of them are a `Host` (one network card, a full IP stack).
 * They differ by their picture, their name and what is installed at first.
 */
export const HOST_KINDS = [
  'computer',
  'laptop',
  'server',
  'printer',
  'object',
  'smartphone',
  'tablet',
] as const;
export type HostKind = (typeof HOST_KINDS)[number];

export type DeviceKind = HostKind | 'switch' | 'router';

export function isHostKind(kind: string): kind is HostKind {
  return (HOST_KINDS as readonly string[]).includes(kind);
}

export interface Position {
  x: number;
  y: number;
}

export abstract class Device implements PortOwner {
  readonly ports: Port[] = [];
  /** True while the network is in simulation mode (set by Network). */
  simulating = false;

  protected constructor(
    readonly id: string,
    readonly kind: DeviceKind,
    public name: string,
    public position: Position,
    protected readonly ctx: SimContext,
  ) {}

  abstract receiveFrame(port: Port, frame: EthernetFrame): void;

  /** A port that can accept a new cable, or null if all are used. */
  freePort(): Port | null {
    return this.ports.find((p) => !p.isConnected) ?? null;
  }

  /** Port number `index`, or null when it does not exist. */
  portAt(index: number): Port | null {
    return this.ports[index] ?? null;
  }

  /** Called when the simulation starts. */
  start(): void {
    /* no-op by default */
  }

  /** Called when the simulation stops: forget every runtime state. */
  stop(): void {
    /* no-op by default */
  }

  /** Notifies observers (UI) that this device changed. */
  changed(): void {
    this.ctx.changed(this.id);
  }
}
