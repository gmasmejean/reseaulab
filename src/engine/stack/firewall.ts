import { IP_ANY, networkOf, type Ipv4 } from '../core/ipv4';
import type { Ipv4Packet } from '../net/frames';

export type FirewallProtocol = 'any' | 'tcp' | 'udp' | 'icmp';
export type FirewallAction = 'accept' | 'drop';

export interface FirewallRule {
  readonly action: FirewallAction;
  readonly protocol: FirewallProtocol;
  readonly source: Ipv4;
  readonly sourceMask: Ipv4;
  readonly destination: Ipv4;
  readonly destinationMask: Ipv4;
  /** Destination port; 0 means any port. */
  readonly port: number;
}

export const DHCP_CLIENT_PORT = 68;

/**
 * Stateful packet filter. Only packets that *open* a flow (TCP SYN, UDP
 * datagram, ICMP echo request) are checked against the rules: replies to an
 * accepted flow, and ICMP error messages, are always let through. Rules are
 * evaluated in order; the first matching rule wins; otherwise the packet is
 * dropped.
 */
export class Firewall {
  enabled = false;
  rules: FirewallRule[] = [];
  private readonly flows = new Set<string>();
  private dropped = 0;

  get droppedCount(): number {
    return this.dropped;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setRules(rules: readonly FirewallRule[]): void {
    this.rules = [...rules];
  }

  /** Records a flow initiated by the protected side (locally generated traffic). */
  track(packet: Ipv4Packet): void {
    const key = flowKey(packet, false);
    if (key) this.flows.add(key);
  }

  /** Returns true when the packet may pass. */
  allows(packet: Ipv4Packet): boolean {
    if (!this.enabled) return true;
    const payload = packet.payload;
    if (payload.kind === 'icmp' && (payload.type === 'time-exceeded' || payload.type === 'unreachable')) {
      return true;
    }
    if (payload.kind === 'udp' && payload.dstPort === DHCP_CLIENT_PORT) return true;
    const reverse = flowKey(packet, true);
    if (reverse && this.flows.has(reverse)) return true;
    if (payload.kind === 'tcp' && !(payload.flags.syn && !payload.flags.ack)) {
      // Mid-connection segment of a flow we never accepted.
      this.dropped++;
      return false;
    }
    const rule = this.rules.find((r) => matches(r, packet));
    if (rule?.action === 'accept') {
      this.track(packet);
      return true;
    }
    this.dropped++;
    return false;
  }

  reset(): void {
    this.flows.clear();
    this.dropped = 0;
  }
}

function matches(rule: FirewallRule, packet: Ipv4Packet): boolean {
  const payload = packet.payload;
  if (rule.protocol !== 'any' && rule.protocol !== payload.kind) return false;
  if (!inNetwork(packet.src, rule.source, rule.sourceMask)) return false;
  if (!inNetwork(packet.dst, rule.destination, rule.destinationMask)) return false;
  if (rule.port !== 0) {
    if (payload.kind === 'icmp') return false;
    if (payload.dstPort !== rule.port) return false;
  }
  return true;
}

function inNetwork(ip: Ipv4, network: Ipv4, mask: Ipv4): boolean {
  if (network === IP_ANY && mask === IP_ANY) return true;
  return networkOf(ip, mask) === networkOf(network, mask);
}

/** Identifies a flow; `reverse` builds the key the reply direction would have. */
function flowKey(packet: Ipv4Packet, reverse: boolean): string | null {
  const p = packet.payload;
  const [a, b] = reverse ? [packet.dst, packet.src] : [packet.src, packet.dst];
  if (p.kind === 'icmp') {
    // Only an echo reply can answer an echo request we let through.
    const expected = reverse ? 'echo-reply' : 'echo-request';
    return p.type === expected ? `icmp|${a}|${b}|${p.ident}` : null;
  }
  const [pa, pb] = reverse ? [p.dstPort, p.srcPort] : [p.srcPort, p.dstPort];
  return `${p.kind}|${a}|${pa}|${b}|${pb}`;
}
