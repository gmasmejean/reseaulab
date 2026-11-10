/* What the diagnosis found, as data: a code, where, and the values to quote.
 * The French sentences are in messages.fr.ts, so that a teacher can reword
 * them without touching the rules. */

/** Problems visible in the design of a network, before any simulation. */
export const LINT_CODES = [
  'not-cabled',
  'wifi-not-joined',
  'ip-missing',
  'mask-missing',
  'ip-not-usable',
  'ip-duplicate',
  'segment-several-networks',
  'gateway-outside',
  'gateway-nobody',
  'gateway-not-router',
  'gateway-missing',
  'dns-missing',
  'dns-no-server',
  'server-not-started',
  'dhcp-no-server',
  'dhcp-server-dynamic',
  'dhcp-range-outside',
  'router-iface-unconfigured',
  'router-ifaces-same-network',
  'switch-loop',
] as const;

/** Outcome of a communication test between two devices. */
export const TRACE_CODES = [
  'trace-ok',
  'trace-not-simulated',
  'trace-target-unknown',
  'trace-target-no-address',
  'trace-dns',
  'trace-no-address',
  'trace-no-gateway',
  'trace-gateway-outside',
  'trace-no-link',
  'trace-nobody-has-address',
  'trace-other-segment',
  'trace-gateway-nobody',
  'trace-gateway-not-router',
  'trace-router-no-route',
  'trace-router-no-return-route',
  'trace-no-return-route',
  'trace-next-hop-nobody',
  'trace-router-iface-unconfigured',
  'trace-firewall',
  'trace-ttl',
  'trace-unexplained',
] as const;

export type LintCode = (typeof LINT_CODES)[number];
export type TraceCode = (typeof TRACE_CODES)[number];
export type FindingCode = LintCode | TraceCode;

export type Severity = 'error' | 'warning' | 'info' | 'success';

export interface Finding {
  readonly code: FindingCode;
  readonly severity: Severity;
  /** Devices concerned, the main one first. */
  readonly deviceIds: readonly string[];
  /** Values quoted by the message: addresses, names of services… */
  readonly params: Readonly<Record<string, string | number>>;
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2, success: 3 };

/** Most serious findings first; the order is otherwise kept. */
export function bySeverity(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

/** The most serious level among the findings about a device, or null. */
export function worstFor(findings: readonly Finding[], deviceId: string): Severity | null {
  let worst: Severity | null = null;
  for (const f of findings) {
    if (!f.deviceIds.includes(deviceId)) continue;
    if (worst === null || RANK[f.severity] < RANK[worst]) worst = f.severity;
  }
  return worst;
}
