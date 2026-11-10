import { IP_ANY, IP_BROADCAST, formatIp, type Ipv4 } from '../core/ipv4';
import type { Mac } from '../core/mac';
import type { TimerId } from '../core/scheduler';
import type { Host, HostService } from '../devices/host';
import type { DhcpMessage } from '../net/messages';
import type { L3Interface } from '../stack/interface';
import type { Udp } from '../stack/udp';
import { ServerApp, type ServiceHost } from './server-app';

export const DHCP_SERVER_PORT = 67;
export const DHCP_CLIENT_PORT = 68;
export const DHCP_RETRY_DELAY = 2000;
export const DHCP_MAX_ATTEMPTS = 4;

export type DhcpClientStatus = 'idle' | 'discovering' | 'requesting' | 'bound' | 'failed';

/** Obtains the host's addressing from a DHCP server when "use DHCP" is ticked. */
export class DhcpClient implements HostService {
  private state: DhcpClientStatus = 'idle';
  private release: (() => void) | null = null;
  private timer: TimerId | null = null;
  private attempts = 0;
  private xid = 0;
  private transactions = 0;

  constructor(private readonly host: Host) {
    host.addService(this);
  }

  get status(): DhcpClientStatus {
    return this.state;
  }

  start(): void {
    if (this.host.config.useDhcp) this.discover();
  }

  stop(): void {
    this.cleanup();
    this.state = 'idle';
  }

  /** Starts a new DHCP exchange (also used by "ipconfig /renew"). */
  discover(): void {
    this.cleanup();
    this.host.setAddressing({ ip: IP_ANY, mask: IP_ANY, gateway: IP_ANY, dns: IP_ANY });
    this.release = this.host.udp.bind(DHCP_CLIENT_PORT, (data) => {
      if (data.kind === 'dhcp') this.handle(data.msg);
    });
    this.attempts = 0;
    this.xid = (parseInt(this.host.mac.replaceAll(':', '').slice(-6), 16) << 4) + (this.transactions++ % 16);
    this.sendDiscover();
  }

  private sendDiscover(): void {
    this.attempts++;
    this.state = 'discovering';
    this.broadcast({
      op: 'DISCOVER',
      xid: this.xid,
      clientMac: this.host.mac,
      yourIp: IP_ANY,
      serverIp: IP_ANY,
    });
    this.armTimer();
  }

  private handle(msg: DhcpMessage): void {
    if (msg.xid !== this.xid || msg.clientMac !== this.host.mac) return;
    if (msg.op === 'OFFER' && this.state === 'discovering') {
      this.state = 'requesting';
      this.broadcast({
        op: 'REQUEST',
        xid: this.xid,
        clientMac: this.host.mac,
        yourIp: IP_ANY,
        serverIp: msg.serverIp,
        requestedIp: msg.yourIp,
      });
      this.armTimer();
    } else if (msg.op === 'ACK' && this.state === 'requesting') {
      this.cleanup();
      this.state = 'bound';
      this.host.setAddressing({
        ip: msg.yourIp,
        mask: msg.mask ?? IP_ANY,
        gateway: msg.gateway ?? IP_ANY,
        dns: msg.dns ?? IP_ANY,
      });
    } else if (msg.op === 'NAK' && this.state === 'requesting') {
      this.sendDiscover();
    }
  }

  private armTimer(): void {
    const scheduler = this.host.stack.scheduler;
    scheduler.cancel(this.timer);
    this.timer = scheduler.schedule(DHCP_RETRY_DELAY, () => {
      if (this.attempts < DHCP_MAX_ATTEMPTS) {
        this.sendDiscover();
      } else {
        this.cleanup();
        this.state = 'failed';
        this.host.changed();
      }
    });
  }

  private broadcast(msg: DhcpMessage): void {
    this.host.udp.send(
      DHCP_CLIENT_PORT,
      IP_BROADCAST,
      DHCP_SERVER_PORT,
      { kind: 'dhcp', msg },
      { src: IP_ANY },
    );
    this.host.changed();
  }

  private cleanup(): void {
    this.host.stack.scheduler.cancel(this.timer);
    this.timer = null;
    this.release?.();
    this.release = null;
  }
}

export interface DhcpReservation {
  readonly mac: Mac;
  readonly ip: Ipv4;
}

export interface DhcpServerConfig {
  rangeStart: Ipv4;
  rangeEnd: Ipv4;
  gateway: Ipv4;
  dns: Ipv4;
  reservations: DhcpReservation[];
}

export interface DhcpLease {
  readonly mac: Mac;
  readonly ip: Ipv4;
  readonly confirmed: boolean;
}

/** Device running a DHCP server: `iface` is the one network it serves. */
export interface DhcpHost extends ServiceHost {
  readonly udp: Udp;
  readonly iface: L3Interface;
}

/** Hands out addresses from a range (plus fixed reservations) to DHCP clients. */
export class DhcpServer extends ServerApp<DhcpHost> {
  config: DhcpServerConfig = {
    rangeStart: IP_ANY,
    rangeEnd: IP_ANY,
    gateway: IP_ANY,
    dns: IP_ANY,
    reservations: [],
  };
  private readonly leaseMap = new Map<Mac, DhcpLease>();
  private release: (() => void) | null = null;

  get leases(): readonly DhcpLease[] {
    return [...this.leaseMap.values()];
  }

  updateConfig(config: Partial<DhcpServerConfig>): void {
    this.config = { ...this.config, ...config };
    this.host.changed();
  }

  protected listen(): void {
    this.release = this.host.udp.bind(DHCP_SERVER_PORT, (data, info) => {
      // A box only serves its home side, never the Internet side.
      if (info.iface && info.iface !== this.host.iface) return;
      if (data.kind === 'dhcp') this.handle(data.msg);
    });
  }

  protected unlisten(): void {
    this.release?.();
    this.release = null;
    this.leaseMap.clear();
  }

  private handle(msg: DhcpMessage): void {
    const own = this.host.iface.ip;
    if (msg.op === 'DISCOVER') {
      const ip = this.chooseAddress(msg.clientMac);
      if (ip === null) {
        this.addLog(`Plus d’adresse disponible pour ${msg.clientMac}`);
        return;
      }
      this.leaseMap.set(msg.clientMac, { mac: msg.clientMac, ip, confirmed: false });
      this.addLog(`DISCOVER de ${msg.clientMac} → OFFER ${formatIp(ip)}`);
      this.reply('OFFER', msg, ip);
    } else if (msg.op === 'REQUEST') {
      if (msg.serverIp !== own) {
        // The client chose another server: forget our offer.
        if (!this.leaseMap.get(msg.clientMac)?.confirmed) this.leaseMap.delete(msg.clientMac);
        return;
      }
      const lease = this.leaseMap.get(msg.clientMac);
      if (lease !== undefined && lease.ip === msg.requestedIp) {
        this.leaseMap.set(msg.clientMac, { ...lease, confirmed: true });
        this.addLog(`REQUEST de ${msg.clientMac} → ACK ${formatIp(lease.ip)}`);
        this.reply('ACK', msg, lease.ip);
      } else {
        this.addLog(`REQUEST de ${msg.clientMac} → NAK`);
        this.reply('NAK', msg, IP_ANY);
      }
    }
  }

  private reply(op: 'OFFER' | 'ACK' | 'NAK', request: DhcpMessage, ip: Ipv4): void {
    const { iface } = this.host;
    const c = this.config;
    const msg: DhcpMessage =
      op === 'NAK'
        ? { op, xid: request.xid, clientMac: request.clientMac, yourIp: IP_ANY, serverIp: iface.ip }
        : {
            op,
            xid: request.xid,
            clientMac: request.clientMac,
            yourIp: ip,
            serverIp: iface.ip,
            mask: iface.mask,
            gateway: c.gateway,
            dns: c.dns,
          };
    this.host.udp.send(
      DHCP_SERVER_PORT,
      IP_BROADCAST,
      DHCP_CLIENT_PORT,
      { kind: 'dhcp', msg },
      { iface: this.host.stack.interfaces.indexOf(iface) },
    );
  }

  private chooseAddress(mac: Mac): Ipv4 | null {
    const reserved = this.config.reservations.find((r) => r.mac === mac);
    if (reserved) return reserved.ip;
    const existing = this.leaseMap.get(mac);
    if (existing) return existing.ip;
    const taken = new Set<Ipv4>([
      this.host.iface.ip,
      this.config.gateway,
      ...this.config.reservations.map((r) => r.ip),
      ...[...this.leaseMap.values()].map((l) => l.ip),
    ]);
    const { rangeStart, rangeEnd } = this.config;
    if (rangeStart === IP_ANY || rangeEnd < rangeStart) return null;
    for (let ip = rangeStart; ip <= rangeEnd; ip++) if (!taken.has(ip)) return ip;
    return null;
  }
}
