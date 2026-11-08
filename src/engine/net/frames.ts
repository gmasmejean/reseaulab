import type { Ipv4 } from '../core/ipv4';
import type { Mac } from '../core/mac';
import type { UdpData } from './messages';

export interface ArpPacket {
  readonly kind: 'arp';
  readonly op: 'request' | 'reply';
  readonly senderMac: Mac;
  readonly senderIp: Ipv4;
  readonly targetMac: Mac;
  readonly targetIp: Ipv4;
}

export type IcmpType = 'echo-request' | 'echo-reply' | 'time-exceeded' | 'unreachable';
export type UnreachableCode = 'net' | 'host' | 'port';

export interface IcmpMessage {
  readonly kind: 'icmp';
  readonly type: IcmpType;
  readonly code?: UnreachableCode;
  readonly ident: number;
  readonly seq: number;
  /** For error messages: the packet that triggered the error. */
  readonly original?: Ipv4Packet;
}

export interface UdpDatagram {
  readonly kind: 'udp';
  readonly srcPort: number;
  readonly dstPort: number;
  readonly data: UdpData;
}

export interface TcpFlags {
  readonly syn?: true;
  readonly ack?: true;
  readonly fin?: true;
  readonly rst?: true;
  readonly psh?: true;
}

export interface TcpSegment {
  readonly kind: 'tcp';
  readonly srcPort: number;
  readonly dstPort: number;
  readonly seq: number;
  readonly ack: number;
  readonly flags: TcpFlags;
  readonly data: string;
}

export type TransportPayload = IcmpMessage | UdpDatagram | TcpSegment;

export interface Ipv4Packet {
  readonly kind: 'ipv4';
  readonly id: number;
  readonly src: Ipv4;
  readonly dst: Ipv4;
  readonly ttl: number;
  readonly payload: TransportPayload;
}

export interface EthernetFrame {
  readonly src: Mac;
  readonly dst: Mac;
  readonly payload: ArpPacket | Ipv4Packet;
}

export const DEFAULT_TTL = 64;
