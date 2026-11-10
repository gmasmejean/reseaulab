import { IP_ANY, networkOf, parseIp, sameNetwork, type Ipv4 } from '../core/ipv4';
import { MAC_BROADCAST, type Mac } from '../core/mac';
import type { EthernetFrame } from '../net/frames';
import { Port, type SimContext } from '../net/link';
import { DhcpServer } from '../services/dhcp';
import { Rip } from '../services/rip';
import type { L3Interface } from '../stack/interface';
import { Udp } from '../stack/udp';
import type { Position } from './device';
import { NetworkNode } from './node';
import type { InterfaceConfig } from './router';
import type { MacTableEntry } from './switch';

/** Interface (and socket) of the Internet side of a box. */
export const BOX_WAN = 0;
/** Interface of the home side of a box. */
export const BOX_LAN = 1;
/** Sockets of the home side found on a new box; more appear when all are used (Wi-Fi). */
export const BOX_LAN_PORTS = 4;

const NO_MAC = '00:00:00:00:00:00';
const MAX_PORT = 255;

function address(text: string): Ipv4 {
  const value = parseIp(text);
  if (value === null) throw new Error(`Adresse invalide : ${text}`);
  return value;
}

/** Addressing of a new box, as found in most homes. */
export const BOX_DEFAULTS = {
  ip: address('192.168.1.1'),
  mask: address('255.255.255.0'),
  rangeStart: address('192.168.1.10'),
  rangeEnd: address('192.168.1.50'),
} as const;

/**
 * Inside the box, the card of its home side: it is plugged in the built-in
 * switch, not in a socket. What the box sends through it goes to the sockets.
 */
class HomeCard extends Port {
  constructor(
    private readonly box: Box,
    mac: Mac,
  ) {
    super(box, BOX_LAN, mac);
  }

  override get isConnected(): boolean {
    return this.box.homePorts.some((port) => port.isConnected);
  }

  override send(frame: EthernetFrame): void {
    this.box.frameSent(this, frame);
    this.box.sendHome(frame);
  }
}

/**
 * Internet box: one device doing the work of four. A router between the home
 * network and Internet, a switch for the home sockets, a Wi-Fi access point
 * and a DHCP server giving their addresses to the terminals of the home.
 * Simplification: addresses are not translated (no NAT), the routers on the
 * Internet side must know the way to the home network.
 */
export class Box extends NetworkNode {
  readonly udp: Udp;
  readonly dhcp: DhcpServer;
  /** Announces and learns routes automatically (see services/rip.ts). */
  rip = false;
  readonly ripService: Rip;
  private readonly card: HomeCard;
  private readonly table = new Map<Mac, Port>();
  private readonly services: { start(): void; stop(): void }[] = [];

  constructor(
    id: string,
    name: string,
    position: Position,
    ctx: SimContext,
    macs: { readonly wan: Mac; readonly lan: Mac },
    /** Name of its Wi-Fi network. */
    public ssid = 'Box',
  ) {
    super(id, 'box', name, position, ctx);
    const wan = new Port(this, BOX_WAN, macs.wan);
    this.ports.push(wan);
    this.stack.addInterface(wan);
    this.card = new HomeCard(this, macs.lan);
    this.stack.addInterface(this.card, BOX_DEFAULTS.ip, BOX_DEFAULTS.mask);
    for (let i = 0; i < BOX_LAN_PORTS; i++) this.addHomePort();
    this.stack.forwarding = true;
    this.udp = new Udp(this.stack);
    this.dhcp = new DhcpServer(this);
    this.dhcp.updateConfig({
      rangeStart: BOX_DEFAULTS.rangeStart,
      rangeEnd: BOX_DEFAULTS.rangeEnd,
      gateway: BOX_DEFAULTS.ip,
    });
    this.dhcp.setActive(true);
    this.ripService = new Rip(this);
  }

  /** Internet side. */
  get wan(): L3Interface {
    return this.interface(BOX_WAN);
  }

  /** Home side. */
  get lan(): L3Interface {
    return this.interface(BOX_LAN);
  }

  /** Where the DHCP server of the box listens and answers: the home side. */
  get iface(): L3Interface {
    return this.lan;
  }

  get interfaces(): readonly L3Interface[] {
    return this.stack.interfaces;
  }

  /** The socket of the Internet side. */
  get wanPort(): Port {
    const port = this.ports[BOX_WAN];
    if (!port) throw new Error('Box sans prise Internet');
    return port;
  }

  /** The sockets of the home side (cables and Wi-Fi terminals). */
  get homePorts(): readonly Port[] {
    return this.ports.slice(1);
  }

  /** Gateway of the box on the Internet side; IP_ANY when unset. */
  get gateway(): Ipv4 {
    return this.stack.gateway;
  }

  setGateway(gateway: Ipv4): void {
    this.stack.gateway = gateway;
    this.changed();
  }

  setWan(config: InterfaceConfig): void {
    this.wan.ip = config.ip;
    this.wan.mask = config.mask;
    this.changed();
  }

  /**
   * Address of the box at home: it is also the gateway given by its DHCP
   * server, whose range of addresses follows the box into its new network.
   */
  setLan(config: InterfaceConfig): void {
    const { ip, mask } = this.lan;
    const { rangeStart, rangeEnd } = this.dhcp.config;
    const followed = [rangeStart, rangeEnd].every((a) => ip !== IP_ANY && sameNetwork(ip, a, mask));
    this.lan.ip = config.ip;
    this.lan.mask = config.mask;
    const moved = (a: Ipv4) => (networkOf(config.ip, config.mask) + (a - networkOf(a, config.mask))) >>> 0;
    const movable = followed && config.ip !== IP_ANY && config.mask !== IP_ANY;
    this.dhcp.updateConfig({
      gateway: config.ip,
      ...(movable ? { rangeStart: moved(rangeStart), rangeEnd: moved(rangeEnd) } : {}),
    });
  }

  /** Which terminal was seen behind which home socket (as in a switch). */
  get macTable(): readonly MacTableEntry[] {
    return [...this.table].map(([mac, port]) => ({ mac, port: port.index }));
  }

  /** A free socket of the home side; one is added when all are used. */
  override freePort(): Port {
    return this.homePorts.find((port) => !port.isConnected) ?? this.addHomePort();
  }

  override portAt(index: number): Port | null {
    if (!Number.isInteger(index) || index < 0 || index > MAX_PORT) return null;
    while (this.ports.length <= index) this.addHomePort();
    return super.portAt(index);
  }

  override receiveFrame(port: Port, frame: EthernetFrame): void {
    if (port === this.wanPort) {
      super.receiveFrame(port, frame);
      return;
    }
    // Home side: a switch, with the box itself as one more terminal.
    if (frame.src !== MAC_BROADCAST && this.table.get(frame.src) !== port) {
      this.table.set(frame.src, port);
      this.changed();
    }
    if (frame.dst === this.card.mac) {
      super.receiveFrame(this.card, frame);
      return;
    }
    const known = frame.dst === MAC_BROADCAST ? undefined : this.table.get(frame.dst);
    if (known) {
      if (known !== port) known.send(frame);
      return;
    }
    for (const other of this.homePorts) if (other !== port) other.send(frame);
    if (frame.dst === MAC_BROADCAST) super.receiveFrame(this.card, frame);
  }

  /** Only the frames of the box itself are captured, not those it switches. */
  override frameSent(port: Port, frame: EthernetFrame): void {
    if (port === this.wanPort || port === this.card) super.frameSent(port, frame);
  }

  /** A frame of the box itself for the home network (called by its home card). */
  sendHome(frame: EthernetFrame): void {
    const known = frame.dst === MAC_BROADCAST ? undefined : this.table.get(frame.dst);
    if (known) {
      known.send(frame);
      return;
    }
    for (const port of this.homePorts) port.send(frame);
  }

  addService(service: { start(): void; stop(): void }): void {
    this.services.push(service);
  }

  override start(): void {
    for (const service of this.services) service.start();
  }

  override stop(): void {
    for (const service of this.services) service.stop();
    super.stop();
    this.udp.reset();
    this.table.clear();
  }

  private interface(index: number): L3Interface {
    const iface = this.stack.interfaces[index];
    if (!iface) throw new Error(`Interface ${index} inexistante`);
    return iface;
  }

  private addHomePort(): Port {
    const port = new Port(this, this.ports.length, NO_MAC);
    this.ports.push(port);
    return port;
  }
}
