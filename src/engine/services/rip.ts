import { IP_ANY, IP_BROADCAST, networkOf, type Ipv4 } from '../core/ipv4';
import type { TimerId } from '../core/scheduler';
import type { RipMessage, RipRoute } from '../net/messages';
import { isConfigured } from '../stack/interface';
import type { IpStack } from '../stack/ip-stack';
import type { Route } from '../stack/routing';
import type { Udp } from '../stack/udp';

export const RIP_PORT = 520;
export const RIP_INTERVAL = 5000;
export const RIP_TIMEOUT = 3 * RIP_INTERVAL;
export const RIP_INFINITY = 16;
const TRIGGER_DELAY = 50;

/** What RIP needs from the device it runs on (a router or a box). */
export interface RipHost {
  rip: boolean;
  readonly stack: IpStack;
  readonly udp: Udp;
  readonly simulating: boolean;
  changed(): void;
  addService(service: { start(): void; stop(): void }): void;
}

interface LearnedRoute {
  readonly route: Route;
  readonly expires: number;
}

/**
 * Routing Information Protocol (distance vector). Every RIP_INTERVAL the
 * router broadcasts its table on each interface (split horizon with poisoned
 * reverse); routes not refreshed within RIP_TIMEOUT are withdrawn.
 */
export class Rip {
  private learned = new Map<string, LearnedRoute>();
  /** Routes just lost: advertised once with metric 16 (route poisoning). */
  private withdrawn: RipRoute[] = [];
  private release: (() => void) | null = null;
  private periodic: TimerId | null = null;
  private triggered: TimerId | null = null;

  constructor(private readonly router: RipHost) {
    router.addService(this);
  }

  start(): void {
    if (!this.router.rip || this.release) return;
    this.release = this.router.udp.bind(RIP_PORT, (data, info) => {
      if (data.kind !== 'rip' || !info.iface || this.router.stack.isLocalAddress(info.src)) return;
      this.receive(data.msg, info.src, this.router.stack.interfaces.indexOf(info.iface));
    });
    this.broadcast({ command: 'request', routes: [] });
    this.tick();
  }

  stop(): void {
    const scheduler = this.router.stack.scheduler;
    scheduler.cancel(this.periodic);
    scheduler.cancel(this.triggered);
    this.periodic = null;
    this.triggered = null;
    this.release?.();
    this.release = null;
    this.learned.clear();
    this.withdrawn = [];
    this.router.stack.dynamicRoutes = [];
  }

  setEnabled(enabled: boolean): void {
    this.router.rip = enabled;
    if (this.router.simulating) {
      if (enabled) this.start();
      else this.stop();
    }
    this.router.changed();
  }

  private tick(): void {
    this.expire();
    this.sendUpdates();
    this.periodic = this.router.stack.scheduler.schedule(RIP_INTERVAL, () => {
      this.tick();
    });
  }

  private receive(msg: RipMessage, from: Ipv4, iface: number): void {
    if (iface < 0) return;
    if (msg.command === 'request') {
      this.scheduleTriggered();
      return;
    }
    const now = this.router.stack.scheduler.now;
    let changed = false;
    for (const advertised of msg.routes) {
      const key = keyOf(advertised.network, advertised.mask);
      if (this.isConnected(advertised.network, advertised.mask)) continue;
      const metric = Math.min(advertised.metric + 1, RIP_INFINITY);
      const current = this.learned.get(key);
      const fromSameGateway = current?.route.gateway === from;
      if (metric >= RIP_INFINITY) {
        if (current && fromSameGateway) {
          this.learned.delete(key);
          this.withdraw(current.route);
          changed = true;
        }
        continue;
      }
      if (!current || fromSameGateway || metric < current.route.metric) {
        if (current?.route.metric !== metric || !fromSameGateway) changed = true;
        this.learned.set(key, {
          route: {
            destination: advertised.network,
            mask: advertised.mask,
            gateway: from,
            iface,
            metric,
            source: 'rip',
          },
          expires: now + RIP_TIMEOUT,
        });
      }
    }
    if (changed) {
      this.publish();
      this.scheduleTriggered();
    }
  }

  private expire(): void {
    const now = this.router.stack.scheduler.now;
    let changed = false;
    for (const [key, entry] of this.learned) {
      if (entry.expires <= now) {
        this.learned.delete(key);
        this.withdraw(entry.route);
        changed = true;
      }
    }
    if (changed) {
      this.publish();
      this.scheduleTriggered();
    }
  }

  private publish(): void {
    this.router.stack.dynamicRoutes = [...this.learned.values()].map((e) => e.route);
    this.router.changed();
  }

  private scheduleTriggered(): void {
    if (this.triggered !== null) return;
    this.triggered = this.router.stack.scheduler.schedule(TRIGGER_DELAY, () => {
      this.triggered = null;
      this.sendUpdates();
    });
  }

  private withdraw(route: Route): void {
    this.withdrawn.push({ network: route.destination, mask: route.mask, metric: RIP_INFINITY });
  }

  private sendUpdates(): void {
    const routes = this.router.stack.routes().filter((r) => r.source === 'connected' || r.source === 'rip');
    const withdrawn = this.withdrawn;
    this.withdrawn = [];
    this.router.stack.interfaces.forEach((iface, index) => {
      if (!isConfigured(iface) || !iface.port.isConnected) return;
      const advertised: RipRoute[] = routes.map((r) => ({
        network: r.destination,
        mask: r.mask,
        // Poisoned reverse: never advertise a route back where it came from.
        metric: r.source === 'rip' && r.iface === index ? RIP_INFINITY : r.metric,
      }));
      advertised.push(...withdrawn);
      this.router.udp.send(
        RIP_PORT,
        IP_BROADCAST,
        RIP_PORT,
        { kind: 'rip', msg: { command: 'response', routes: advertised } },
        { iface: index, src: iface.ip },
      );
    });
  }

  private broadcast(msg: RipMessage): void {
    this.router.stack.interfaces.forEach((iface, index) => {
      if (!isConfigured(iface) || !iface.port.isConnected) return;
      this.router.udp.send(
        RIP_PORT,
        IP_BROADCAST,
        RIP_PORT,
        { kind: 'rip', msg },
        { iface: index, src: iface.ip },
      );
    });
  }

  private isConnected(network: Ipv4, mask: Ipv4): boolean {
    return this.router.stack.interfaces.some(
      (i) => i.ip !== IP_ANY && i.mask === mask && networkOf(i.ip, i.mask) === network,
    );
  }
}

function keyOf(network: Ipv4, mask: Ipv4): string {
  return `${network}/${mask}`;
}
