import { MAC_BROADCAST, type Mac } from '../core/mac';
import type { EthernetFrame } from '../net/frames';
import { Port, type SimContext } from '../net/link';
import { Device, type Position } from './device';

const NO_MAC = '00:00:00:00:00:00';

export interface MacTableEntry {
  readonly mac: Mac;
  readonly port: number;
}

/**
 * Learning switch: remembers on which port each source MAC was seen
 * (source address table) and floods frames for unknown destinations.
 * It gains a new port whenever all ports are cabled.
 */
export class Switch extends Device {
  private readonly table = new Map<Mac, number>();

  constructor(id: string, name: string, position: Position, ctx: SimContext, portCount = 4) {
    super(id, 'switch', name, position, ctx);
    for (let i = 0; i < portCount; i++) this.addPort();
  }

  get macTable(): readonly MacTableEntry[] {
    return [...this.table].map(([mac, port]) => ({ mac, port }));
  }

  override freePort(): Port {
    return super.freePort() ?? this.addPort();
  }

  override portAt(index: number): Port | null {
    if (!Number.isInteger(index) || index < 0 || index > 255) return null;
    while (this.ports.length <= index) this.addPort();
    return super.portAt(index);
  }

  receiveFrame(port: Port, frame: EthernetFrame): void {
    if (frame.src !== MAC_BROADCAST && this.table.get(frame.src) !== port.index) {
      this.table.set(frame.src, port.index);
      this.changed();
    }
    const known = frame.dst === MAC_BROADCAST ? undefined : this.table.get(frame.dst);
    if (known !== undefined) {
      if (known !== port.index) this.ports[known]?.send(frame);
      return;
    }
    for (const other of this.ports) if (other !== port) other.send(frame);
  }

  override stop(): void {
    this.table.clear();
  }

  private addPort(): Port {
    const port = new Port(this, this.ports.length, NO_MAC);
    this.ports.push(port);
    return port;
  }
}
