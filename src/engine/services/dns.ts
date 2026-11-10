import { IP_ANY, formatIp, parseIp, type Ipv4 } from '../core/ipv4';
import type { TimerId } from '../core/scheduler';
import type { Host } from '../devices/host';
import type { DnsMessage, DnsRecord, DnsRecordType } from '../net/messages';
import { ServerApp } from './server-app';
import { normalizeDomain } from './text-stream';

export const DNS_PORT = 53;
export const DNS_TIMEOUT = 2000;
export const DNS_ATTEMPTS = 2;

export type DnsError = 'nxdomain' | 'timeout' | 'no-server' | 'servfail';

export type DnsResult =
  | { readonly kind: 'ok'; readonly records: readonly DnsRecord[]; readonly server: Ipv4 }
  | { readonly kind: 'error'; readonly error: DnsError };

export type ResolveResult =
  { readonly kind: 'ok'; readonly ip: Ipv4 } | { readonly kind: 'error'; readonly error: DnsError };

export const DNS_ERROR_TEXT: Record<DnsError, string> = {
  nxdomain: 'nom de domaine inconnu',
  timeout: 'le serveur DNS ne répond pas',
  'no-server': 'aucun serveur DNS configuré',
  servfail: 'échec du serveur DNS',
};

/** Sends one DNS query from `host` to `server` (UDP, with retry). */
export function queryServer(
  host: Host,
  server: Ipv4,
  name: string,
  type: DnsRecordType,
  done: (result: DnsResult) => void,
): void {
  const scheduler = host.stack.scheduler;
  let attempts = 0;
  let timer: TimerId | null = null;
  const binding = host.udp.bindEphemeral((data, info) => {
    if (data.kind !== 'dns' || !data.msg.response || data.msg.id !== id) return;
    finish();
    const msg = data.msg;
    if (msg.rcode === 'NXDOMAIN') done({ kind: 'error', error: 'nxdomain' });
    else if (msg.rcode === 'SERVFAIL') done({ kind: 'error', error: 'servfail' });
    else done({ kind: 'ok', records: msg.answers, server: info.src });
  });
  // The ephemeral port is unique among the host's pending queries: use it as the query id.
  const id = binding.port;
  const finish = () => {
    scheduler.cancel(timer);
    binding.close();
  };
  const attempt = () => {
    attempts++;
    const query: DnsMessage = { id, response: false, question: { name, type }, answers: [], rcode: 'OK' };
    const status = host.udp.send(binding.port, server, DNS_PORT, { kind: 'dns', msg: query });
    timer = scheduler.schedule(status === 'sent' ? DNS_TIMEOUT : 0, () => {
      if (status === 'sent' && attempts < DNS_ATTEMPTS) {
        attempt();
        return;
      }
      finish();
      done({ kind: 'error', error: 'timeout' });
    });
  };
  attempt();
}

/** Client side of DNS, built into every computer. */
export class DnsResolver {
  constructor(private readonly host: Host) {}

  query(name: string, type: DnsRecordType, done: (result: DnsResult) => void): void {
    const server = this.host.dnsServerAddress;
    if (server === IP_ANY) {
      this.host.stack.scheduler.schedule(0, () => {
        done({ kind: 'error', error: 'no-server' });
      });
      return;
    }
    queryServer(this.host, server, normalizeDomain(name), type, done);
  }

  /** Resolves a host name (or dotted address) to an IPv4 address. */
  resolve(nameOrIp: string, done: (result: ResolveResult) => void): void {
    const literal = parseIp(nameOrIp);
    if (literal !== null) {
      this.host.stack.scheduler.schedule(0, () => {
        done({ kind: 'ok', ip: literal });
      });
      return;
    }
    if (normalizeDomain(nameOrIp) === 'localhost') {
      this.host.stack.scheduler.schedule(0, () => {
        done({ kind: 'ok', ip: 0x7f000001 });
      });
      return;
    }
    this.query(nameOrIp, 'A', (result) => {
      if (result.kind === 'error') {
        done(result);
        return;
      }
      const ip = result.records.flatMap((r) => {
        const value = r.type === 'A' ? parseIp(r.value) : null;
        return value === null ? [] : [value];
      })[0];
      done(ip === undefined ? { kind: 'error', error: 'nxdomain' } : { kind: 'ok', ip });
    });
  }
}

export interface DnsServerConfig {
  records: DnsRecord[];
  /** Ask the server named by an NS record when the name belongs to a delegated zone. */
  recursion: boolean;
}

/**
 * Authoritative DNS server for its own records. With recursion enabled it
 * forwards queries for delegated zones (NS records, "." meaning every name)
 * to the delegated server and relays the answer.
 */
export class DnsServer extends ServerApp<Host> {
  config: DnsServerConfig = { records: [], recursion: true };
  private release: (() => void) | null = null;
  private readonly inFlight = new Set<string>();

  updateConfig(config: Partial<DnsServerConfig>): void {
    this.config = { ...this.config, ...config };
    this.host.changed();
  }

  /** Answers a question from local data, or returns null to delegate. */
  answerLocally(name: string, type: DnsRecordType): { records: DnsRecord[]; known: boolean } {
    const records = this.config.records.filter((r) => normalizeDomain(r.name) === name);
    return { records: records.filter((r) => r.type === type), known: records.length > 0 };
  }

  protected listen(): void {
    this.release = this.host.udp.bind(DNS_PORT, (data, info) => {
      if (data.kind === 'dns' && !data.msg.response) this.handle(data.msg, info.src, info.srcPort);
    });
  }

  protected unlisten(): void {
    this.release?.();
    this.release = null;
    this.inFlight.clear();
  }

  private handle(query: DnsMessage, client: Ipv4, clientPort: number): void {
    const name = normalizeDomain(query.question.name);
    const type = query.question.type;
    const respond = (answers: readonly DnsRecord[], rcode: DnsMessage['rcode']) => {
      const msg: DnsMessage = { id: query.id, response: true, question: query.question, answers, rcode };
      this.host.udp.send(DNS_PORT, client, clientPort, { kind: 'dns', msg });
    };
    const local = this.answerLocally(name, type);
    if (local.known) {
      this.addLog(`${type} ${name} → ${local.records.map((r) => r.value).join(', ') || 'aucun'}`);
      respond(local.records, 'OK');
      return;
    }
    const delegate = this.config.recursion ? this.findDelegate(name) : null;
    const key = `${type}|${name}`;
    if (delegate === null || this.inFlight.has(key)) {
      this.addLog(`${type} ${name} → inconnu`);
      respond([], 'NXDOMAIN');
      return;
    }
    this.addLog(`${type} ${name} → demandé à ${formatIp(delegate)}`);
    this.inFlight.add(key);
    queryServer(this.host, delegate, name, type, (result) => {
      this.inFlight.delete(key);
      if (result.kind === 'ok') respond(result.records, 'OK');
      else respond([], result.error === 'nxdomain' ? 'NXDOMAIN' : 'SERVFAIL');
    });
  }

  /** IP of the most specific NS delegation covering `name`. */
  private findDelegate(name: string): Ipv4 | null {
    let best: { length: number; ip: Ipv4 } | null = null;
    for (const record of this.config.records) {
      if (record.type !== 'NS') continue;
      const zone = record.name.trim() === '.' ? '' : normalizeDomain(record.name);
      const covers = zone === '' || name === zone || name.endsWith(`.${zone}`);
      if (!covers || (best && best.length >= zone.length)) continue;
      const ip = this.addressOf(record.value);
      if (ip !== null && !this.host.stack.isLocalAddress(ip)) best = { length: zone.length, ip };
    }
    return best?.ip ?? null;
  }

  private addressOf(nameOrIp: string): Ipv4 | null {
    const literal = parseIp(nameOrIp);
    if (literal !== null) return literal;
    const glue = this.answerLocally(normalizeDomain(nameOrIp), 'A').records[0];
    return glue ? parseIp(glue.value) : null;
  }
}
