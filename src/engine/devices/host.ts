import { IP_ANY, type Ipv4 } from '../core/ipv4';
import type { Mac } from '../core/mac';
import { FileSystem } from '../fs/filesystem';
import { Port, type SimContext } from '../net/link';
import type { AppId } from '../services/catalog';
import { DhcpClient, DhcpServer } from '../services/dhcp';
import { DnsResolver, DnsServer } from '../services/dns';
import { EchoServer } from '../services/echo';
import { WebServer } from '../services/http';
import { MailClient, MailServer } from '../services/mail';
import type { ServerApp } from '../services/server-app';
import { Firewall } from '../stack/firewall';
import type { L3Interface } from '../stack/interface';
import { Tcp } from '../stack/tcp';
import { Udp } from '../stack/udp';
import type { Position } from './device';
import { NetworkNode } from './node';
import { Switch } from './switch';

export interface HostConfig {
  ip: Ipv4;
  mask: Ipv4;
  gateway: Ipv4;
  dns: Ipv4;
  useDhcp: boolean;
}

/** Runtime addressing obtained from DHCP (or copied from the static config). */
export interface Addressing {
  readonly ip: Ipv4;
  readonly mask: Ipv4;
  readonly gateway: Ipv4;
  readonly dns: Ipv4;
}

/** Something running on a host while the simulation is active. */
export interface HostService {
  start(): void;
  stop(): void;
}

export const DEFAULT_APPS: readonly AppId[] = ['terminal', 'texteditor', 'fileexplorer'];

/** Computer or laptop: one network card, a full IP stack, files and software. */
export class Host extends NetworkNode {
  private readonly services: HostService[] = [];
  readonly udp: Udp;
  readonly tcp: Tcp;
  readonly iface: L3Interface;
  readonly firewall = new Firewall();
  readonly fs = new FileSystem(() => {
    this.changed();
  });
  readonly dns = new DnsResolver(this);
  readonly dhcpClient = new DhcpClient(this);
  readonly dhcpServer = new DhcpServer(this);
  readonly dnsServer = new DnsServer(this);
  readonly webServer = new WebServer(this);
  readonly mailServer = new MailServer(this);
  readonly mailClient = new MailClient(this);
  readonly echoServer = new EchoServer(this);
  /** When true the name shown on the map is the IP address. */
  showIpAsName = false;
  /** Wi-Fi network card: joins a switch by its SSID instead of a cable (use Network.setHostWifi). */
  wifi = false;
  config: HostConfig;
  private runtimeDns: Ipv4 = IP_ANY;
  private readonly software = new Set<AppId>(DEFAULT_APPS);

  constructor(
    id: string,
    kind: 'computer' | 'laptop',
    name: string,
    position: Position,
    ctx: SimContext,
    mac: Mac,
    config: Partial<HostConfig> = {},
  ) {
    super(id, kind, name, position, ctx);
    const port = new Port(this, 0, mac);
    this.ports.push(port);
    this.iface = this.stack.addInterface(port);
    this.udp = new Udp(this.stack);
    this.tcp = new Tcp(this.stack);
    this.stack.firewall = this.firewall;
    this.config = { ip: IP_ANY, mask: IP_ANY, gateway: IP_ANY, dns: IP_ANY, useDhcp: false, ...config };
    this.applyStaticConfig();
  }

  get mac(): Mac {
    return this.iface.port.mac;
  }

  /** SSID of the Wi-Fi network this host is connected to, or null. */
  get wifiNetwork(): string | null {
    const cable = this.iface.port.cable;
    const peer = cable?.wireless ? cable.other(this.iface.port).owner : null;
    return peer instanceof Switch ? peer.ssid : null;
  }

  /** DNS server currently in use (static config or DHCP). */
  get dnsServerAddress(): Ipv4 {
    return this.runtimeDns;
  }

  get addressing(): Addressing {
    return { ip: this.iface.ip, mask: this.iface.mask, gateway: this.stack.gateway, dns: this.runtimeDns };
  }

  get installed(): readonly AppId[] {
    return [...this.software];
  }

  isInstalled(app: AppId): boolean {
    return this.software.has(app);
  }

  setShowIpAsName(show: boolean): void {
    this.showIpAsName = show;
    this.changed();
  }

  /** Replaces the installed software without side effects (project loading). */
  setInstalled(apps: readonly AppId[]): void {
    this.software.clear();
    for (const app of apps) this.software.add(app);
    this.changed();
  }

  install(app: AppId): void {
    this.software.add(app);
    if (app === 'webserver') this.webServer.ensureContent();
    this.changed();
  }

  uninstall(app: AppId): void {
    this.software.delete(app);
    this.serverFor(app)?.setActive(false);
    if (app === 'firewall') this.firewall.enabled = false;
    this.changed();
  }

  /** The server application behind an installable app, if any. */
  serverFor(app: AppId): ServerApp | null {
    switch (app) {
      case 'webserver':
        return this.webServer;
      case 'dnsserver':
        return this.dnsServer;
      case 'dhcpserver':
        return this.dhcpServer;
      case 'mailserver':
        return this.mailServer;
      case 'echoserver':
        return this.echoServer;
      default:
        return null;
    }
  }

  setAddressing(addressing: Addressing): void {
    this.iface.ip = addressing.ip;
    this.iface.mask = addressing.mask;
    this.stack.gateway = addressing.gateway;
    this.runtimeDns = addressing.dns;
    this.changed();
  }

  updateConfig(config: Partial<HostConfig>): void {
    this.config = { ...this.config, ...config };
    this.applyStaticConfig();
    this.changed();
  }

  addService(service: HostService): void {
    this.services.push(service);
  }

  override start(): void {
    this.applyStaticConfig();
    for (const service of this.services) service.start();
  }

  override stop(): void {
    for (const service of this.services) service.stop();
    super.stop();
    this.udp.reset();
    this.tcp.reset();
    this.applyStaticConfig();
  }

  private applyStaticConfig(): void {
    const c = this.config;
    this.setAddressing(
      c.useDhcp
        ? { ip: IP_ANY, mask: IP_ANY, gateway: IP_ANY, dns: IP_ANY }
        : { ip: c.ip, mask: c.mask, gateway: c.gateway, dns: c.dns },
    );
  }
}
