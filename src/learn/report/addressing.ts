import { IP_ANY, formatIp } from '../../engine/core/ipv4';
import type { DeviceKind } from '../../engine/devices/device';
import { Host } from '../../engine/devices/host';
import { Router } from '../../engine/devices/router';
import { Switch } from '../../engine/devices/switch';
import type { Network } from '../../engine/network';
import type { Port } from '../../engine/net/link';

/* The addressing table of a network: what a pupil is usually asked to fill in
 * by hand at the end of a practical. Built from the design, for the report. */

export interface AddressRow {
  readonly deviceId: string;
  readonly name: string;
  readonly kind: DeviceKind;
  /** Name of the interface for a router (« eth0 »), empty otherwise. */
  readonly iface: string;
  /** What the interface is linked to, in words. */
  readonly link: string;
  /** « fixe », « automatique (DHCP) » or empty for a switch. */
  readonly mode: string;
  /** Addresses as text; empty when not set (or not applicable). */
  readonly ip: string;
  readonly mask: string;
  readonly gateway: string;
  readonly dns: string;
}

const address = (ip: number) => (ip === IP_ANY ? '' : formatIp(ip));

function linkOf(network: Network, port: Port | undefined): string {
  const cable = port?.cable;
  if (!port || !cable) return 'non relié';
  const other = network.device(cable.other(port).owner.id);
  if (cable.wireless) {
    const ap = other instanceof Switch ? other : null;
    return `Wi-Fi « ${ap?.ssid ?? ''} » (${other?.name ?? '?'})`;
  }
  return other?.name ?? '?';
}

/** One row per network card, in the order of the plan; switches come with their links. */
export function addressingTable(network: Network): AddressRow[] {
  const rows: AddressRow[] = [];
  for (const device of network.devices) {
    const base = { deviceId: device.id, name: device.name, kind: device.kind };
    if (device instanceof Host) {
      const c = device.config;
      const fixed = !c.useDhcp;
      rows.push({
        ...base,
        iface: '',
        link: linkOf(network, device.iface.port),
        mode: fixed ? 'fixe' : 'automatique (DHCP)',
        ip: fixed ? address(c.ip) : '',
        mask: fixed ? address(c.mask) : '',
        gateway: fixed ? address(c.gateway) : '',
        dns: fixed ? address(c.dns) : '',
      });
    } else if (device instanceof Router) {
      device.interfaces.forEach((iface, index) => {
        rows.push({
          ...base,
          iface: `eth${index}`,
          link: linkOf(network, iface.port),
          mode: 'fixe',
          ip: address(iface.ip),
          mask: address(iface.mask),
          gateway: '',
          dns: '',
        });
      });
    } else {
      const linked = device.ports.filter((p) => p.isConnected).map((p) => linkOf(network, p));
      rows.push({
        ...base,
        iface: '',
        link: linked.length === 0 ? 'non relié' : linked.join(', '),
        mode: '',
        ip: '',
        mask: '',
        gateway: '',
        dns: '',
      });
    }
  }
  return rows;
}
