import { formatIp, isValidMask, networkOf, parseIp } from '../../engine/core/ipv4';
import { MacAllocator, normalizeMac } from '../../engine/core/mac';
import { isValidFileName, type FsJson } from '../../engine/fs/filesystem';
import type { AppId } from '../../engine/services/catalog';
import { Network } from '../../engine/network';
import { toProject } from '../serialize';
import type { FirewallJson, HostJson, NoteJson, ProjectFile, RouterJson, SwitchJson } from '../schema';
import { JObject, type JValue } from './decoder';

/* Conversion of a decoded Filius project into a RéseauLab project.
 *
 * XMLEncoder omits every value equal to its default, so the defaults below
 * were read from Filius' classes (NetzwerkInterface, DHCPServer, Firewall…).
 * Whatever cannot be represented is skipped and reported as a warning. */

const DEFAULT_IP = '192.168.0.10';
const DEFAULT_MASK = '255.255.255.0';
const ANY = '0.0.0.0';
/** Filius' FirewallRule.SAME_NETWORK placeholder address. */
const SAME_NETWORK = '999.999.999.999';
const DEFAULT_MAIL_DOMAIN = 'filius.de';
/** Height of the icon part of a Filius node label: centre of our icons. */
const ICON_CENTER_Y = 32;
const MIN_COORDINATE = 40;

const APPS: Readonly<Record<string, AppId | null>> = {
  'filius.software.lokal.Terminal': 'terminal',
  'filius.software.www.WebBrowser': 'browser',
  'filius.software.lokal.TextEditor': 'texteditor',
  'filius.software.lokal.FileExplorer': 'fileexplorer',
  'filius.software.lokal.ImageViewer': 'imageviewer',
  'filius.software.email.EmailAnwendung': 'mailclient',
  'filius.software.clientserver.ClientBaustein': 'echoclient',
  'filius.software.firewall.Firewall': 'firewall',
  'filius.software.www.WebServer': 'webserver',
  'filius.software.dns.DNSServer': 'dnsserver',
  'filius.software.email.EmailServer': 'mailserver',
  'filius.software.clientserver.ServerBaustein': 'echoserver',
  'filius.software.clientserver.EchoServer': 'echoserver',
};

const APP_NAMES: Readonly<Record<string, string>> = {
  'filius.software.dateiaustausch.PeerToPeerAnwendung': 'Échange de fichiers (pair à pair)',
  'filius.software.lokal.Anwendungsassistent': 'Assistant de création de logiciels',
};

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

export interface FilsConversion {
  readonly project: ProjectFile;
  readonly warnings: readonly string[];
}

interface PortRef {
  readonly device: string;
  readonly port: number;
}

function objectsOf(value: JValue | undefined): JObject[] {
  return value instanceof JObject ? value.items.filter((i): i is JObject => i instanceof JObject) : [];
}

function shortClass(object: JObject | undefined): string {
  return object?.className?.split('.').pop() ?? '';
}

function clean(text: string | undefined): string {
  return (text ?? '').trim();
}

/** Template objects with RéseauLab's own defaults for every field. */
function templates(): { computer: HostJson; router: RouterJson; switch: SwitchJson } {
  const net = new Network();
  net.addHost('computer', { id: 't1' });
  net.addRouter({ id: 't2' });
  net.addSwitch({ id: 't3' });
  const [computer, router, sw] = toProject(net).devices;
  if (computer?.kind !== 'computer' || router?.kind !== 'router' || sw?.kind !== 'switch') {
    throw new Error('Modèles de conversion indisponibles');
  }
  return { computer, router, switch: sw };
}

class Converter {
  readonly warnings: string[] = [];
  private readonly devices: (HostJson | RouterJson | SwitchJson)[] = [];
  private readonly cables: ProjectFile['cables'] = [];
  private readonly notes: NoteJson[] = [];
  private readonly ports = new Map<JObject, PortRef>();
  private readonly nodes = new Map<JObject, string>();
  private readonly macs = new MacAllocator(0x100000);
  private readonly usedMacs = new Set<string>();
  private readonly template = templates();
  private counter = 0;

  run(values: readonly JValue[]): ProjectFile {
    const lists = values.filter((v): v is JObject => v instanceof JObject);
    const items = lists.flatMap((list) => objectsOf(list));
    const byClass = (name: string) => items.filter((i) => shortClass(i) === name);
    const nodes = byClass('GUIKnotenItem');
    if (nodes.length === 0 && byClass('GUIDocuItem').length === 0) {
      throw new Error('Aucun équipement trouvé : ce fichier n’est pas un projet Filius.');
    }
    for (const node of nodes) this.node(node);
    for (const cable of byClass('GUIKabelItem')) this.cable(cable);
    for (const docu of byClass('GUIDocuItem')) this.docu(docu);
    return {
      format: 'reseaulab',
      version: 1,
      devices: this.devices,
      cables: this.cables,
      notes: this.notes,
    };
  }

  private warn(message: string): void {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  private id(prefix: string): string {
    return `${prefix}${String(++this.counter)}`;
  }

  private ip(text: string | undefined, fallback: string, where: string): string {
    const value = clean(text);
    if (value === '') return fallback;
    if (parseIp(value) !== null) return value;
    this.warn(`${where} : adresse « ${value} » invalide, remplacée par ${fallback}.`);
    return fallback;
  }

  private mask(text: string | undefined, where: string): string {
    const value = clean(text) || DEFAULT_MASK;
    const parsed = parseIp(value);
    if (parsed !== null && isValidMask(parsed)) return value;
    this.warn(`${where} : masque « ${value} » invalide, remplacé par ${DEFAULT_MASK}.`);
    return DEFAULT_MASK;
  }

  private mac(text: string | undefined): string {
    const mac = normalizeMac(text ?? '');
    if (mac && !this.usedMacs.has(mac)) {
      this.usedMacs.add(mac);
      this.macs.reserve(mac);
      return mac;
    }
    let fresh: string;
    do {
      fresh = this.macs.allocate();
    } while (this.usedMacs.has(fresh));
    this.usedMacs.add(fresh);
    return fresh;
  }

  /** Grid slot away from the devices already placed (nodes without coordinates). */
  private freePosition(): { x: number; y: number } {
    for (let i = 0; ; i++) {
      const candidate = { x: 120 + (i % 8) * 140, y: 120 + Math.floor(i / 8) * 140 };
      if (!this.devices.some((d) => Math.hypot(d.x - candidate.x, d.y - candidate.y) < 80)) return candidate;
    }
  }

  /* ---------- nodes ---------- */

  private node(item: JObject): void {
    const knoten = item.props.get('knoten');
    if (!(knoten instanceof JObject)) return;
    const label = item.child('imageLabel');
    const bounds = label.child('bounds');
    const left = bounds.number('x');
    const top = bounds.number('y');
    const position =
      left === undefined && top === undefined
        ? this.freePosition()
        : {
            x: Math.max(MIN_COORDINATE, Math.round((left ?? 0) + (bounds.number('width') ?? 0) / 2)),
            y: Math.max(MIN_COORDINATE, Math.round((top ?? 0) + ICON_CENTER_Y)),
          };
    const name = (clean(knoten.string('name')) || clean(label.string('text'))).slice(0, 64);
    const kind = shortClass(knoten);
    switch (kind) {
      case 'Rechner':
      case 'Notebook':
        this.host(knoten, kind === 'Notebook' ? 'laptop' : 'computer', name, position);
        break;
      case 'Vermittlungsrechner':
        this.router(knoten, name, position);
        break;
      case 'Switch':
        this.switchNode(knoten, name, position);
        break;
      case 'Modem':
        this.warn('Les modems ne sont pas pris en charge : ils ont été ignorés, avec leurs câbles.');
        break;
      default:
        this.warn(`Équipement inconnu ignoré : ${kind || 'sans type'}.`);
    }
    const id = this.nodes.get(knoten);
    if (id) this.nodes.set(item, id);
  }

  private register(knoten: JObject, id: string): void {
    this.nodes.set(knoten, id);
  }

  private host(
    knoten: JObject,
    kind: 'computer' | 'laptop',
    rawName: string,
    position: { x: number; y: number },
  ): void {
    const id = this.id('n');
    const name = rawName || `${kind === 'laptop' ? 'Portable' : 'Ordinateur'} ${id.slice(1)}`;
    const interfaces = objectsOf(knoten.child('netzwerkInterfaces'));
    const nic = interfaces[0] ?? knoten.child('netzwerkInterfaces').item(0);
    if (interfaces.length > 1) this.warn(`${name} : seule la première carte réseau a été importée.`);
    const os = knoten.child('systemSoftware');
    const config = {
      ip: this.ip(nic.string('ip'), DEFAULT_IP, name),
      mask: this.mask(nic.string('subnetzMaske'), name),
      gateway: this.ip(nic.string('gateway'), ANY, name),
      dns: this.ip(nic.string('dns'), ANY, name),
      useDhcp: os.boolean('DHCPKonfiguration') ?? false,
    };
    const fs = this.fileSystem(os.child('dateisystem').child('arbeitsVerzeichnis'), name);
    const host: HostJson = {
      ...structuredClone(this.template.computer),
      id,
      kind,
      name,
      x: position.x,
      y: position.y,
      mac: this.mac(nic.string('mac')),
      showIpAsName: knoten.boolean('useIPAsName') ?? false,
      config,
      fs,
    };
    const installed = new Set<AppId>();
    for (const [key, app] of os.child('installierteAnwendungen').entries) {
      const appId = APPS[key];
      if (appId === undefined) {
        this.warn(`Logiciel non pris en charge ignoré : ${APP_NAMES[key] ?? key.split('.').pop() ?? key}.`);
        continue;
      }
      if (appId === null) continue;
      installed.add(appId);
      if (app instanceof JObject) this.app(host, appId, app, fs);
    }
    const dhcp = os.child('DHCPServer');
    const dhcpActive = dhcp.boolean('aktiv') ?? false;
    if (dhcpActive) installed.add('dhcpserver');
    const ownSettings = dhcp.boolean('ownSettings') ?? false;
    host.dhcpServer = {
      active: dhcpActive,
      rangeStart: this.ip(dhcp.string('untergrenze'), ANY, `${name} (DHCP)`),
      rangeEnd: this.ip(dhcp.string('obergrenze'), ANY, `${name} (DHCP)`),
      gateway: ownSettings ? this.ip(dhcp.string('gatewayip'), ANY, `${name} (DHCP)`) : config.gateway,
      dns: ownSettings ? this.ip(dhcp.string('dnsserverip'), ANY, `${name} (DHCP)`) : config.dns,
      reservations: this.reservations(dhcp, name),
    };
    host.installed = [...installed];
    this.register(knoten, id);
    this.devices.push(host);
    const port = nic.props.get('port');
    if (port instanceof JObject) this.ports.set(port, { device: id, port: 0 });
  }

  private reservations(dhcp: JObject, name: string): HostJson['dhcpServer']['reservations'] {
    const out: HostJson['dhcpServer']['reservations'] = [];
    for (const entry of dhcp.child('staticAssignedAddresses').items) {
      if (typeof entry !== 'string') continue;
      const [mac, ip] = entry.trim().split(/\s+/);
      const normalized = normalizeMac(mac ?? '');
      if (normalized && ip && parseIp(ip) !== null) out.push({ mac: normalized, ip });
      else this.warn(`${name} : réservation DHCP « ${entry} » ignorée.`);
    }
    return out;
  }

  private app(host: HostJson, appId: AppId, app: JObject, fs: FsJson): void {
    const active = app.boolean('aktiv') ?? false;
    switch (appId) {
      case 'webserver':
        host.webServer = { active };
        break;
      case 'dnsserver':
        host.dnsServer = {
          active,
          recursion: app.boolean('recursiveResolutionEnabled') ?? false,
          records: this.dnsRecords(fs, host.name),
        };
        break;
      case 'echoserver':
        host.echoServer = { active, port: this.port(app.number('port'), host.echoServer.port) };
        break;
      case 'mailserver':
        host.mailServer = {
          active,
          domain: clean(app.string('mailDomain')) || DEFAULT_MAIL_DOMAIN,
          accounts: this.mailAccounts(fs),
        };
        break;
      case 'firewall':
        // Installed with `new Firewall()`: enabled by default, default policy DROP.
        host.firewall = this.firewall(app, app.className !== null, [host.config]);
        break;
      case 'mailclient':
        this.warn(`${host.name} : les comptes de messagerie du client ne sont pas importés.`);
        break;
      default:
        break;
    }
  }

  private port(value: number | undefined, fallback: number): number {
    return value !== undefined && Number.isInteger(value) && value >= 1 && value <= 65535 ? value : fallback;
  }

  /** Filius keeps DNS records in /dns/hosts, one "name TYPE ttl value" per line. */
  private dnsRecords(fs: FsJson, name: string): HostJson['dnsServer']['records'] {
    const dir = fs.dns;
    const file = typeof dir === 'object' ? dir.hosts : undefined;
    if (typeof file !== 'string') return [];
    const records: HostJson['dnsServer']['records'] = [];
    for (const line of file.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;
      const [domain = '', type = '', , value = ''] = parts;
      const strip = (s: string) => s.replace(/\.$/, '').toLowerCase();
      const upper = type.toUpperCase();
      if (upper === 'A' || upper === 'MX' || upper === 'NS') {
        records.push({ name: strip(domain), type: upper, value: upper === 'A' ? value : strip(value) });
      } else {
        this.warn(`${name} : enregistrement DNS de type ${type} ignoré.`);
      }
    }
    return records;
  }

  /** konten.txt: one account per line, "user;…;password;…" (Filius EmailServer). */
  private mailAccounts(fs: FsJson): HostJson['mailServer']['accounts'] {
    const file = findFile(fs, 'konten.txt');
    if (file === undefined) return [];
    return file
      .split(/\r?\n/)
      .map((line) => line.split(';'))
      .filter((parts) => clean(parts[0]) !== '')
      .map((parts) => ({ user: clean(parts[0]), password: parts[2] ?? '', mailbox: [] }));
  }

  private fileSystem(root: JObject, owner: string): FsJson {
    const walk = (node: JObject, depth: number): FsJson => {
      const out: Record<string, string | FsJson> = {};
      if (depth > 30) return out;
      for (const child of objectsOf(node)) {
        const value = child.props.get('userObject');
        if (typeof value === 'string') {
          const name = this.fileName(value, owner);
          if (name) out[name] = walk(child, depth + 1);
        } else if (value instanceof JObject) {
          const name = this.fileName(clean(value.string('name')), owner);
          if (name) out[name] = fileContent(value);
        }
      }
      return out;
    };
    return walk(root, 0);
  }

  private fileName(name: string, owner: string): string | null {
    if (isValidFileName(name) && name.length <= 64) return name;
    const fixed = name
      .replace(/[^\p{L}\p{N}._ -]/gu, '_')
      .trim()
      .slice(0, 64);
    if (fixed && isValidFileName(fixed)) {
      this.warn(`${owner} : fichier « ${name} » renommé en « ${fixed} ».`);
      return fixed;
    }
    this.warn(`${owner} : fichier « ${name} » ignoré (nom invalide).`);
    return null;
  }

  private router(knoten: JObject, rawName: string, position: { x: number; y: number }): void {
    const id = this.id('n');
    const name = rawName || `Routeur ${id.slice(1)}`;
    const list = knoten.child('netzwerkInterfaces');
    let nics = objectsOf(list);
    if (nics.length > 8) {
      this.warn(`${name} : ${String(nics.length)} interfaces, seules les 8 premières ont été importées.`);
      nics = nics.slice(0, 8);
    }
    const interfaces = nics.map((nic, i) => ({
      mac: this.mac(nic.string('mac')),
      ip: this.ip(nic.string('ip'), DEFAULT_IP, `${name} (eth${String(i)})`),
      mask: this.mask(nic.string('subnetzMaske'), `${name} (eth${String(i)})`),
    }));
    while (interfaces.length < 2) interfaces.push({ mac: this.mac(undefined), ip: ANY, mask: DEFAULT_MASK });
    nics.forEach((nic, i) => {
      const port = nic.props.get('port');
      if (port instanceof JObject) this.ports.set(port, { device: id, port: i });
    });
    const os = knoten.child('systemSoftware');
    const apps = os.child('installierteAnwendungen');
    // The router firewall is reachable both as an application and through the
    // web configuration plug-in: merge what was written on either path.
    const firewall = new JObject(null);
    const sources = [
      apps.entries.get('filius.software.firewall.Firewall'),
      apps.entry('filius.software.www.WebServer').child('plugins').entry('konfig').props.get('firewall'),
    ];
    for (const source of sources) {
      if (source instanceof JObject) for (const [k, v] of source.props) firewall.props.set(k, v);
    }
    const router: RouterJson = {
      ...structuredClone(this.template.router),
      id,
      name,
      x: position.x,
      y: position.y,
      interfaces,
      routes: this.routes(os, interfaces, name),
      rip: os.boolean('ripEnabled') ?? false,
      // Built by the router itself: disabled by default, default policy DROP.
      firewall: this.firewall(firewall, false, interfaces),
    };
    this.register(knoten, id);
    this.devices.push(router);
  }

  private routes(os: JObject, interfaces: readonly { ip: string }[], name: string): RouterJson['routes'] {
    const routes: RouterJson['routes'] = [];
    const table = os.child('weiterleitungstabelle').child('manuelleTabelle');
    for (const row of objectsOf(table)) {
      const [destination, mask, gateway, via] = row.items.map((v) => (typeof v === 'string' ? v.trim() : ''));
      if (!destination && !mask) continue;
      const iface = interfaces.findIndex((i) => i.ip === via);
      const d = parseIp(destination ?? '');
      const m = parseIp(mask ?? '');
      if (d === null || m === null || !isValidMask(m) || iface < 0) {
        this.warn(`${name} : route « ${[destination, mask, gateway, via].join(' ')} » ignorée.`);
        continue;
      }
      routes.push({
        destination: formatIp(networkOf(d, m)),
        mask: formatIp(m),
        gateway: this.ip(gateway, ANY, name),
        iface,
      });
    }
    return routes;
  }

  private firewall(
    fw: JObject,
    enabledByDefault: boolean,
    networks: readonly { ip: string; mask: string }[],
  ): FirewallJson {
    type Rule = FirewallJson['rules'][number];
    const enabled = fw.boolean('activated') ?? enabledByDefault;
    const ruleset = objectsOf(fw.child('ruleset'));
    if (!enabled && ruleset.length === 0 && fw.number('defaultPolicy') !== 1) return { enabled, rules: [] };
    const any = { source: ANY, sourceMask: ANY, destination: ANY, destinationMask: ANY, port: 0 };
    const rules: Rule[] = [];
    // Filius lets ICMP through unless "drop ICMP" is ticked, and only filters
    // UDP when asked to: our firewall compares everything, so say it explicitly.
    rules.push({ ...any, action: fw.boolean('dropICMP') ? 'drop' : 'accept', protocol: 'icmp' });
    if (fw.boolean('filterUdp') === false) rules.push({ ...any, action: 'accept', protocol: 'udp' });
    const ownNetworks = networks.flatMap((n) => {
      const ip = parseIp(n.ip);
      const mask = parseIp(n.mask);
      return ip !== null && mask !== null && ip !== 0
        ? [{ address: formatIp(networkOf(ip, mask)), mask: n.mask }]
        : [];
    });
    const endpoints = (ip: string | undefined, mask: string | undefined) => {
      const address = clean(ip);
      if (address === '') return [{ address: ANY, mask: ANY }];
      if (address === SAME_NETWORK) return ownNetworks;
      const parsedMask = parseIp(clean(mask) || '255.255.255.255');
      if (parseIp(address) === null || parsedMask === null || !isValidMask(parsedMask)) return null;
      return [{ address, mask: formatIp(parsedMask) }];
    };
    for (const rule of ruleset) {
      const sources = endpoints(rule.string('srcIP'), rule.string('srcMask'));
      const destinations = endpoints(rule.string('destIP'), rule.string('destMask'));
      if (!sources || !destinations) {
        this.warn('Une règle de pare-feu à l’adresse invalide a été ignorée.');
        continue;
      }
      const protocolCode = rule.number('protocol');
      const protocol: Rule['protocol'] =
        protocolCode === 6 ? 'tcp' : protocolCode === 17 ? 'udp' : protocolCode === 1 ? 'icmp' : 'any';
      const port = rule.number('port') ?? -1;
      for (const s of sources) {
        for (const d of destinations) {
          rules.push({
            action: rule.number('action') === 1 ? 'accept' : 'drop',
            protocol,
            source: s.address,
            sourceMask: s.mask,
            destination: d.address,
            destinationMask: d.mask,
            port: port > 0 && port <= 65535 ? port : 0,
          });
        }
      }
    }
    if (fw.number('defaultPolicy') === 1) rules.push({ ...any, action: 'accept', protocol: 'any' });
    if (rules.length > 200) this.warn('Pare-feu : seules les 200 premières règles ont été importées.');
    return { enabled, rules: rules.slice(0, 200) };
  }

  private switchNode(knoten: JObject, rawName: string, position: { x: number; y: number }): void {
    const id = this.id('n');
    const name = rawName || `Switch ${id.slice(1)}`;
    const ports = knoten.child('anschluesse').items;
    ports.forEach((port, i) => {
      if (port instanceof JObject && i < 256) this.ports.set(port, { device: id, port: i });
    });
    this.register(knoten, id);
    this.devices.push({
      ...this.template.switch,
      id,
      name,
      x: position.x,
      y: position.y,
      ports: Math.min(256, Math.max(this.template.switch.ports, ports.length)),
    });
  }

  /* ---------- cables and documentation ---------- */

  private cable(item: JObject): void {
    const ends = item.child('dasKabel').child('anschluesse').items;
    const [a, b] = ends.map((p) => (p instanceof JObject ? this.ports.get(p) : undefined));
    if (!a || !b) {
      this.warn('Un câble relié à un équipement non importé a été ignoré.');
      return;
    }
    const taken = (ref: PortRef) =>
      this.cables.some(
        (c) => (c.a === ref.device && c.portA === ref.port) || (c.b === ref.device && c.portB === ref.port),
      );
    if (a.device === b.device || taken(a) || taken(b)) {
      this.warn('Un câble incohérent (port déjà utilisé) a été ignoré.');
      return;
    }
    this.cables.push({ id: this.id('c'), a: a.device, portA: a.port, b: b.device, portB: b.port });
  }

  private docu(item: JObject): void {
    const type = item.number('type');
    const text = (item.string('text') ?? '').slice(0, 2000);
    const kind = type === 1 || (type === undefined && text === '') ? 'zone' : 'text';
    const color = item.props.get('color');
    const font = item.props.get('font');
    const fontArgs = font instanceof JObject ? font.args : [];
    const size = typeof fontArgs[2] === 'number' ? fontArgs[2] : 14;
    const style = typeof fontArgs[1] === 'number' ? fontArgs[1] : 0;
    const dimension = (value: number | undefined, fallback: number) =>
      Math.min(20_000, Math.max(1, Math.round(value ?? fallback)));
    this.notes.push({
      id: this.id('a'),
      kind,
      x: Math.round(item.number('x') ?? 0),
      y: Math.round(item.number('y') ?? 0),
      width: dimension(item.number('width'), kind === 'zone' ? 200 : 120),
      height: dimension(item.number('height'), kind === 'zone' ? 120 : 24),
      text,
      color: color instanceof JObject ? colorOf(color.args) : kind === 'zone' ? '#e3eafc' : '#1c2430',
      fontSize: Math.min(96, Math.max(8, Math.round(size))),
      bold: (style & 1) === 1,
    });
  }
}

function colorOf(args: readonly JValue[]): string {
  const channel = (v: JValue | undefined) =>
    Math.min(255, Math.max(0, typeof v === 'number' ? Math.round(v) : 0))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(args[0])}${channel(args[1])}${channel(args[2])}`;
}

function fileContent(file: JObject): string {
  const content = file.string('dateiInhalt') ?? '';
  const type = clean(file.string('dateiTyp')).toLowerCase();
  const extension = clean(file.string('name')).split('.').pop()?.toLowerCase() ?? '';
  const mime = IMAGE_TYPES[type] ?? (type === 'image' ? (IMAGE_TYPES[extension] ?? 'image/png') : undefined);
  // Filius stores pictures as base64 text; RéseauLab uses data URLs.
  return mime && !content.startsWith('data:') ? `data:${mime};base64,${content.replace(/\s/g, '')}` : content;
}

function findFile(fs: FsJson, name: string): string | undefined {
  for (const [key, value] of Object.entries(fs)) {
    if (typeof value === 'string') {
      if (key === name) return value;
    } else {
      const found = findFile(value, name);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function convertFilius(values: readonly JValue[]): FilsConversion {
  const converter = new Converter();
  const project = converter.run(values);
  return { project, warnings: converter.warnings };
}
