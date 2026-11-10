import type { Ipv4 } from '../../engine/core/ipv4';
import { Host } from '../../engine/devices/host';
import { NetworkNode } from '../../engine/devices/node';
import { Switch } from '../../engine/devices/switch';
import type { Network } from '../../engine/network';

/* Physical structure of a network, read from its cables: which interfaces can
 * exchange frames directly (they share switches), and whether switches form a
 * loop. Nothing is simulated here. */

/** One network card: the interface `iface` of a computer or a router. */
export interface Attachment {
  readonly deviceId: string;
  readonly iface: number;
  /** Address set by hand (IP_ANY when none, or when the host uses DHCP). */
  readonly ip: Ipv4;
  readonly mask: Ipv4;
  /** The address is obtained from a DHCP server during the simulation. */
  readonly dynamic: boolean;
}

/**
 * A broadcast domain: the network cards that reach each other without a
 * router, through cables, Wi-Fi links and switches.
 */
export interface Segment {
  readonly switches: readonly string[];
  readonly members: readonly Attachment[];
}

/** Disjoint sets of keys (union-find). */
class Groups {
  private readonly parent = new Map<string, string>();

  find(key: string): string {
    let root = key;
    for (;;) {
      const up = this.parent.get(root);
      if (up === undefined || up === root) break;
      root = up;
    }
    this.parent.set(key, root);
    return root;
  }

  /** Joins two groups; false when they were already one. */
  join(a: string, b: string): boolean {
    const [ra, rb] = [this.find(a), this.find(b)];
    if (ra === rb) return false;
    this.parent.set(ra, rb);
    return true;
  }
}

/** Design-time addressing of every network card. */
export function attachments(network: Network): Attachment[] {
  const result: Attachment[] = [];
  for (const device of network.devices) {
    if (device instanceof Host) {
      const c = device.config;
      result.push({
        deviceId: device.id,
        iface: 0,
        ip: c.useDhcp ? 0 : c.ip,
        mask: c.useDhcp ? 0 : c.mask,
        dynamic: c.useDhcp,
      });
    } else if (device instanceof NetworkNode) {
      device.stack.interfaces.forEach((iface, index) => {
        result.push({ deviceId: device.id, iface: index, ip: iface.ip, mask: iface.mask, dynamic: false });
      });
    }
  }
  return result;
}

const cardKey = (deviceId: string, iface: number) => `${deviceId}#${iface}`;

/** Broadcast domains of the network. A card without cable is alone in its segment. */
export function segments(network: Network): Segment[] {
  const groups = new Groups();
  const key = (deviceId: string, port: number) =>
    network.device(deviceId) instanceof Switch ? deviceId : cardKey(deviceId, port);
  for (const cable of network.cables) groups.join(key(cable.a, cable.portA), key(cable.b, cable.portB));

  const bySegment = new Map<string, { switches: string[]; members: Attachment[] }>();
  const segment = (root: string) => {
    let found = bySegment.get(root);
    if (!found) bySegment.set(root, (found = { switches: [], members: [] }));
    return found;
  };
  for (const card of attachments(network))
    segment(groups.find(cardKey(card.deviceId, card.iface))).members.push(card);
  for (const sw of network.switches) segment(groups.find(sw.id)).switches.push(sw.id);
  return [...bySegment.values()];
}

/** The segment a network card belongs to. */
export function segmentOf(all: readonly Segment[], deviceId: string, iface = 0): Segment | undefined {
  return all.find((s) => s.members.some((m) => m.deviceId === deviceId && m.iface === iface));
}

/**
 * Switches cabled in a loop (two cables between the same switches included).
 * Without spanning tree, a broadcast would go round for ever. Empty when the
 * network has no loop.
 */
export function switchLoop(network: Network): string[] {
  const groups = new Groups();
  const looped = new Set<string>();
  for (const cable of network.cables) {
    const [a, b] = [network.device(cable.a), network.device(cable.b)];
    if (!(a instanceof Switch) || !(b instanceof Switch)) continue;
    if (!groups.join(a.id, b.id)) {
      looped.add(a.id);
      looped.add(b.id);
    }
  }
  return [...looped];
}
