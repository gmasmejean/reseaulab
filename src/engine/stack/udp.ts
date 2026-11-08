import type { Ipv4 } from '../core/ipv4';
import type { Ipv4Packet } from '../net/frames';
import type { UdpData } from '../net/messages';
import type { L3Interface } from './interface';
import type { IpStack, SendOptions, SendStatus } from './ip-stack';
import { EphemeralPorts } from './ports';

export interface UdpInfo {
  readonly src: Ipv4;
  readonly srcPort: number;
  readonly dst: Ipv4;
  readonly iface: L3Interface | null;
}

export type UdpHandler = (data: UdpData, info: UdpInfo) => void;

export class Udp {
  private readonly bindings = new Map<number, UdpHandler>();
  private readonly ephemeral = new EphemeralPorts();

  constructor(private readonly stack: IpStack) {
    stack.register('udp', (packet, iface) => {
      this.handle(packet, iface);
    });
  }

  get boundPorts(): number[] {
    return [...this.bindings.keys()].sort((a, b) => a - b);
  }

  isBound(port: number): boolean {
    return this.bindings.has(port);
  }

  /** Binds a port; returns a function releasing it. */
  bind(port: number, handler: UdpHandler): () => void {
    if (this.bindings.has(port)) throw new Error(`Port UDP ${port} déjà utilisé`);
    this.bindings.set(port, handler);
    return () => {
      if (this.bindings.get(port) === handler) this.bindings.delete(port);
    };
  }

  bindEphemeral(handler: UdpHandler): { readonly port: number; readonly close: () => void } {
    const port = this.ephemeral.allocate((p) => this.bindings.has(p));
    return { port, close: this.bind(port, handler) };
  }

  send(srcPort: number, dst: Ipv4, dstPort: number, data: UdpData, options: SendOptions = {}): SendStatus {
    return this.stack.send(dst, { kind: 'udp', srcPort, dstPort, data }, options);
  }

  reset(): void {
    this.bindings.clear();
    this.ephemeral.reset();
  }

  private handle(packet: Ipv4Packet, iface: L3Interface | null): void {
    const datagram = packet.payload;
    if (datagram.kind !== 'udp') return;
    const handler = this.bindings.get(datagram.dstPort);
    if (!handler) {
      // Broadcasts (DHCP, RIP…) to a closed port are silently ignored.
      if (this.stack.isLocalAddress(packet.dst)) this.stack.icmp.sendError(packet, 'unreachable', 'port');
      return;
    }
    handler(datagram.data, { src: packet.src, srcPort: datagram.srcPort, dst: packet.dst, iface });
  }
}
