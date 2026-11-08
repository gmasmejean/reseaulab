/* Helpers shared by engine tests. Not used by the application itself. */
import { parseIp, prefixToMask, type Ipv4 } from './core/ipv4';
import type { Host } from './devices/host';
import type { Router } from './devices/router';
import { Network } from './network';
import type { PingResult } from './stack/icmp';

export function ip(text: string): Ipv4 {
  const value = parseIp(text);
  if (value === null) throw new Error(`Adresse invalide dans un test : ${text}`);
  return value;
}

export const MASK_24 = prefixToMask(24);

export function staticHost(
  net: Network,
  name: string,
  address: string,
  gateway = '0.0.0.0',
  dns = '0.0.0.0',
) {
  return net.addHost('computer', {
    name,
    config: { ip: ip(address), mask: MASK_24, gateway: ip(gateway), dns: ip(dns) },
  });
}

/** Two hosts on one switch: 192.168.0.1 and 192.168.0.2. */
export function simpleLan() {
  const net = new Network();
  const a = staticHost(net, 'A', '192.168.0.1');
  const b = staticHost(net, 'B', '192.168.0.2');
  const sw = net.addSwitch();
  net.connect(a.id, sw.id);
  net.connect(b.id, sw.id);
  return { net, a, b, sw };
}

/**
 * A (192.168.1.10) — switch — R (192.168.1.1 | 192.168.2.1) — switch — B (192.168.2.10)
 */
export function routedNetwork() {
  const net = new Network();
  const a = staticHost(net, 'A', '192.168.1.10', '192.168.1.1');
  const b = staticHost(net, 'B', '192.168.2.10', '192.168.2.1');
  const r = net.addRouter({ name: 'R' });
  r.setInterface(0, { ip: ip('192.168.1.1'), mask: MASK_24 });
  r.setInterface(1, { ip: ip('192.168.2.1'), mask: MASK_24 });
  const s1 = net.addSwitch();
  const s2 = net.addSwitch();
  net.connect(a.id, s1.id);
  net.connect(r.id, s1.id);
  net.connect(r.id, s2.id);
  net.connect(b.id, s2.id);
  return { net, a, b, r, s1, s2 };
}

export function ping(net: Network, from: Host | Router, dst: string, ttl?: number): PingResult {
  const results: PingResult[] = [];
  from.stack.icmp.ping(ip(dst), ttl === undefined ? {} : { ttl }, (r) => results.push(r));
  net.scheduler.runUntilIdle();
  const [result, ...extra] = results;
  if (!result || extra.length > 0) throw new Error(`ping : ${results.length} résultats au lieu d’un`);
  return result;
}

/** Like ping() but for networks with periodic traffic (RIP): runs the clock for `duration` ms. */
export function pingFor(
  net: Network,
  from: Host | Router,
  dst: string,
  duration = 10_000,
): PingResult | null {
  let result: PingResult | null = null;
  from.stack.icmp.ping(ip(dst), {}, (r) => {
    result ??= r;
  });
  net.scheduler.advance(duration);
  return result;
}

/** Starts an asynchronous engine operation, runs the simulation, returns its single result. */
export function settle<T>(net: Network, start: (done: (result: T) => void) => void): T {
  const results: T[] = [];
  start((r) => results.push(r));
  net.scheduler.runUntilIdle();
  const [result, ...extra] = results;
  if (result === undefined || extra.length > 0) throw new Error(`${results.length} résultats au lieu d’un`);
  return result;
}

/** Message of an `{ kind: 'error', message }` result (empty string otherwise). */
export function errorMessage(result: { readonly kind: string; readonly message?: string }): string {
  return result.kind === 'error' ? (result.message ?? '') : '';
}
