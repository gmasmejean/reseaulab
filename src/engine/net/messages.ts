import type { Ipv4 } from '../core/ipv4';
import type { Mac } from '../core/mac';

/* Application messages carried by UDP. They are structured objects rather
 * than raw bytes so the packet viewer can display every field. */

export type DhcpOp = 'DISCOVER' | 'OFFER' | 'REQUEST' | 'ACK' | 'NAK';

export interface DhcpMessage {
  readonly op: DhcpOp;
  readonly xid: number;
  readonly clientMac: Mac;
  /** Address offered/assigned to the client. */
  readonly yourIp: Ipv4;
  readonly serverIp: Ipv4;
  readonly requestedIp?: Ipv4;
  readonly mask?: Ipv4;
  readonly gateway?: Ipv4;
  readonly dns?: Ipv4;
}

export type DnsRecordType = 'A' | 'MX' | 'NS';

export interface DnsRecord {
  readonly name: string;
  readonly type: DnsRecordType;
  /** IPv4 address for A records, host name for MX/NS. */
  readonly value: string;
}

export type DnsRcode = 'OK' | 'NXDOMAIN' | 'SERVFAIL';

export interface DnsMessage {
  readonly id: number;
  readonly response: boolean;
  readonly question: { readonly name: string; readonly type: DnsRecordType };
  readonly answers: readonly DnsRecord[];
  readonly rcode: DnsRcode;
}

export interface RipRoute {
  readonly network: Ipv4;
  readonly mask: Ipv4;
  readonly metric: number;
}

export interface RipMessage {
  readonly command: 'request' | 'response';
  readonly routes: readonly RipRoute[];
}

export type UdpData =
  | { readonly kind: 'dhcp'; readonly msg: DhcpMessage }
  | { readonly kind: 'dns'; readonly msg: DnsMessage }
  | { readonly kind: 'rip'; readonly msg: RipMessage }
  | { readonly kind: 'text'; readonly text: string };
