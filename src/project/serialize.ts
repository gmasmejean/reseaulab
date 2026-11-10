import { Box } from '../engine/devices/box';
import { isHostKind } from '../engine/devices/device';
import { formatIp, parseIp, type Ipv4 } from '../engine/core/ipv4';
import { Host } from '../engine/devices/host';
import { Router } from '../engine/devices/router';
import { Switch } from '../engine/devices/switch';
import { Network } from '../engine/network';
import type { Firewall } from '../engine/stack/firewall';
import {
  MAX_PROJECT_SIZE,
  PROJECT_FORMAT,
  PROJECT_VERSION,
  projectSchema,
  type BoxJson,
  type FirewallJson,
  type HostJson,
  type ProjectFile,
  type RouterJson,
} from './schema';

export class ProjectError extends Error {}

/** Values were validated by the schema, so parsing cannot fail here. */
function toIp(text: string): Ipv4 {
  const value = parseIp(text);
  if (value === null) throw new ProjectError(`Adresse invalide : ${text}`);
  return value;
}

function firewallToJson(firewall: Firewall): FirewallJson {
  return {
    enabled: firewall.enabled,
    rules: firewall.rules.map((r) => ({
      ...r,
      source: formatIp(r.source),
      sourceMask: formatIp(r.sourceMask),
      destination: formatIp(r.destination),
      destinationMask: formatIp(r.destinationMask),
    })),
  };
}

function loadFirewall(firewall: Firewall, json: FirewallJson): void {
  firewall.enabled = json.enabled;
  firewall.rules = json.rules.map((r) => ({
    ...r,
    source: toIp(r.source),
    sourceMask: toIp(r.sourceMask),
    destination: toIp(r.destination),
    destinationMask: toIp(r.destinationMask),
  }));
}

function hostToJson(host: Host): HostJson {
  const c = host.config;
  const dhcp = host.dhcpServer.config;
  return {
    id: host.id,
    kind: isHostKind(host.kind) ? host.kind : 'computer',
    name: host.name,
    x: host.position.x,
    y: host.position.y,
    mac: host.mac,
    showIpAsName: host.showIpAsName,
    wifi: host.wifi,
    config: {
      ip: formatIp(c.ip),
      mask: formatIp(c.mask),
      gateway: formatIp(c.gateway),
      dns: formatIp(c.dns),
      useDhcp: c.useDhcp,
    },
    installed: [...host.installed],
    fs: host.fs.toJSON(),
    firewall: firewallToJson(host.firewall),
    dhcpServer: {
      active: host.dhcpServer.active,
      rangeStart: formatIp(dhcp.rangeStart),
      rangeEnd: formatIp(dhcp.rangeEnd),
      gateway: formatIp(dhcp.gateway),
      dns: formatIp(dhcp.dns),
      reservations: dhcp.reservations.map((r) => ({ mac: r.mac, ip: formatIp(r.ip) })),
    },
    dnsServer: {
      active: host.dnsServer.active,
      recursion: host.dnsServer.config.recursion,
      records: host.dnsServer.config.records.map((r) => ({ ...r })),
    },
    webServer: { active: host.webServer.active },
    echoServer: { active: host.echoServer.active, port: host.echoServer.port },
    mailServer: {
      active: host.mailServer.active,
      domain: host.mailServer.config.domain,
      accounts: host.mailServer.config.accounts.map((a) => ({
        user: a.user,
        password: a.password,
        mailbox: a.mailbox.map((m) => ({ ...m, to: [...m.to], cc: [...m.cc] })),
      })),
    },
    mailClient: {
      account: { ...host.mailClient.account },
      inbox: host.mailClient.inbox.map((m) => ({ ...m, to: [...m.to], cc: [...m.cc] })),
      sent: host.mailClient.sent.map((m) => ({ ...m, to: [...m.to], cc: [...m.cc] })),
    },
  };
}

function routerToJson(router: Router): RouterJson {
  return {
    id: router.id,
    kind: 'router',
    name: router.name,
    x: router.position.x,
    y: router.position.y,
    interfaces: router.interfaces.map((i) => ({
      mac: i.port.mac,
      ip: formatIp(i.ip),
      mask: formatIp(i.mask),
    })),
    routes: router.staticRoutes.map((r) => ({
      destination: formatIp(r.destination),
      mask: formatIp(r.mask),
      gateway: formatIp(r.gateway),
      iface: r.iface,
    })),
    rip: router.rip,
    firewall: firewallToJson(router.firewall),
  };
}

function boxToJson(box: Box): BoxJson {
  const dhcp = box.dhcp.config;
  return {
    id: box.id,
    kind: 'box',
    name: box.name,
    x: box.position.x,
    y: box.position.y,
    ssid: box.ssid,
    wan: {
      mac: box.wan.port.mac,
      ip: formatIp(box.wan.ip),
      mask: formatIp(box.wan.mask),
      gateway: formatIp(box.gateway),
    },
    lan: { mac: box.lan.port.mac, ip: formatIp(box.lan.ip), mask: formatIp(box.lan.mask) },
    dhcp: {
      active: box.dhcp.active,
      rangeStart: formatIp(dhcp.rangeStart),
      rangeEnd: formatIp(dhcp.rangeEnd),
      dns: formatIp(dhcp.dns),
    },
    rip: box.rip,
  };
}

function loadBox(network: Network, json: BoxJson): void {
  const problem = network.ssidProblem(json.ssid);
  if (problem) throw new ProjectError(`Box « ${json.name} » : ${problem}`);
  const box = network.addBox({
    id: json.id,
    name: json.name,
    position: { x: json.x, y: json.y },
    ssid: json.ssid,
    macs: { wan: json.wan.mac, lan: json.lan.mac },
  });
  box.setWan({ ip: toIp(json.wan.ip), mask: toIp(json.wan.mask) });
  box.setGateway(toIp(json.wan.gateway));
  box.setLan({ ip: toIp(json.lan.ip), mask: toIp(json.lan.mask) });
  box.dhcp.updateConfig({
    rangeStart: toIp(json.dhcp.rangeStart),
    rangeEnd: toIp(json.dhcp.rangeEnd),
    dns: toIp(json.dhcp.dns),
  });
  box.dhcp.setActive(json.dhcp.active);
  box.rip = json.rip;
}

/** Builds the project file of a network (always from its design state). */
export function toProject(network: Network): ProjectFile {
  const devices = network.devices.map((device) => {
    if (device instanceof Host) return hostToJson(device);
    if (device instanceof Router) return routerToJson(device);
    if (device instanceof Box) return boxToJson(device);
    return {
      id: device.id,
      kind: 'switch' as const,
      name: device.name,
      x: device.position.x,
      y: device.position.y,
      ports: device.ports.length,
      ssid: device instanceof Switch ? device.ssid : undefined,
    };
  });
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    devices,
    cables: network.cables.map((c) => ({ ...c })),
    // Fields in a fixed order: saving a file that was just opened gives the same text.
    notes: network.notes.map((n) => ({
      id: n.id,
      kind: n.kind,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      text: n.text,
      color: n.color,
      fontSize: n.fontSize,
      bold: n.bold,
      italic: n.italic,
    })),
  };
}

function loadHost(network: Network, json: HostJson): void {
  const host = network.addHost(json.kind, {
    id: json.id,
    name: json.name,
    position: { x: json.x, y: json.y },
    mac: json.mac,
    config: {
      ip: toIp(json.config.ip),
      mask: toIp(json.config.mask),
      gateway: toIp(json.config.gateway),
      dns: toIp(json.config.dns),
      useDhcp: json.config.useDhcp,
    },
  });
  host.showIpAsName = json.showIpAsName;
  host.wifi = json.wifi;
  host.setInstalled(json.installed);
  host.fs.load(json.fs);
  loadFirewall(host.firewall, json.firewall);
  const d = json.dhcpServer;
  host.dhcpServer.updateConfig({
    rangeStart: toIp(d.rangeStart),
    rangeEnd: toIp(d.rangeEnd),
    gateway: toIp(d.gateway),
    dns: toIp(d.dns),
    reservations: d.reservations.map((r) => ({ mac: r.mac, ip: toIp(r.ip) })),
  });
  host.dhcpServer.setActive(d.active);
  host.dnsServer.updateConfig({ records: json.dnsServer.records, recursion: json.dnsServer.recursion });
  host.dnsServer.setActive(json.dnsServer.active);
  host.webServer.setActive(json.webServer.active);
  host.echoServer.setPort(json.echoServer.port);
  host.echoServer.setActive(json.echoServer.active);
  host.mailServer.updateConfig({
    domain: json.mailServer.domain,
    accounts: json.mailServer.accounts.map((a) => ({ ...a, mailbox: [...a.mailbox] })),
  });
  host.mailServer.setActive(json.mailServer.active);
  host.mailClient.updateAccount(json.mailClient.account);
  host.mailClient.inbox = [...json.mailClient.inbox];
  host.mailClient.sent = [...json.mailClient.sent];
}

function loadRouter(network: Network, json: RouterJson): void {
  const router = network.addRouter({
    id: json.id,
    name: json.name,
    position: { x: json.x, y: json.y },
    macs: json.interfaces.map((i) => i.mac),
  });
  json.interfaces.forEach((i, index) => {
    router.setInterface(index, { ip: toIp(i.ip), mask: toIp(i.mask) });
  });
  if (json.routes.some((r) => r.iface >= json.interfaces.length)) {
    throw new ProjectError(`Route vers une interface inexistante sur « ${json.name} »`);
  }
  router.setStaticRoutes(
    json.routes.map((r) => ({
      destination: toIp(r.destination),
      mask: toIp(r.mask),
      gateway: toIp(r.gateway),
      iface: r.iface,
    })),
  );
  router.rip = json.rip;
  loadFirewall(router.firewall, json.firewall);
}

/** Builds a network from validated project data. Throws ProjectError on inconsistencies. */
export function fromProject(project: ProjectFile): Network {
  const network = new Network();
  const ids = new Set<string>();
  const macs = new Set<string>();
  for (const device of project.devices) {
    if (ids.has(device.id)) throw new ProjectError(`Identifiant en double : ${device.id}`);
    ids.add(device.id);
    const deviceMacs =
      device.kind === 'switch'
        ? []
        : device.kind === 'router'
          ? device.interfaces.map((i) => i.mac)
          : device.kind === 'box'
            ? [device.wan.mac, device.lan.mac]
            : [device.mac];
    for (const mac of deviceMacs) {
      if (macs.has(mac)) throw new ProjectError(`Adresse MAC en double : ${mac}`);
      macs.add(mac);
    }
    if (device.kind === 'switch') {
      if (device.ssid !== undefined) {
        const problem = network.ssidProblem(device.ssid);
        if (problem) throw new ProjectError(`Switch « ${device.name} » : ${problem}`);
      }
      network.addSwitch({
        id: device.id,
        name: device.name,
        position: { x: device.x, y: device.y },
        ports: device.ports,
        ...(device.ssid === undefined ? {} : { ssid: device.ssid }),
      });
    } else if (device.kind === 'router') {
      loadRouter(network, device);
    } else if (device.kind === 'box') {
      loadBox(network, device);
    } else {
      loadHost(network, device);
    }
  }
  for (const note of project.notes) {
    if (ids.has(note.id)) throw new ProjectError(`Identifiant en double : ${note.id}`);
    ids.add(note.id);
    network.addNote(note);
  }
  for (const cable of project.cables) {
    if (ids.has(cable.id)) throw new ProjectError(`Identifiant en double : ${cable.id}`);
    ids.add(cable.id);
    try {
      network.connect(cable.a, cable.b, {
        id: cable.id,
        portA: cable.portA,
        portB: cable.portB,
        wireless: cable.wireless,
      });
    } catch (error) {
      throw new ProjectError(
        `Câble ${cable.id} invalide : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return network;
}

export function serializeProject(network: Network): string {
  return JSON.stringify(toProject(network), null, 2);
}

/** Parses and validates a project file. Never returns a partially loaded network. */
export function parseProject(text: string): Network {
  if (text.length > MAX_PROJECT_SIZE) throw new ProjectError('Fichier trop volumineux');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectError('Ce fichier n’est pas un projet RéseauLab (JSON illisible).');
  }
  return validateProject(data);
}

/** Validates raw project data and builds the network. */
export function validateProject(data: unknown): Network {
  const result = projectSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.join('.') ?? '';
    throw new ProjectError(
      `Projet invalide${where ? ` (${where})` : ''} : ${issue?.message ?? 'format inconnu'}`,
    );
  }
  return fromProject(result.data);
}
