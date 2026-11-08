import { IP_ANY, IP_BROADCAST, type Ipv4 } from '../core/ipv4';
import type { TimerId } from '../core/scheduler';
import type { Ipv4Packet, TcpFlags, TcpSegment } from '../net/frames';
import type { IpStack } from './ip-stack';
import { EphemeralPorts } from './ports';

export type TcpState =
  | 'CLOSED'
  | 'SYN_SENT'
  | 'SYN_RECEIVED'
  | 'ESTABLISHED'
  | 'FIN_WAIT_1'
  | 'FIN_WAIT_2'
  | 'CLOSE_WAIT'
  | 'CLOSING'
  | 'LAST_ACK'
  | 'TIME_WAIT';

export type CloseReason = 'closed' | 'reset' | 'refused' | 'timeout' | 'no-route';

export interface TcpSocketHandlers {
  open?: () => void;
  data?: (text: string) => void;
  /** The peer has finished sending. The socket closes itself afterwards. */
  end?: () => void;
  close?: (reason: CloseReason) => void;
}

export const TCP_MSS = 1000;
export const TCP_RTO = 1000;
export const TCP_MAX_RETRIES = 5;
export const TCP_TIME_WAIT = 1000;

interface Unacked {
  readonly seq: number;
  readonly flags: TcpFlags;
  readonly data: string;
}

function segmentLength(seg: { flags: TcpFlags; data: string }): number {
  return seg.data.length + (seg.flags.syn ? 1 : 0) + (seg.flags.fin ? 1 : 0);
}

export class TcpSocket {
  state: TcpState = 'CLOSED';
  handlers: TcpSocketHandlers = {};
  private sndUna = 0;
  private sndNxt = 0;
  private rcvNxt = 0;
  private readonly queued: string[] = [];
  private closeRequested = false;
  private finSent = false;
  private unacked: Unacked[] = [];
  private retries = 0;
  private timer: TimerId | null = null;
  private notifiedClose = false;

  constructor(
    private readonly tcp: Tcp,
    readonly localIp: Ipv4,
    readonly localPort: number,
    readonly remoteIp: Ipv4,
    readonly remotePort: number,
  ) {}

  get key(): string {
    return socketKey(this.localPort, this.remoteIp, this.remotePort);
  }

  get isOpen(): boolean {
    return this.state === 'ESTABLISHED' || this.state === 'CLOSE_WAIT';
  }

  on(handlers: TcpSocketHandlers): this {
    this.handlers = { ...this.handlers, ...handlers };
    return this;
  }

  send(text: string): void {
    if (text.length === 0 || this.closeRequested) return;
    if (this.state === 'SYN_SENT' || this.state === 'SYN_RECEIVED') {
      this.queued.push(text);
      return;
    }
    this.sendData(text);
  }

  /** Graceful close: remaining data is sent, then FIN. */
  close(): void {
    if (this.closeRequested) return;
    this.closeRequested = true;
    if (this.state === 'SYN_SENT' || this.state === 'SYN_RECEIVED') return; // FIN once established
    this.sendFinIfNeeded();
  }

  /** Immediate close with RST. */
  abort(): void {
    if (this.state !== 'CLOSED' && this.state !== 'TIME_WAIT') {
      this.tcp.transmit(this, this.sndNxt, { rst: true, ack: true }, '');
    }
    this.terminate('reset', false);
  }

  /* ---- called by Tcp ---- */

  openActive(iss: number): void {
    this.state = 'SYN_SENT';
    this.sndUna = iss;
    this.sndNxt = iss;
    this.sendTracked({ syn: true }, '');
  }

  openPassive(iss: number, synSeq: number): void {
    this.state = 'SYN_RECEIVED';
    this.rcvNxt = synSeq + 1;
    this.sndUna = iss;
    this.sndNxt = iss;
    this.sendTracked({ syn: true, ack: true }, '');
  }

  noRoute(): void {
    this.terminate('no-route', false);
  }

  receive(seg: TcpSegment): void {
    if (seg.flags.rst) {
      this.terminate(this.state === 'SYN_SENT' ? 'refused' : 'reset', false);
      return;
    }
    if (this.state === 'SYN_SENT') {
      if (seg.flags.syn && seg.flags.ack && seg.ack === this.sndNxt) {
        this.rcvNxt = seg.seq + 1;
        this.acknowledge(seg.ack);
        this.sendAck(); // completes the handshake before any data leaves
        this.establish();
      }
      return;
    }
    if (seg.flags.syn) {
      // Retransmitted SYN or SYN-ACK: our answer was lost, acknowledge again.
      this.sendAck();
      return;
    }
    if (seg.flags.ack) this.acknowledge(seg.ack);
    if (this.state === 'SYN_RECEIVED' && this.sndUna === this.sndNxt) this.establish();

    const length = segmentLength(seg);
    if (length === 0) return;
    if (seg.seq !== this.rcvNxt) {
      this.sendAck(); // duplicate or out-of-order: re-announce what we expect
      return;
    }
    this.rcvNxt += length;
    if (seg.data.length > 0) this.handlers.data?.(seg.data);
    this.sendAck();
    if (seg.flags.fin) this.receiveFin();
  }

  /* ---- internals ---- */

  private sendData(text: string): void {
    if (!this.isOpen) return;
    for (let i = 0; i < text.length; i += TCP_MSS) {
      this.sendTracked({ ack: true, psh: true }, text.slice(i, i + TCP_MSS));
    }
  }

  private establish(): void {
    if (this.state !== 'SYN_SENT' && this.state !== 'SYN_RECEIVED') return;
    this.state = 'ESTABLISHED';
    this.tcp.established(this);
    this.handlers.open?.();
    for (const text of this.queued.splice(0)) this.sendData(text);
    if (this.closeRequested) this.sendFinIfNeeded();
  }

  private receiveFin(): void {
    switch (this.state) {
      case 'ESTABLISHED':
        this.state = 'CLOSE_WAIT';
        this.handlers.end?.();
        this.closeRequested = true;
        this.sendFinIfNeeded();
        break;
      case 'FIN_WAIT_1':
        this.state = 'CLOSING';
        break;
      case 'FIN_WAIT_2':
        this.enterTimeWait();
        break;
      default:
        break;
    }
  }

  private acknowledge(ack: number): void {
    if (ack <= this.sndUna || ack > this.sndNxt) return;
    this.sndUna = ack;
    this.unacked = this.unacked.filter((s) => s.seq + segmentLength(s) > ack);
    this.retries = 0;
    this.restartTimer();
    if (this.finSent && ack === this.sndNxt) this.finAcknowledged();
  }

  private finAcknowledged(): void {
    if (this.state === 'FIN_WAIT_1') this.state = 'FIN_WAIT_2';
    else if (this.state === 'CLOSING') this.enterTimeWait();
    else if (this.state === 'LAST_ACK') this.terminate('closed', false);
  }

  private sendFinIfNeeded(): void {
    if (this.finSent) return;
    if (this.state === 'ESTABLISHED') this.state = 'FIN_WAIT_1';
    else if (this.state === 'CLOSE_WAIT') this.state = 'LAST_ACK';
    else return;
    this.finSent = true;
    this.sendTracked({ fin: true, ack: true }, '');
  }

  private enterTimeWait(): void {
    this.state = 'TIME_WAIT';
    this.notifyClose('closed');
    this.tcp.scheduler.cancel(this.timer);
    this.timer = this.tcp.scheduler.schedule(TCP_TIME_WAIT, () => {
      this.terminate('closed', false);
    });
  }

  private sendTracked(flags: TcpFlags, data: string): void {
    const seq = this.sndNxt;
    const segment: Unacked = { seq, flags, data };
    this.sndNxt += segmentLength(segment);
    this.unacked.push(segment);
    if (this.unacked.length === 1) this.restartTimer();
    this.transmitSegment(segment);
  }

  private transmitSegment(segment: Unacked): void {
    const flags: TcpFlags = this.state === 'SYN_SENT' ? segment.flags : { ...segment.flags, ack: true };
    this.tcp.transmit(this, segment.seq, flags, segment.data, this.rcvNxt);
  }

  private sendAck(): void {
    this.tcp.transmit(this, this.sndNxt, { ack: true }, '', this.rcvNxt);
  }

  private restartTimer(): void {
    const scheduler = this.tcp.scheduler;
    scheduler.cancel(this.timer);
    this.timer = null;
    if (this.unacked.length === 0) return;
    this.timer = scheduler.schedule(TCP_RTO, () => {
      this.timer = null;
      if (++this.retries > TCP_MAX_RETRIES) {
        this.terminate('timeout', false);
        return;
      }
      for (const segment of this.unacked) this.transmitSegment(segment);
      this.restartTimer();
    });
  }

  private notifyClose(reason: CloseReason): void {
    if (this.notifiedClose) return;
    this.notifiedClose = true;
    this.handlers.close?.(reason);
  }

  /** Releases the socket. */
  terminate(reason: CloseReason, silent: boolean): void {
    this.tcp.scheduler.cancel(this.timer);
    this.timer = null;
    this.unacked = [];
    this.state = 'CLOSED';
    this.tcp.release(this);
    if (!silent) this.notifyClose(reason);
  }
}

function socketKey(localPort: number, remoteIp: Ipv4, remotePort: number): string {
  return `${localPort}|${remoteIp}|${remotePort}`;
}

export type AcceptHandler = (socket: TcpSocket) => void;

export class Tcp {
  private readonly listeners = new Map<number, AcceptHandler>();
  private readonly sockets = new Map<string, TcpSocket>();
  /** Passive sockets still in the handshake, with the listener to notify. */
  private readonly pendingAccepts = new Map<string, AcceptHandler>();
  private readonly ephemeral = new EphemeralPorts();
  private iss = 1000;

  constructor(private readonly stack: IpStack) {
    stack.register('tcp', (packet) => {
      this.handle(packet);
    });
  }

  get scheduler() {
    return this.stack.scheduler;
  }

  get connections(): readonly TcpSocket[] {
    return [...this.sockets.values()];
  }

  get listeningPorts(): number[] {
    return [...this.listeners.keys()].sort((a, b) => a - b);
  }

  listen(port: number, onAccept: AcceptHandler): () => void {
    if (this.listeners.has(port)) throw new Error(`Port TCP ${port} déjà utilisé`);
    this.listeners.set(port, onAccept);
    return () => {
      if (this.listeners.get(port) === onAccept) this.listeners.delete(port);
    };
  }

  connect(dst: Ipv4, dstPort: number, handlers: TcpSocketHandlers = {}): TcpSocket {
    const localIp = this.stack.sourceFor(dst);
    const localPort = this.ephemeral.allocate(
      (p) => this.listeners.has(p) || this.connections.some((s) => s.localPort === p),
    );
    const socket = new TcpSocket(this, localIp, localPort, dst, dstPort).on(handlers);
    this.sockets.set(socket.key, socket);
    if (dst === IP_BROADCAST || localIp === IP_ANY) {
      this.scheduler.schedule(0, () => {
        socket.noRoute();
      });
      return socket;
    }
    socket.openActive(this.nextIss());
    return socket;
  }

  /** Called by sockets once the three-way handshake completes. */
  established(socket: TcpSocket): void {
    if (socket.state !== 'ESTABLISHED') return;
    const accept = this.pendingAccepts.get(socket.key);
    if (accept) {
      this.pendingAccepts.delete(socket.key);
      accept(socket);
    }
  }

  release(socket: TcpSocket): void {
    if (this.sockets.get(socket.key) === socket) this.sockets.delete(socket.key);
    this.pendingAccepts.delete(socket.key);
  }

  transmit(socket: TcpSocket, seq: number, flags: TcpFlags, data: string, ack = 0): void {
    const segment: TcpSegment = {
      kind: 'tcp',
      srcPort: socket.localPort,
      dstPort: socket.remotePort,
      seq,
      ack: flags.ack ? ack : 0,
      flags,
      data,
    };
    const status = this.stack.send(socket.remoteIp, segment, { src: socket.localIp });
    if (status === 'no-route') {
      this.scheduler.schedule(0, () => {
        if (socket.state !== 'CLOSED') socket.noRoute();
      });
    }
  }

  reset(): void {
    for (const socket of this.connections) socket.terminate('reset', true);
    this.sockets.clear();
    this.listeners.clear();
    this.pendingAccepts.clear();
    this.ephemeral.reset();
    this.iss = 1000;
  }

  private nextIss(): number {
    this.iss += 1000;
    return this.iss;
  }

  private handle(packet: Ipv4Packet): void {
    const seg = packet.payload;
    if (seg.kind !== 'tcp') return;
    const existing = this.sockets.get(socketKey(seg.dstPort, packet.src, seg.srcPort));
    if (existing) {
      existing.receive(seg);
      return;
    }
    const accept = this.listeners.get(seg.dstPort);
    if (accept && seg.flags.syn && !seg.flags.ack) {
      const socket = new TcpSocket(this, packet.dst, seg.dstPort, packet.src, seg.srcPort);
      this.sockets.set(socket.key, socket);
      this.pendingAccepts.set(socket.key, accept);
      socket.openPassive(this.nextIss(), seg.seq);
      return;
    }
    if (seg.flags.rst) return;
    // Nobody listens: answer with a reset.
    const reset: TcpSegment = {
      kind: 'tcp',
      srcPort: seg.dstPort,
      dstPort: seg.srcPort,
      seq: seg.flags.ack ? seg.ack : 0,
      ack: seg.seq + segmentLength(seg),
      flags: { rst: true, ack: true },
      data: '',
    };
    this.stack.send(packet.src, reset, { src: packet.dst });
  }
}
