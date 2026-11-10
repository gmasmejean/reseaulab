import { IP_ANY, formatCidr, formatIp, networkOf } from '../../engine/core/ipv4';
import type { Device } from '../../engine/devices/device';
import { Box } from '../../engine/devices/box';
import { Host } from '../../engine/devices/host';
import { Router } from '../../engine/devices/router';
import { Switch } from '../../engine/devices/switch';
import type { Network } from '../../engine/network';
import type { AppId } from '../../engine/services/catalog';
import { APP_INFO, DEVICE_LABEL } from '../../i18n/fr';
import { lintNetwork } from '../diagnose/lint';
import { segments } from '../diagnose/topology';
import { tracePath } from '../diagnose/trace';
import { cloneNetwork } from '../../project/clone';
import type { Check, DeviceRef } from './schema';

/* Help for the teacher who writes an activity: from the network they built
 * as the solution, RéseauLab proposes objectives that this network reaches.
 * The teacher keeps those that matter and rewords them. */

export interface Suggestion {
  /** Sentence proposed to the pupil; the teacher can change it. */
  readonly label: string;
  readonly check: Check;
}

const SERVER_APPS: readonly AppId[] = ['webserver', 'dnsserver', 'dhcpserver', 'mailserver', 'echoserver'];
/** Communications proposed at most: enough to choose from, not a list of every pair. */
const MAX_PINGS = 6;

const ref = (device: Device) => ({ by: 'id', id: device.id, label: device.name }) as const;
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/** Objectives the given network reaches, from the most basic to the most telling. */
export function suggestObjectives(network: Network): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const add = (label: string, check: Check) => {
    suggestions.push({ label, check });
  };
  const devices = network.devices;
  const hosts = devices.filter((d): d is Host => d instanceof Host);
  const routers = devices.filter((d): d is Router => d instanceof Router);

  // What is on the plan.
  const kinds = [...new Set(devices.map((d) => d.kind))];
  for (const kind of kinds) {
    const count = devices.filter((d) => d.kind === kind).length;
    add(`Le plan contient ${plural(count, DEVICE_LABEL[kind].toLowerCase())}`, {
      type: 'deviceCount',
      kind,
      min: count,
    });
  }

  // How it is linked: each computer or router to the switch (or device) it is plugged into.
  for (const cable of network.cables) {
    const [a, b] = [network.device(cable.a), network.device(cable.b)];
    if (!a || !b) continue;
    const [first, second] = a instanceof Switch ? [b, a] : [a, b];
    add(`${first.name} est relié à ${second.name}`, { type: 'linked', a: ref(first), b: ref(second) });
  }

  // Addressing.
  for (const host of hosts) {
    const c = host.config;
    if (c.useDhcp) {
      add(`${host.name} est en configuration automatique (DHCP)`, {
        type: 'config',
        device: ref(host),
        field: 'dhcp',
        isSet: true,
      });
      continue;
    }
    if (c.ip === IP_ANY || c.mask === IP_ANY) continue;
    const network24 = formatCidr(networkOf(c.ip, c.mask), c.mask);
    add(`${host.name} a une adresse du réseau ${network24.split('/')[0] ?? ''}`, {
      type: 'config',
      device: ref(host),
      field: 'ip',
      inNetwork: network24,
    });
    if (c.gateway !== IP_ANY) {
      add(`${host.name} a une passerelle`, {
        type: 'config',
        device: ref(host),
        field: 'gateway',
        isSet: true,
      });
    }
    if (c.dns !== IP_ANY) {
      add(`${host.name} connaît son serveur DNS`, {
        type: 'config',
        device: ref(host),
        field: 'dns',
        isSet: true,
      });
    }
  }
  for (const router of routers) {
    for (const iface of router.interfaces) {
      if (iface.ip === IP_ANY || iface.mask === IP_ANY) continue;
      const cidr = formatCidr(networkOf(iface.ip, iface.mask), iface.mask);
      add(`${router.name} a une interface dans le réseau ${cidr.split('/')[0] ?? ''}`, {
        type: 'routerInterface',
        device: ref(router),
        inNetwork: cidr,
      });
    }
  }

  // Services.
  for (const host of hosts) {
    for (const app of SERVER_APPS) {
      if (host.isInstalled(app) && host.serverFor(app)?.active) {
        add(`Le logiciel « ${APP_INFO[app].name} » est démarré sur ${host.name}`, {
          type: 'serviceRunning',
          device: ref(host),
          app,
        });
      }
    }
  }

  if (
    lintNetwork(network).every((f) => f.severity !== 'error' && f.severity !== 'warning') &&
    devices.length > 0
  ) {
    add('Le bouton Vérifier ne signale plus rien', { type: 'lintClean', ignore: [] });
  }

  // Communications that work: inside a network first, then from one network to another.
  const pairs = communicationPairs(network, hosts);
  for (const [from, to] of pairs.slice(0, MAX_PINGS)) {
    add(`${from.name} communique avec ${to.name}`, {
      type: 'ping',
      from: ref(from),
      to: ref(to),
      expect: 'reply',
    });
  }
  const [client] = pairs[0] ?? [];
  if (client) {
    for (const server of hosts.filter((h) => h.isInstalled('dnsserver') && h.dnsServer.active)) {
      const record = server.dnsServer.config.records.find((r) => r.type === 'A');
      const asker = hosts.find((h) => h !== server && (h.config.useDhcp || h.config.dns !== IP_ANY));
      if (record && asker && tracePath(network, asker.id, { kind: 'text', text: record.name }).ok) {
        add(`${asker.name} obtient l’adresse de ${record.name}`, {
          type: 'resolves',
          from: ref(asker),
          name: record.name,
        });
      }
    }
    for (const server of hosts.filter((h) => h.isInstalled('webserver') && h.webServer.active)) {
      const visitor = pairs.find(([, to]) => to === server)?.[0];
      if (visitor && server.config.ip !== IP_ANY) {
        add(`${visitor.name} affiche la page web de ${server.name}`, {
          type: 'httpGet',
          from: ref(visitor),
          url: `http://${formatIp(server.config.ip)}/`,
        });
      }
    }
    add(`La commande ping a été utilisée sur ${client.name}`, {
      type: 'commandRan',
      command: 'ping',
      device: ref(client),
    });
    add('La simulation a été lancée', { type: 'simulationStarted' });
  }
  return suggestions;
}

/**
 * Pairs of terminals that do communicate in this network: the first two of
 * each segment, then the first of each segment with the first of the next.
 */
function communicationPairs(network: Network, hosts: readonly Host[]): [Host, Host][] {
  const bySegment = segments(network)
    .map((s) => hosts.filter((h) => s.members.some((m) => m.deviceId === h.id)))
    .filter((group) => group.length > 0);
  const candidates: [Host, Host][] = [];
  for (const group of bySegment) {
    const [a, b] = group;
    if (a && b) candidates.push([a, b]);
  }
  bySegment.forEach((group, index) => {
    const next = bySegment[(index + 1) % bySegment.length];
    const [a] = group;
    const [b] = next ?? [];
    if (a && b && a !== b && !candidates.some(([x, y]) => x === a && y === b)) candidates.push([a, b]);
  });
  return candidates.filter(([from, to]) => tracePath(network, from.id, { kind: 'device', id: to.id }).ok);
}

export type StartMode =
  /** The network as it is: for a troubleshooting activity, after breaking it. */
  | 'as-is'
  /** Devices and cables kept, addresses and gateways removed. */
  | 'no-addresses'
  /** Nothing: the pupil builds everything. */
  | 'empty';

export const START_LABEL: Record<StartMode, string> = {
  'as-is': 'Le réseau tel qu’il est maintenant',
  'no-addresses': 'Le même réseau, sans les adresses',
  empty: 'Un plan vide : l’élève construit tout',
};

/** The network pupils start from, as a copy: the teacher's network is left untouched. */
export function startingNetwork(network: Network, mode: StartMode): Network {
  const copy = cloneNetwork(network);
  if (mode === 'empty') {
    for (const device of copy.devices) copy.removeDevice(device.id);
    for (const note of copy.notes) copy.removeNote(note.id);
    return copy;
  }
  if (mode === 'no-addresses') {
    for (const device of copy.devices) {
      if (device instanceof Host && !device.config.useDhcp) {
        device.updateConfig({ ip: IP_ANY, mask: IP_ANY, gateway: IP_ANY, dns: IP_ANY });
      } else if (device instanceof Router) {
        device.interfaces.forEach((_, index) => {
          device.setInterface(index, { ip: IP_ANY, mask: IP_ANY });
        });
      } else if (device instanceof Box) {
        // The home side keeps the addressing a box has out of its carton.
        device.setWan({ ip: IP_ANY, mask: IP_ANY });
        device.setGateway(IP_ANY);
      }
    }
  }
  return copy;
}

/**
 * On an empty plan no device of the solution exists any more: references by
 * identifier become references by name, which pupils satisfy by naming their
 * devices as asked.
 */
export function referByName(check: Check): Check {
  const convert = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(convert);
    if (typeof value !== 'object' || value === null) return value;
    const record = value as Record<string, unknown>;
    if (record.by === 'id' && typeof record.label === 'string') {
      return { by: 'name', name: record.label } satisfies DeviceRef;
    }
    return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, convert(child)]));
  };
  return convert(check) as Check;
}
