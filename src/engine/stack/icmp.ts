import { IP_BROADCAST, type Ipv4 } from '../core/ipv4';
import type { TimerId } from '../core/scheduler';
import type { IcmpMessage, Ipv4Packet, UnreachableCode } from '../net/frames';
import type { IpStack } from './ip-stack';

export type PingResult =
  | { readonly kind: 'reply'; readonly from: Ipv4; readonly ttl: number; readonly rtt: number }
  | { readonly kind: 'time-exceeded'; readonly from: Ipv4; readonly rtt: number }
  | { readonly kind: 'unreachable'; readonly from: Ipv4; readonly code: UnreachableCode }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'no-route' };

export interface PingOptions {
  readonly ttl?: number;
  readonly timeout?: number;
  readonly seq?: number;
}

/** Longer than a full ARP resolution (3 × 1 s) so that "host unreachable" can be reported. */
export const PING_TIMEOUT = 4000;

/** ICMP: answers echo requests, sends error messages, and implements ping probes. */
export class Icmp {
  private nextIdent = 1;
  private readonly waiting = new Map<number, (message: IcmpMessage, from: Ipv4, ttl: number) => void>();

  constructor(private readonly stack: IpStack) {}

  handle(packet: Ipv4Packet): void {
    const message = packet.payload;
    if (message.kind !== 'icmp') return;
    if (message.type === 'echo-request') {
      // Echo requests sent to a broadcast address are ignored (no smurf amplification).
      if (!this.stack.isLocalAddress(packet.dst)) return;
      this.stack.send(packet.src, {
        kind: 'icmp',
        type: 'echo-reply',
        ident: message.ident,
        seq: message.seq,
      });
      return;
    }
    const ident =
      message.type === 'echo-reply'
        ? message.ident
        : message.original?.payload.kind === 'icmp'
          ? message.original.payload.ident
          : null;
    if (ident === null) return;
    this.waiting.get(ident)?.(message, packet.src, packet.ttl);
  }

  /** Sends an ICMP error about `original` back to its sender. */
  sendError(
    original: Ipv4Packet,
    type: 'time-exceeded' | 'unreachable',
    code?: UnreachableCode,
    from?: Ipv4,
  ): void {
    const p = original.payload;
    if (p.kind === 'icmp' && p.type !== 'echo-request' && p.type !== 'echo-reply') return;
    if (original.dst === IP_BROADCAST) return;
    const message: IcmpMessage =
      code === undefined
        ? { kind: 'icmp', type, ident: 0, seq: 0, original }
        : { kind: 'icmp', type, code, ident: 0, seq: 0, original };
    this.stack.send(original.src, message, from === undefined ? {} : { src: from });
  }

  /** Sends one echo request and reports the outcome exactly once. Returns a cancel function. */
  ping(dst: Ipv4, options: PingOptions, done: (result: PingResult) => void): () => void {
    const scheduler = this.stack.scheduler;
    const ident = this.nextIdent++;
    const started = scheduler.now;
    let timer: TimerId | null = null;
    const finish = (result: PingResult | null) => {
      this.waiting.delete(ident);
      scheduler.cancel(timer);
      if (result) done(result);
    };
    this.waiting.set(ident, (message, from, ttl) => {
      const rtt = scheduler.now - started;
      if (message.type === 'echo-reply') finish({ kind: 'reply', from, ttl, rtt });
      else if (message.type === 'time-exceeded') finish({ kind: 'time-exceeded', from, rtt });
      else finish({ kind: 'unreachable', from, code: message.code ?? 'host' });
    });
    const status = this.stack.send(
      dst,
      { kind: 'icmp', type: 'echo-request', ident, seq: options.seq ?? 1 },
      {
        ...(options.ttl === undefined ? {} : { ttl: options.ttl }),
        onFailure: () => {
          finish({ kind: 'unreachable', from: this.stack.sourceFor(dst), code: 'host' });
        },
      },
    );
    if (status === 'no-route') {
      // Report asynchronously so callers always get results from the scheduler.
      timer = scheduler.schedule(0, () => {
        finish({ kind: 'no-route' });
      });
    } else {
      timer = scheduler.schedule(options.timeout ?? PING_TIMEOUT, () => {
        finish({ kind: 'timeout' });
      });
    }
    return () => {
      finish(null);
    };
  }

  reset(): void {
    this.waiting.clear();
  }
}
