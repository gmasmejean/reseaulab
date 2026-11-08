import type { Ipv4 } from '../core/ipv4';
import type { Mac } from '../core/mac';
import { Port, type SimContext } from '../net/link';
import { Firewall } from '../stack/firewall';
import type { L3Interface } from '../stack/interface';
import type { Route } from '../stack/routing';
import { Rip } from '../services/rip';
import { Udp } from '../stack/udp';
import type { Position } from './device';
import { NetworkNode } from './node';

export interface InterfaceConfig {
  readonly ip: Ipv4;
  readonly mask: Ipv4;
}

export type StaticRoute = Pick<Route, 'destination' | 'mask' | 'gateway' | 'iface'>;

export const MIN_ROUTER_INTERFACES = 2;
export const MAX_ROUTER_INTERFACES = 8;

/** Router: several interfaces, packet forwarding, static/RIP routes, firewall. */
export class Router extends NetworkNode {
  readonly udp: Udp;
  readonly firewall = new Firewall();
  /** Enables the RIP routing protocol (see services/rip.ts). */
  rip = false;
  private readonly services: { start(): void; stop(): void }[] = [];
  readonly ripService = new Rip(this);

  constructor(id: string, name: string, position: Position, ctx: SimContext, macs: readonly Mac[]) {
    super(id, 'router', name, position, ctx);
    if (macs.length < MIN_ROUTER_INTERFACES || macs.length > MAX_ROUTER_INTERFACES) {
      throw new RangeError(
        `Un routeur a entre ${MIN_ROUTER_INTERFACES} et ${MAX_ROUTER_INTERFACES} interfaces`,
      );
    }
    macs.forEach((mac, index) => {
      const port = new Port(this, index, mac);
      this.ports.push(port);
      this.stack.addInterface(port);
    });
    this.stack.forwarding = true;
    this.stack.firewall = this.firewall;
    this.stack.firewallScope = 'forward';
    this.udp = new Udp(this.stack);
  }

  get interfaces(): readonly L3Interface[] {
    return this.stack.interfaces;
  }

  get canAddInterface(): boolean {
    return this.ports.length < MAX_ROUTER_INTERFACES;
  }

  get canRemoveInterface(): boolean {
    return this.ports.length > MIN_ROUTER_INTERFACES;
  }

  /** Adds an unconfigured interface (use Network.addRouterInterface). */
  addInterface(mac: Mac): L3Interface {
    if (!this.canAddInterface) {
      throw new RangeError(`Un routeur a au plus ${MAX_ROUTER_INTERFACES} interfaces`);
    }
    const port = new Port(this, this.ports.length, mac);
    this.ports.push(port);
    const iface = this.stack.addInterface(port);
    this.changed();
    return iface;
  }

  /**
   * Removes an uncabled interface (use Network.removeRouterInterface). The
   * following interfaces are renumbered; static routes through the removed
   * interface are deleted, the others follow their interface.
   */
  removeInterface(index: number): void {
    const port = this.ports[index];
    if (!port) throw new RangeError(`Interface ${index} inexistante`);
    if (!this.canRemoveInterface) {
      throw new RangeError(`Un routeur a au moins ${MIN_ROUTER_INTERFACES} interfaces`);
    }
    if (port.isConnected) throw new Error('Débranchez le câble avant de retirer l’interface');
    this.ports.splice(index, 1);
    this.ports.forEach((p, i) => {
      p.index = i;
    });
    this.stack.removeInterface(port);
    this.changed();
  }

  setInterface(index: number, config: InterfaceConfig): void {
    const iface = this.stack.interfaces[index];
    if (!iface) throw new RangeError(`Interface ${index} inexistante`);
    iface.ip = config.ip;
    iface.mask = config.mask;
    this.changed();
  }

  get staticRoutes(): readonly StaticRoute[] {
    return this.stack.staticRoutes;
  }

  setStaticRoutes(routes: readonly StaticRoute[]): void {
    this.stack.staticRoutes = routes.map((r) => ({ ...r, metric: 1, source: 'static' as const }));
    this.changed();
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
  }
}
