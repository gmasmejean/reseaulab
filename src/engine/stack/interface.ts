import { IP_ANY, type Ipv4 } from '../core/ipv4';
import type { Port } from '../net/link';

/** A network-layer interface: a port with its IPv4 configuration. */
export interface L3Interface {
  readonly port: Port;
  ip: Ipv4;
  mask: Ipv4;
}

export function isConfigured(iface: L3Interface): boolean {
  return iface.ip !== IP_ANY;
}
