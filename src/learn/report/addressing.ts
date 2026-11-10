import { IP_ANY, formatIp } from '../../engine/core/ipv4';
import { Box } from '../../engine/devices/box';
import type { DeviceKind } from '../../engine/devices/device';
import { Host } from '../../engine/devices/host';
import { Router } from '../../engine/devices/router';
import type { Network } from '../../engine/network';
import type { Port } from '../../engine/net/link';
import { interfaceLabel } from '../../i18n/fr';

/* The addressing table of a network: what a pupil is usually asked to fill in
 * by hand at the end of a practical. Built from the design, for the report. */

export interface AddressRow {
  readonly deviceId: string;
  readonly name: string;
  readonly kind: DeviceKind;
  /** Name of the interface for a router (« eth0 ») or a box (« Maison »), empty otherwise. */
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
    // Seen from the terminal: the network it joined. Seen from the access point: who joined.
    return other && 'ssid' in other && typeof other.ssid === 'string'
      ? `Wi-Fi « ${other.ssid} » (${other.name})`
      : `${other?.name ?? '?'} (Wi-Fi)`;
  }
  return other?.name ?? '?';
}

function linksOf(network: Network, ports: readonly Port[]): string {
  const linked = ports.filter((p) => p.isConnected).map((p) => linkOf(network, p));
  return linked.length === 0 ? 'non relié' : linked.join(', ');
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
          iface: interfaceLabel(device.kind, index),
          link: linkOf(network, iface.port),
          mode: 'fixe',
          ip: address(iface.ip),
          mask: address(iface.mask),
          gateway: '',
          dns: '',
        });
      });
    } else if (device instanceof Box) {
      rows.push({
        ...base,
        iface: interfaceLabel(device.kind, 0),
        link: linkOf(network, device.wanPort),
        mode: 'fixe',
        ip: address(device.wan.ip),
        mask: address(device.wan.mask),
        gateway: address(device.gateway),
        dns: '',
      });
      rows.push({
        ...base,
        iface: interfaceLabel(device.kind, 1),
        link: linksOf(network, device.homePorts),
        mode: 'fixe',
        ip: address(device.lan.ip),
        mask: address(device.lan.mask),
        gateway: '',
        dns: '',
      });
    } else {
      rows.push({
        ...base,
        iface: '',
        link: linksOf(network, device.ports),
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
