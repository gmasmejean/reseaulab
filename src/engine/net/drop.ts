import type { Ipv4 } from '../core/ipv4';
import type { TransportPayload } from './frames';

/**
 * Why an IP stack gave up on a packet. A closed list, so that every reason can
 * be explained to pupils.
 *
 * Frames a device merely overhears (flooded by a switch, broadcasts nobody
 * listens to) are not drops: see the verdict of the capture entries.
 */
export type DropReason =
  /** Nothing can be sent: no interface has an address. */
  | 'no-address'
  /** No route to the destination (hosts: no usable gateway). */
  | 'no-route'
  /** The next hop cannot be reached: nothing is plugged into the interface. */
  | 'no-link'
  /** Nobody answered the ARP requests for the next hop. */
  | 'arp-timeout'
  /** A router received the packet with an exhausted time to live. */
  | 'ttl-expired'
  /** A firewall rule (or the default policy) refused the packet. */
  | 'firewall'
  /** A computer was given a packet to relay (it was used as a gateway). */
  | 'not-a-router'
  /** A router received a packet on an interface without address. */
  | 'iface-unconfigured'
  /** No application listens on the UDP port. */
  | 'port-closed';

export interface StackDrop {
  readonly reason: DropReason;
  /** What the stack was doing: sending its own packet, receiving one, relaying one. */
  readonly stage: 'send' | 'receive' | 'forward';
  /** Interface involved, when there is one. */
  readonly iface: number | null;
  /** IP_ANY when the source address was not chosen yet. */
  readonly src: Ipv4;
  readonly dst: Ipv4;
  readonly payload: TransportPayload;
  /** Address that could not be reached (`no-link`, `arp-timeout`). */
  readonly nextHop?: Ipv4;
  /** A gateway is set but ignored, because it is outside the networks of the device. */
  readonly gatewayIgnored?: true;
}

/** A drop, located in the network and in time. */
export interface DropEvent extends StackDrop {
  readonly deviceId: string;
  readonly time: number;
}

/** What a device did with a frame it received. */
export type FrameVerdict =
  /** Handed to a protocol or an application of the device. */
  | 'accepted'
  /** Relayed to another network (routers). */
  | 'forwarded'
  /** Not meant for this device, or nobody listens: nothing happens. */
  | 'ignored'
  /** Refused by the firewall. */
  | 'filtered';
