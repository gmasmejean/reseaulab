import { formatIp, parseIp, type Ipv4 } from '../../engine/core/ipv4';
import { Host } from '../../engine/devices/host';
import { NetworkNode } from '../../engine/devices/node';
import type { DropEvent } from '../../engine/net/drop';
import type { Network } from '../../engine/network';
import { DNS_ERROR_TEXT, type ResolveResult } from '../../engine/services/dns';
import type { PingResult } from '../../engine/stack/icmp';
import { isConfigured } from '../../engine/stack/interface';
import { prepareProbe, runBounded, type Probe } from '../sim/probe';
import type { Finding, TraceCode } from './findings';
import { switchLoop } from './topology';

/* « Pourquoi ça ne marche pas ? » : a ping is replayed on a copy of the
 * network with the real engine, which reports where the packet was given up
 * on and why. Rules then turn this symptom into a cause a pupil can act on.
 * There is no second implementation of routing here: the copy *is* the
 * network, so the answer cannot disagree with what the pupil sees. */

/** Virtual time allowed for name resolution, then for the ping itself. */
const RESOLVE_MS = 12_000;
const PING_MS = 20_000;

export type TraceTarget =
  | { readonly kind: 'device'; readonly id: string }
  /** An IP address, the name of a device of the plan, or a DNS name. */
  | { readonly kind: 'text'; readonly text: string };

export interface TraceResult {
  readonly ok: boolean;
  /** The explanation, most useful first (one finding in practice). */
  readonly findings: readonly Finding[];
  /** Devices the request went through, in order, up to where it stopped. */
  readonly reached: readonly string[];
}

function firstAddress(node: NetworkNode): Ipv4 | null {
  return node.stack.interfaces.find(isConfigured)?.ip ?? null;
}

function ownerOf(sim: Network, address: Ipv4): NetworkNode | undefined {
  return sim.devices.find(
    (d): d is NetworkNode => d instanceof NetworkNode && d.stack.interfaces.some((i) => i.ip === address),
  );
}

function sameName(a: string, b: string): boolean {
  const fold = (s: string) => s.trim().toLocaleLowerCase('fr');
  return fold(a) === fold(b);
}

export function tracePath(network: Network, fromId: string, target: TraceTarget): TraceResult {
  const label = target.kind === 'text' ? target.text.trim() : (network.device(target.id)?.name ?? '');
  const failed = (
    code: TraceCode,
    deviceIds: readonly string[],
    params: Finding['params'] = {},
    reached: readonly string[] = [],
  ): TraceResult => ({
    ok: false,
    findings: [{ code, severity: 'error', deviceIds, params: { target: label, ...params } }],
    reached,
  });

  if (switchLoop(network).length > 0) return failed('trace-not-simulated', [fromId]);
  const probe = prepareProbe(network);
  const from = probe.sim.device(fromId);
  if (!(from instanceof NetworkNode)) return failed('trace-target-unknown', []);
  if (probe.overflow) return failed('trace-not-simulated', [fromId]);

  // Who is the destination?
  let address: Ipv4 | null = null;
  let known: NetworkNode | undefined;
  if (target.kind === 'device') {
    const device = probe.sim.device(target.id);
    if (!(device instanceof NetworkNode)) return failed('trace-target-unknown', [fromId]);
    known = device;
  } else {
    address = parseIp(label);
    if (address === null) {
      const named = probe.sim.devices.find((d) => sameName(d.name, label));
      if (named instanceof NetworkNode) known = named;
      else if (named || label === '' || !(from instanceof Host))
        return failed('trace-target-unknown', [fromId]);
    }
  }
  if (known) {
    address = firstAddress(known);
    if (address === null) return failed('trace-target-no-address', [fromId, known.id]);
  }
  if (address === null && from instanceof Host) {
    let answer: ResolveResult | null = null;
    from.dns.resolve(label, (result) => {
      answer = result;
    });
    runBounded(probe.sim, () => answer !== null, RESOLVE_MS);
    const resolved = answer as ResolveResult | null;
    if (resolved?.kind !== 'ok') {
      const reason = resolved ? DNS_ERROR_TEXT[resolved.error] : DNS_ERROR_TEXT.timeout;
      return failed('trace-dns', [fromId], { reason });
    }
    address = resolved.ip;
  }
  if (address === null) return failed('trace-target-unknown', [fromId]);

  probe.drops.length = 0;
  probe.transmits.length = 0;
  let outcome: PingResult | null = null;
  from.stack.icmp.ping(address, {}, (result) => {
    outcome = result;
  });
  runBounded(probe.sim, () => outcome !== null, PING_MS);
  const result = outcome as PingResult | null;

  const drop = probe.drops.find(
    (d) =>
      d.payload.kind === 'icmp' && (d.payload.type === 'echo-request' || d.payload.type === 'echo-reply'),
  );
  const reached = requestPath(probe, address, drop, result?.kind === 'reply');
  const params = { target: target.kind === 'text' && parseIp(label) === null ? label : formatIp(address) };
  if (result?.kind === 'reply') {
    const owner = ownerOf(probe.sim, address);
    return {
      ok: true,
      findings: [
        { code: 'trace-ok', severity: 'success', deviceIds: owner ? [fromId, owner.id] : [fromId], params },
      ],
      reached,
    };
  }
  const explained = drop ? explain(probe.sim, fromId, drop) : null;
  const finding: Finding = explained
    ? { ...explained, params: { ...params, ...explained.params } }
    : { code: 'trace-unexplained', severity: 'error', deviceIds: [fromId], params };
  return { ok: false, findings: [finding], reached };
}

/** Turns « where and why the packet stopped » into a cause the pupil can correct. */
function explain(sim: Network, fromId: string, drop: DropEvent): Finding {
  const where = drop.deviceId;
  const isRequest = drop.payload.kind === 'icmp' && drop.payload.type === 'echo-request';
  const make = (code: TraceCode, deviceIds: readonly string[], params: Finding['params'] = {}): Finding => ({
    code,
    severity: 'error',
    deviceIds,
    params,
  });
  switch (drop.reason) {
    case 'no-address':
      return make('trace-no-address', [where]);
    case 'no-route':
      if (drop.stage === 'forward') {
        return make(isRequest ? 'trace-router-no-route' : 'trace-router-no-return-route', [where]);
      }
      if (!isRequest) return make('trace-no-return-route', [where]);
      return make(drop.gatewayIgnored ? 'trace-gateway-outside' : 'trace-no-gateway', [where]);
    case 'no-link':
      return make('trace-no-link', [where]);
    case 'arp-timeout': {
      const hop = drop.nextHop ?? drop.dst;
      if (hop === drop.dst) {
        // The sender looked for the destination itself on its own network.
        const owner = ownerOf(sim, hop);
        return owner && owner.id !== where
          ? make('trace-other-segment', [where, owner.id])
          : make('trace-nobody-has-address', [where]);
      }
      const code = sim.device(where) instanceof Host ? 'trace-gateway-nobody' : 'trace-next-hop-nobody';
      return make(code, [where], { gateway: formatIp(hop) });
    }
    case 'ttl-expired':
      return make('trace-ttl', [where]);
    case 'firewall':
      return make('trace-firewall', [where]);
    case 'not-a-router':
      return make('trace-gateway-not-router', [where, fromId]);
    case 'iface-unconfigured':
      return make('trace-router-iface-unconfigured', [where]);
    case 'port-closed':
      return make('trace-unexplained', [fromId]);
  }
}

/** Devices that carried the echo request, in order, ending where it stopped. */
function requestPath(probe: Probe, address: Ipv4, drop: DropEvent | undefined, answered: boolean): string[] {
  const path: string[] = [];
  const visit = (id: string | undefined) => {
    if (id !== undefined && !path.includes(id)) path.push(id);
  };
  for (const t of probe.transmits) {
    const packet = t.frame.payload;
    if (packet.kind !== 'ipv4' || packet.dst !== address) continue;
    if (packet.payload.kind === 'icmp' && packet.payload.type === 'echo-request') visit(t.from);
  }
  if (answered) visit(ownerOf(probe.sim, address)?.id);
  else if (drop?.payload.kind === 'icmp' && drop.payload.type === 'echo-request') visit(drop.deviceId);
  return path;
}
