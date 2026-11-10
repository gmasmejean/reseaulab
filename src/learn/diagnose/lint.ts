import {
  IP_ANY,
  formatCidr,
  formatIp,
  isUsableHostAddress,
  networkOf,
  sameNetwork,
} from '../../engine/core/ipv4';
import { Host } from '../../engine/devices/host';
import { Router } from '../../engine/devices/router';
import type { Network } from '../../engine/network';
import type { AppId } from '../../engine/services/catalog';
import { APP_INFO } from '../../i18n/fr';
import type { Finding, LintCode, Severity } from './findings';
import { attachments, segmentOf, segments, switchLoop, type Attachment, type Segment } from './topology';

/* Checks the design of a network without simulating it: the mistakes pupils
 * make most often (no address, same address twice, wrong gateway, no cable…).
 * Rules depend on the context so that the list stays short: a missing gateway
 * is only reported where there is a router to go through. */

const SERVER_APPS: readonly AppId[] = ['webserver', 'dnsserver', 'dhcpserver', 'mailserver', 'echoserver'];

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function hasDhcpServer(network: Network, segment: Segment | undefined): boolean {
  return (segment?.members ?? []).some((m) => {
    const device = network.device(m.deviceId);
    return device instanceof Host && device.isInstalled('dhcpserver') && device.dhcpServer.active;
  });
}

export function lintNetwork(network: Network): Finding[] {
  const findings: Finding[] = [];
  const add = (
    code: LintCode,
    severity: Severity,
    deviceIds: readonly string[],
    params: Finding['params'] = {},
  ) => {
    findings.push({ code, severity, deviceIds, params });
  };
  const all = segments(network);
  const cards = attachments(network);
  const devices = network.devices;
  const hosts = devices.filter((d): d is Host => d instanceof Host);
  const routers = devices.filter((d): d is Router => d instanceof Router);

  const loop = switchLoop(network);
  if (loop.length > 0) add('switch-loop', 'error', loop);

  for (const host of hosts) {
    const c = host.config;
    const cabled = host.iface.port.isConnected;
    const segment = segmentOf(all, host.id);
    // A single device on the plan is not a network yet: nothing to cable it to.
    if (!cabled && devices.length > 1) add(host.wifi ? 'wifi-not-joined' : 'not-cabled', 'error', [host.id]);

    if (c.useDhcp) {
      if (host.isInstalled('dhcpserver')) add('dhcp-server-dynamic', 'error', [host.id]);
      else if (cabled && !hasDhcpServer(network, segment)) add('dhcp-no-server', 'error', [host.id]);
    } else if (c.ip === IP_ANY) {
      add('ip-missing', 'error', [host.id]);
    } else if (c.mask === IP_ANY) {
      add('mask-missing', 'error', [host.id], { ip: formatIp(c.ip) });
    } else {
      if (!isUsableHostAddress(c.ip, c.mask))
        add('ip-not-usable', 'error', [host.id], { ip: formatIp(c.ip) });
      checkGateway(host, cabled, segment);
      checkDns(host);
    }

    for (const app of SERVER_APPS) {
      if (host.isInstalled(app) && !host.serverFor(app)?.active) {
        add('server-not-started', 'warning', [host.id], { app: APP_INFO[app].name });
      }
    }
  }

  function checkGateway(host: Host, cabled: boolean, segment: Segment | undefined): void {
    const c = host.config;
    const neighbours = (segment?.members ?? []).filter((m) => m.deviceId !== host.id);
    if (c.gateway === IP_ANY) {
      const routerNearby = neighbours.some((m) => network.device(m.deviceId) instanceof Router);
      if (routerNearby) add('gateway-missing', 'warning', [host.id]);
      return;
    }
    const gateway = formatIp(c.gateway);
    if (!sameNetwork(c.ip, c.gateway, c.mask)) {
      add('gateway-outside', 'error', [host.id], { gateway, ip: formatIp(c.ip), mask: formatIp(c.mask) });
      return;
    }
    if (!cabled) return;
    const owner = neighbours.find((m) => m.ip === c.gateway);
    if (!owner) {
      // An address handed out by DHCP is only known during the simulation.
      if (!neighbours.some((m) => m.dynamic)) add('gateway-nobody', 'error', [host.id], { gateway });
    } else if (network.device(owner.deviceId) instanceof Host) {
      add('gateway-not-router', 'error', [host.id, owner.deviceId], { gateway });
    }
  }

  function checkDns(host: Host): void {
    const dns = host.config.dns;
    const servers = hosts.filter((h) => h.isInstalled('dnsserver'));
    if (dns === IP_ANY) {
      if (servers.length > 0 && !servers.includes(host)) add('dns-missing', 'info', [host.id]);
      return;
    }
    const owner = cards.find((card) => card.ip === dns);
    const device = owner ? network.device(owner.deviceId) : undefined;
    if (device instanceof Host && device.isInstalled('dnsserver')) return;
    // The address may be handed out by DHCP: nothing can be said before the simulation.
    if (!device && cards.some((card) => card.dynamic)) return;
    add('dns-no-server', 'warning', device ? [host.id, device.id] : [host.id], { dns: formatIp(dns) });
  }

  for (const router of routers) {
    const configured: { index: number; card: { ip: number; mask: number } }[] = [];
    router.interfaces.forEach((iface, index) => {
      const name = `eth${index}`;
      if (iface.ip === IP_ANY) {
        if (iface.port.isConnected) add('router-iface-unconfigured', 'error', [router.id], { iface: name });
      } else if (iface.mask === IP_ANY) {
        add('mask-missing', 'error', [router.id], { ip: formatIp(iface.ip) });
      } else {
        if (!isUsableHostAddress(iface.ip, iface.mask)) {
          add('ip-not-usable', 'error', [router.id], { ip: formatIp(iface.ip) });
        }
        configured.push({ index, card: iface });
      }
    });
    configured.forEach((first, i) => {
      for (const second of configured.slice(i + 1)) {
        if (!sameNetwork(first.card.ip, second.card.ip, first.card.mask)) continue;
        add('router-ifaces-same-network', 'error', [router.id], {
          a: `eth${first.index}`,
          b: `eth${second.index}`,
          network: formatCidr(networkOf(first.card.ip, first.card.mask), first.card.mask),
        });
      }
    });
  }

  for (const segment of all) {
    const fixed = segment.members.filter((m) => m.ip !== IP_ANY && m.mask !== IP_ANY);
    if (fixed.length < 2) continue;
    const byAddress = new Map<number, Attachment[]>();
    const byNetwork = new Map<string, Attachment[]>();
    for (const card of fixed) {
      byAddress.set(card.ip, [...(byAddress.get(card.ip) ?? []), card]);
      const net = formatCidr(networkOf(card.ip, card.mask), card.mask);
      byNetwork.set(net, [...(byNetwork.get(net) ?? []), card]);
    }
    for (const [address, sharing] of byAddress) {
      if (sharing.length > 1) {
        add('ip-duplicate', 'error', unique(sharing.map((s) => s.deviceId)), { ip: formatIp(address) });
      }
    }
    if (byNetwork.size > 1) {
      add('segment-several-networks', 'warning', unique(fixed.map((f) => f.deviceId)), {
        networks: [...byNetwork.keys()].join(' et '),
      });
    }
  }
  return findings;
}
