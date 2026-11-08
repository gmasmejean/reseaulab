import { IP_ANY, IP_BROADCAST, broadcastOf, networkOf, type Ipv4 } from '../core/ipv4';
import { MAC_BROADCAST, type Mac } from '../core/mac';
import type { Scheduler } from '../core/scheduler';
import { DEFAULT_TTL, type EthernetFrame, type Ipv4Packet, type TransportPayload } from '../net/frames';
import type { Port } from '../net/link';
import { Arp } from './arp';
import type { Firewall } from './firewall';
import { Icmp } from './icmp';
import { isConfigured, type L3Interface } from './interface';
import { lookupRoute, nextHop, type Route } from './routing';

export type ProtocolHandler = (packet: Ipv4Packet, iface: L3Interface | null) => void;

export type SendStatus = 'sent' | 'no-route';

export interface SendOptions {
  readonly src?: Ipv4;
  readonly ttl?: number;
  /** Interface used for limited broadcasts (255.255.255.255). */
  readonly iface?: number;
  /** Called when the next hop cannot be resolved by ARP. */
  readonly onFailure?: () => void;
}

const LOOPBACK_NET = 0x7f000000;
const LOOPBACK_MASK = 0xff000000;

export function isLoopback(ip: Ipv4): boolean {
  return networkOf(ip, LOOPBACK_MASK) === LOOPBACK_NET;
}

/** IPv4 layer shared by hosts and routers. */
export class IpStack {
  readonly interfaces: L3Interface[] = [];
  readonly arp: Arp;
  readonly icmp: Icmp;
  /** Routers forward packets that are not addressed to them. */
  forwarding = false;
  /** Default gateway (hosts). IP_ANY when unset. */
  gateway: Ipv4 = IP_ANY;
  staticRoutes: Route[] = [];
  dynamicRoutes: Route[] = [];
  firewall: Firewall | null = null;
  /** Firewall applies to forwarded traffic (router) or incoming traffic (host). */
  firewallScope: 'input' | 'forward' = 'input';
  private readonly handlers = new Map<'udp' | 'tcp', ProtocolHandler>();
  private packetId = 1;

  constructor(
    readonly scheduler: Scheduler,
    onChange: () => void,
  ) {
    this.arp = new Arp(scheduler, onChange);
    this.icmp = new Icmp(this);
  }

  register(protocol: 'udp' | 'tcp', handler: ProtocolHandler): void {
    this.handlers.set(protocol, handler);
  }

  addInterface(port: Port, ip: Ipv4 = IP_ANY, mask: Ipv4 = IP_ANY): L3Interface {
    const iface: L3Interface = { port, ip, mask };
    this.interfaces.push(iface);
    return iface;
  }

  /** Removes the interface of `port`; routes keep pointing to valid indices. */
  removeInterface(port: Port): void {
    const index = this.interfaces.findIndex((i) => i.port === port);
    if (index < 0) return;
    this.interfaces.splice(index, 1);
    const renumber = (routes: Route[]) =>
      routes
        .filter((r) => r.iface !== index)
        .map((r) => (r.iface > index ? { ...r, iface: r.iface - 1 } : r));
    this.staticRoutes = renumber(this.staticRoutes);
    this.dynamicRoutes = renumber(this.dynamicRoutes);
    this.arp.clear();
  }

  interfaceFor(port: Port): L3Interface | null {
    return this.interfaces.find((i) => i.port === port) ?? null;
  }

  /** Effective routing table: connected networks, default gateway, static, RIP. */
  routes(): Route[] {
    const routes: Route[] = [];
    this.interfaces.forEach((iface, index) => {
      if (!isConfigured(iface)) return;
      routes.push({
        destination: networkOf(iface.ip, iface.mask),
        mask: iface.mask,
        gateway: IP_ANY,
        iface: index,
        metric: 0,
        source: 'connected',
      });
    });
    if (this.gateway !== IP_ANY) {
      const index = this.interfaces.findIndex(
        (i) => isConfigured(i) && networkOf(i.ip, i.mask) === networkOf(this.gateway, i.mask),
      );
      if (index >= 0) {
        routes.push({
          destination: IP_ANY,
          mask: IP_ANY,
          gateway: this.gateway,
          iface: index,
          metric: 1,
          source: 'default',
        });
      }
    }
    routes.push(...this.staticRoutes.filter((r) => this.interfaces[r.iface] !== undefined));
    routes.push(...this.dynamicRoutes);
    return routes;
  }

  isLocalAddress(ip: Ipv4): boolean {
    return isLoopback(ip) || this.interfaces.some((i) => isConfigured(i) && i.ip === ip);
  }

  /** Source address used to reach `dst` (first configured address as fallback). */
  sourceFor(dst: Ipv4): Ipv4 {
    const route = lookupRoute(this.routes(), dst);
    const iface = route ? this.interfaces[route.iface] : this.interfaces.find(isConfigured);
    return iface?.ip ?? IP_ANY;
  }

  send(dst: Ipv4, payload: TransportPayload, options: SendOptions = {}): SendStatus {
    const ttl = options.ttl ?? DEFAULT_TTL;
    if (this.isLocalAddress(dst)) {
      const packet = this.makePacket(options.src ?? dst, dst, ttl, payload);
      this.scheduler.schedule(0, () => {
        this.deliver(packet, null);
      });
      return 'sent';
    }
    if (dst === IP_BROADCAST) {
      const iface = this.interfaces[options.iface ?? 0];
      if (!iface) return 'no-route';
      const packet = this.makePacket(options.src ?? iface.ip, dst, ttl, payload);
      this.firewall?.track(packet);
      this.sendFrame(iface, MAC_BROADCAST, packet);
      return 'sent';
    }
    const route = lookupRoute(this.routes(), dst);
    const iface = route ? this.interfaces[route.iface] : undefined;
    if (!route || !iface) return 'no-route';
    const packet = this.makePacket(options.src ?? iface.ip, dst, ttl, payload);
    this.firewall?.track(packet);
    this.transmit(packet, iface, nextHop(route, dst), options.onFailure);
    return 'sent';
  }

  receiveFrame(port: Port, frame: EthernetFrame): void {
    const iface = this.interfaceFor(port);
    if (!iface) return;
    if (frame.dst !== port.mac && frame.dst !== MAC_BROADCAST) return;
    const payload = frame.payload;
    if (payload.kind === 'arp') {
      this.arp.handle(iface, payload);
      return;
    }
    if (this.isAddressedToUs(payload, iface)) {
      if (this.firewallScope === 'input' && this.firewall && !this.firewall.allows(payload)) return;
      this.deliver(payload, iface);
    } else if (this.forwarding && isConfigured(iface) && frame.dst === port.mac) {
      this.forward(payload, iface);
    }
  }

  reset(): void {
    this.arp.clear();
    this.dynamicRoutes = [];
    this.firewall?.reset();
    this.icmp.reset();
  }

  private makePacket(src: Ipv4, dst: Ipv4, ttl: number, payload: TransportPayload): Ipv4Packet {
    return { kind: 'ipv4', id: this.packetId++, src, dst, ttl, payload };
  }

  private isAddressedToUs(packet: Ipv4Packet, iface: L3Interface): boolean {
    if (packet.dst === IP_BROADCAST) return true;
    if (this.isLocalAddress(packet.dst)) return true;
    return isConfigured(iface) && packet.dst === broadcastOf(iface.ip, iface.mask);
  }

  private deliver(packet: Ipv4Packet, iface: L3Interface | null): void {
    const kind = packet.payload.kind;
    if (kind === 'icmp') {
      this.icmp.handle(packet);
      return;
    }
    this.handlers.get(kind)?.(packet, iface);
  }

  private forward(packet: Ipv4Packet, incoming: L3Interface): void {
    if (packet.ttl <= 1) {
      this.icmp.sendError(packet, 'time-exceeded', undefined, incoming.ip);
      return;
    }
    const route = lookupRoute(this.routes(), packet.dst);
    const out = route ? this.interfaces[route.iface] : undefined;
    if (!route || !out) {
      this.icmp.sendError(packet, 'unreachable', 'net', incoming.ip);
      return;
    }
    if (this.firewallScope === 'forward' && this.firewall && !this.firewall.allows(packet)) return;
    const forwarded: Ipv4Packet = { ...packet, ttl: packet.ttl - 1 };
    this.transmit(forwarded, out, nextHop(route, packet.dst), () => {
      this.icmp.sendError(packet, 'unreachable', 'host', incoming.ip);
    });
  }

  private transmit(packet: Ipv4Packet, iface: L3Interface, hop: Ipv4, onFailure?: () => void): void {
    if (isConfigured(iface) && packet.dst === broadcastOf(iface.ip, iface.mask)) {
      this.sendFrame(iface, MAC_BROADCAST, packet);
      return;
    }
    this.arp.resolve(iface, hop, (mac) => {
      if (mac) this.sendFrame(iface, mac, packet);
      else onFailure?.();
    });
  }

  private sendFrame(iface: L3Interface, dst: Mac, packet: Ipv4Packet): void {
    iface.port.send({ src: iface.port.mac, dst, payload: packet });
  }
}
