import { IP_ANY, type Ipv4 } from '../core/ipv4';
import { MAC_BROADCAST, type Mac } from '../core/mac';
import type { Scheduler, TimerId } from '../core/scheduler';
import type { ArpPacket } from '../net/frames';
import type { L3Interface } from './interface';

export interface ArpEntry {
  readonly ip: Ipv4;
  readonly mac: Mac;
  readonly iface: number;
}

interface PendingResolution {
  readonly iface: L3Interface;
  readonly callbacks: ((mac: Mac | null) => void)[];
  attempts: number;
  timer: TimerId | null;
}

export const ARP_RETRY_DELAY = 1000;
export const ARP_MAX_ATTEMPTS = 3;

/** Address Resolution Protocol: IPv4 → MAC with a cache and retries. */
export class Arp {
  private readonly cache = new Map<Ipv4, ArpEntry>();
  private readonly pending = new Map<Ipv4, PendingResolution>();

  constructor(
    private readonly scheduler: Scheduler,
    private readonly onChange: () => void,
  ) {}

  get entries(): readonly ArpEntry[] {
    return [...this.cache.values()];
  }

  lookup(ip: Ipv4): Mac | null {
    return this.cache.get(ip)?.mac ?? null;
  }

  /** Calls back with the MAC of `ip`, or null when nobody answered. */
  resolve(iface: L3Interface, ip: Ipv4, callback: (mac: Mac | null) => void): void {
    const known = this.lookup(ip);
    if (known) {
      callback(known);
      return;
    }
    const pending = this.pending.get(ip);
    if (pending) {
      pending.callbacks.push(callback);
      return;
    }
    const resolution: PendingResolution = { iface, callbacks: [callback], attempts: 0, timer: null };
    this.pending.set(ip, resolution);
    this.sendRequest(ip, resolution);
  }

  handle(iface: L3Interface, packet: ArpPacket): void {
    const forUs = iface.ip !== IP_ANY && packet.targetIp === iface.ip;
    if (packet.senderIp !== IP_ANY && (forUs || this.cache.has(packet.senderIp))) {
      this.learn(packet.senderIp, packet.senderMac, iface.port.index);
    }
    if (packet.op === 'request' && forUs) {
      iface.port.send({
        src: iface.port.mac,
        dst: packet.senderMac,
        payload: {
          kind: 'arp',
          op: 'reply',
          senderMac: iface.port.mac,
          senderIp: iface.ip,
          targetMac: packet.senderMac,
          targetIp: packet.senderIp,
        },
      });
    }
  }

  clear(): void {
    for (const p of this.pending.values()) this.scheduler.cancel(p.timer);
    this.pending.clear();
    this.cache.clear();
  }

  private learn(ip: Ipv4, mac: Mac, iface: number): void {
    const previous = this.cache.get(ip);
    if (previous?.mac !== mac || previous.iface !== iface) {
      this.cache.set(ip, { ip, mac, iface });
      this.onChange();
    }
    const pending = this.pending.get(ip);
    if (pending) {
      this.pending.delete(ip);
      this.scheduler.cancel(pending.timer);
      for (const cb of pending.callbacks) cb(mac);
    }
  }

  private sendRequest(ip: Ipv4, resolution: PendingResolution): void {
    resolution.attempts++;
    const { port, ip: ownIp } = resolution.iface;
    port.send({
      src: port.mac,
      dst: MAC_BROADCAST,
      payload: {
        kind: 'arp',
        op: 'request',
        senderMac: port.mac,
        senderIp: ownIp,
        targetMac: '00:00:00:00:00:00',
        targetIp: ip,
      },
    });
    resolution.timer = this.scheduler.schedule(ARP_RETRY_DELAY, () => {
      if (resolution.attempts < ARP_MAX_ATTEMPTS) {
        this.sendRequest(ip, resolution);
        return;
      }
      this.pending.delete(ip);
      for (const cb of resolution.callbacks) cb(null);
    });
  }
}
