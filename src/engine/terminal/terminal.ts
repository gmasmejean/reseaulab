import { IP_ANY, formatIp, maskToPrefix, type Ipv4 } from '../core/ipv4';
import type { TimerId } from '../core/scheduler';
import type { Host } from '../devices/host';
import { FsError, normalizePath } from '../fs/filesystem';
import type { DnsRecordType } from '../net/messages';
import { DNS_ERROR_TEXT, type ResolveResult } from '../services/dns';
import type { PingResult } from '../stack/icmp';
import type { Route } from '../stack/routing';

export interface TerminalOutput {
  print(line: string): void;
  clear(): void;
}

type Done = () => void;
/** A command runs synchronously or calls `done` later; it may return a cancel function. */
type CommandFn = (args: string[], done: Done) => 'sync' | 'async' | (() => void);

interface CommandSpec {
  readonly names: readonly string[];
  readonly usage: string;
  readonly help: string;
  readonly run: CommandFn;
}

export const PING_COUNT = 4;
export const PING_INTERVAL = 1000;
export const TRACE_MAX_HOPS = 15;
export const TRACE_TIMEOUT = 2000;

/** Splits a command line into words, honouring double quotes. */
export function tokenize(line: string): string[] {
  const words: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  for (const match of line.matchAll(pattern)) words.push(match[1] ?? match[2] ?? '');
  return words;
}

const ROUTE_SOURCE: Record<Route['source'], string> = {
  connected: 'directe',
  default: 'passerelle',
  static: 'statique',
  rip: 'RIP',
};

/** Command line interpreter of a simulated computer. */
export class Terminal {
  private cwdPath = '/';
  private cancel: (() => void) | null = null;
  private busyFlag = false;
  /** Identifies the running command so that late callbacks of an interrupted one are ignored. */
  private runId = 0;
  private readonly commands: CommandSpec[];

  constructor(
    private readonly host: Host,
    private readonly out: TerminalOutput,
  ) {
    this.commands = this.buildCommands();
  }

  get cwd(): string {
    return this.cwdPath;
  }

  get busy(): boolean {
    return this.busyFlag;
  }

  get prompt(): string {
    return `${this.cwdPath}> `;
  }

  /** Runs one command line. Ignored while another command is running. */
  execute(line: string, onFinished: Done = () => undefined): void {
    if (this.busyFlag) return;
    const [name = '', ...args] = tokenize(line);
    if (name === '') {
      onFinished();
      return;
    }
    const spec = this.commands.find((c) => c.names.includes(name.toLowerCase()));
    if (!spec) {
      this.out.print(`Commande inconnue : ${name}. Tapez « help » pour la liste des commandes.`);
      onFinished();
      return;
    }
    this.busyFlag = true;
    const token = ++this.runId;
    let finished = false;
    const done = () => {
      if (finished || token !== this.runId) return;
      finished = true;
      this.busyFlag = false;
      this.cancel = null;
      onFinished();
    };
    try {
      const result = spec.run(args, done);
      if (result === 'sync') done();
      else if (typeof result === 'function') this.cancel = result;
    } catch (error) {
      this.out.print(error instanceof FsError || error instanceof Error ? error.message : String(error));
      done();
    }
  }

  /** Ctrl+C: stops the running command. */
  interrupt(): void {
    if (!this.busyFlag) return;
    this.cancel?.();
    this.runId++;
    this.out.print('^C');
    this.busyFlag = false;
    this.cancel = null;
  }

  private buildCommands(): CommandSpec[] {
    return [
      { names: ['help', 'aide'], usage: 'help', help: 'affiche cette aide', run: () => this.help() },
      {
        names: ['ipconfig', 'ifconfig'],
        usage: 'ipconfig [/renew]',
        help: 'configuration réseau (/renew : redemander une adresse DHCP)',
        run: (args, done) => this.ipconfig(args, done),
      },
      {
        names: ['ping'],
        usage: 'ping [-n nombre] <hôte>',
        help: 'teste si un hôte répond (ICMP)',
        run: (args, done) => this.ping(args, done),
      },
      {
        names: ['traceroute', 'tracert'],
        usage: 'traceroute <hôte>',
        help: 'affiche les routeurs traversés jusqu’à un hôte',
        run: (args, done) => this.traceroute(args, done),
      },
      {
        names: ['arp'],
        usage: 'arp [-a | -d]',
        help: 'table ARP (-d : la vider)',
        run: (args) => this.arp(args),
      },
      { names: ['route'], usage: 'route [print]', help: 'table de routage', run: () => this.route() },
      {
        names: ['netstat'],
        usage: 'netstat [-r]',
        help: 'connexions et ports ouverts (-r : table de routage)',
        run: (args) => (args.includes('-r') ? this.route() : this.netstat()),
      },
      {
        names: ['nslookup', 'host'],
        usage: 'nslookup [-type=A|MX|NS] <nom>',
        help: 'interroge le serveur DNS',
        run: (args, done) => this.nslookup(args, done),
      },
      {
        names: ['hostname'],
        usage: 'hostname',
        help: 'nom de l’ordinateur',
        run: () => this.say(this.host.name),
      },
      { names: ['ls', 'dir'], usage: 'ls [dossier]', help: 'liste un dossier', run: (args) => this.ls(args) },
      { names: ['cd'], usage: 'cd <dossier>', help: 'change de dossier', run: (args) => this.cd(args) },
      { names: ['pwd'], usage: 'pwd', help: 'dossier courant', run: () => this.say(this.cwdPath) },
      {
        names: ['cat', 'type'],
        usage: 'cat <fichier>',
        help: 'affiche un fichier',
        run: (args) => this.cat(args),
      },
      {
        names: ['mkdir', 'md'],
        usage: 'mkdir <dossier>',
        help: 'crée un dossier',
        run: (args) => this.mkdir(args),
      },
      {
        names: ['rm', 'del'],
        usage: 'rm [-r] <chemin>',
        help: 'supprime un fichier (-r : un dossier et son contenu)',
        run: (args) => this.rm(args),
      },
      {
        names: ['touch'],
        usage: 'touch <fichier>',
        help: 'crée un fichier vide',
        run: (args) => this.touch(args),
      },
      {
        names: ['echo'],
        usage: 'echo <texte>',
        help: 'affiche un texte',
        run: (args) => this.say(args.join(' ')),
      },
      {
        names: ['clear', 'cls'],
        usage: 'clear',
        help: 'efface l’écran',
        run: () => {
          this.out.clear();
          return 'sync';
        },
      },
    ];
  }

  private say(text: string): 'sync' {
    this.out.print(text);
    return 'sync';
  }

  private usage(name: string): 'sync' {
    const spec = this.commands.find((c) => c.names.includes(name));
    return this.say(`Utilisation : ${spec?.usage ?? name}`);
  }

  private help(): 'sync' {
    this.out.print('Commandes disponibles :');
    for (const c of this.commands) this.out.print(`  ${c.usage.padEnd(32)} ${c.help}`);
    return 'sync';
  }

  private ipconfig(args: string[], done: Done): 'sync' | (() => void) {
    if (args[0]?.toLowerCase() === '/renew') {
      if (!this.host.config.useDhcp) return this.say('Ce poste n’utilise pas DHCP.');
      this.out.print('Demande d’une adresse au serveur DHCP…');
      this.host.dhcpClient.discover();
      const scheduler = this.host.stack.scheduler;
      let timer: TimerId | null = null;
      const wait = () => {
        const status = this.host.dhcpClient.status;
        if (status === 'bound' || status === 'failed') {
          if (status === 'failed') this.out.print('Aucun serveur DHCP n’a répondu.');
          this.printConfig();
          done();
          return;
        }
        timer = scheduler.schedule(100, wait);
      };
      wait();
      return () => {
        scheduler.cancel(timer);
      };
    }
    this.printConfig();
    return 'sync';
  }

  private printConfig(): void {
    const h = this.host;
    const a = h.addressing;
    const line = (label: string, value: string) => {
      this.out.print(`  ${label.padEnd(22, '.')} : ${value}`);
    };
    this.out.print(`Configuration de ${h.name}`);
    const ssid = h.wifiNetwork;
    line(
      'Carte réseau',
      h.wifi ? (ssid === null ? 'Wi-Fi (non connectée)' : `Wi-Fi, réseau « ${ssid} »`) : 'Ethernet (câble)',
    );
    line('Adresse physique (MAC)', h.mac);
    line('DHCP activé', h.config.useDhcp ? 'oui' : 'non');
    line('Adresse IPv4', a.ip === IP_ANY ? '(aucune)' : formatIp(a.ip));
    line('Masque de sous-réseau', `${formatIp(a.mask)} (/${maskToPrefix(a.mask)})`);
    line('Passerelle par défaut', a.gateway === IP_ANY ? '(aucune)' : formatIp(a.gateway));
    line('Serveur DNS', a.dns === IP_ANY ? '(aucun)' : formatIp(a.dns));
  }

  private resolveThen(target: string, then: (ip: Ipv4) => void, done: Done): void {
    this.host.dns.resolve(target, (result: ResolveResult) => {
      if (result.kind === 'error') {
        this.out.print(`Hôte « ${target} » introuvable : ${DNS_ERROR_TEXT[result.error]}.`);
        done();
        return;
      }
      then(result.ip);
    });
  }

  private ping(args: string[], done: Done): 'sync' | (() => void) {
    let count = PING_COUNT;
    const rest: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i] ?? '';
      if (arg === '-n' || arg === '-c') {
        count = Number(args[++i]);
        if (!Number.isInteger(count) || count < 1 || count > 100)
          return this.say('Nombre de requêtes invalide (1 à 100).');
      } else rest.push(arg);
    }
    const target = rest[0];
    if (target === undefined || rest.length > 1) return this.usage('ping');

    const scheduler = this.host.stack.scheduler;
    let stopProbe: (() => void) | null = null;
    let timer: TimerId | null = null;
    let cancelled = false;
    this.resolveThen(
      target,
      (ip) => {
        if (cancelled) return;
        const shown = formatIp(ip) === target ? target : `${target} [${formatIp(ip)}]`;
        this.out.print(`Envoi d’une requête « ping » à ${shown} :`);
        let sent = 0;
        let received = 0;
        const probe = () => {
          sent++;
          stopProbe = this.host.stack.icmp.ping(ip, { seq: sent }, (result) => {
            stopProbe = null;
            if (result.kind === 'reply') received++;
            this.out.print(describePing(result));
            if (sent < count && result.kind !== 'no-route') {
              timer = scheduler.schedule(PING_INTERVAL, probe);
              return;
            }
            const lost = sent - received;
            this.out.print(
              `Statistiques : envoyés = ${sent}, reçus = ${received}, perdus = ${lost} (${Math.round((100 * lost) / sent)} % de perte)`,
            );
            done();
          });
        };
        probe();
      },
      done,
    );
    return () => {
      cancelled = true;
      stopProbe?.();
      scheduler.cancel(timer);
    };
  }

  private traceroute(args: string[], done: Done): 'sync' | (() => void) {
    const target = args[0];
    if (target === undefined) return this.usage('traceroute');
    let stopProbe: (() => void) | null = null;
    let cancelled = false;
    this.resolveThen(
      target,
      (ip) => {
        if (cancelled) return;
        this.out.print(`Itinéraire vers ${formatIp(ip)} (${TRACE_MAX_HOPS} sauts maximum) :`);
        const hop = (ttl: number) => {
          stopProbe = this.host.stack.icmp.ping(ip, { ttl, timeout: TRACE_TIMEOUT, seq: ttl }, (result) => {
            stopProbe = null;
            const n = String(ttl).padStart(3);
            switch (result.kind) {
              case 'reply':
                this.out.print(`${n}  ${String(result.rtt).padStart(5)} ms  ${formatIp(result.from)}`);
                this.out.print('Itinéraire déterminé.');
                done();
                return;
              case 'time-exceeded':
                this.out.print(`${n}  ${String(result.rtt).padStart(5)} ms  ${formatIp(result.from)}`);
                break;
              case 'timeout':
                this.out.print(`${n}      *     délai d’attente dépassé`);
                break;
              case 'unreachable':
                this.out.print(`${n}  ${formatIp(result.from)} : destination inaccessible`);
                done();
                return;
              case 'no-route':
                this.out.print('Aucune route vers cet hôte (vérifiez la passerelle).');
                done();
                return;
            }
            if (ttl >= TRACE_MAX_HOPS) {
              this.out.print('Nombre maximal de sauts atteint.');
              done();
              return;
            }
            hop(ttl + 1);
          });
        };
        hop(1);
      },
      done,
    );
    return () => {
      cancelled = true;
      stopProbe?.();
    };
  }

  private arp(args: string[]): 'sync' {
    if (args[0] === '-d') {
      this.host.stack.arp.clear();
      return this.say('Table ARP vidée.');
    }
    const entries = this.host.stack.arp.entries;
    if (entries.length === 0) return this.say('La table ARP est vide.');
    this.out.print(`${'Adresse IP'.padEnd(18)}Adresse MAC`);
    for (const e of entries) this.out.print(`${formatIp(e.ip).padEnd(18)}${e.mac}`);
    return 'sync';
  }

  private route(): 'sync' {
    const routes = this.host.stack.routes();
    if (routes.length === 0) return this.say('Table de routage vide (aucune adresse IP configurée).');
    this.out.print(
      `${'Destination'.padEnd(17)}${'Masque'.padEnd(17)}${'Passerelle'.padEnd(17)}${'Interface'.padEnd(17)}Type`,
    );
    for (const r of routes) {
      const iface = this.host.stack.interfaces[r.iface];
      this.out.print(
        `${formatIp(r.destination).padEnd(17)}${formatIp(r.mask).padEnd(17)}${(r.gateway === IP_ANY ? 'directe' : formatIp(r.gateway)).padEnd(17)}${formatIp(iface?.ip ?? IP_ANY).padEnd(17)}${ROUTE_SOURCE[r.source]}`,
      );
    }
    return 'sync';
  }

  private netstat(): 'sync' {
    const { tcp, udp } = this.host;
    const local = formatIp(this.host.addressing.ip);
    this.out.print(`${'Proto'.padEnd(7)}${'Adresse locale'.padEnd(24)}${'Adresse distante'.padEnd(24)}État`);
    for (const port of tcp.listeningPorts)
      this.out.print(`${'TCP'.padEnd(7)}${`${local}:${port}`.padEnd(24)}${'*:*'.padEnd(24)}LISTEN`);
    for (const s of tcp.connections) {
      this.out.print(
        `${'TCP'.padEnd(7)}${`${formatIp(s.localIp)}:${s.localPort}`.padEnd(24)}${`${formatIp(s.remoteIp)}:${s.remotePort}`.padEnd(24)}${s.state}`,
      );
    }
    for (const port of udp.boundPorts)
      this.out.print(`${'UDP'.padEnd(7)}${`${local}:${port}`.padEnd(24)}*:*`);
    return 'sync';
  }

  private nslookup(args: string[], done: Done): 'sync' | 'async' {
    let type: DnsRecordType = 'A';
    const names: string[] = [];
    for (const arg of args) {
      const option = /^-type=(a|mx|ns)$/i.exec(arg);
      if (option?.[1]) type = option[1].toUpperCase() as DnsRecordType;
      else names.push(arg);
    }
    const name = names[0];
    if (name === undefined) return this.usage('nslookup');
    const server = this.host.dnsServerAddress;
    this.out.print(`Serveur : ${server === IP_ANY ? '(aucun)' : formatIp(server)}`);
    this.host.dns.query(name, type, (result) => {
      if (result.kind === 'error') this.out.print(`*** ${name} : ${DNS_ERROR_TEXT[result.error]}`);
      else if (result.records.length === 0) this.out.print(`*** Aucun enregistrement ${type} pour ${name}`);
      else for (const r of result.records) this.out.print(`${r.name}  ${r.type}  ${r.value}`);
      done();
    });
    return 'async';
  }

  private path(arg: string | undefined): string {
    if (arg === undefined) throw new FsError('Chemin manquant.');
    return normalizePath(arg, this.cwdPath);
  }

  private ls(args: string[]): 'sync' {
    const path = args[0] === undefined ? this.cwdPath : this.path(args[0]);
    const entries = this.host.fs.list(path);
    if (entries.length === 0) return this.say('(dossier vide)');
    for (const e of entries)
      this.out.print(e.type === 'dir' ? `  [${e.name}]` : `  ${e.name.padEnd(30)} ${e.size} octets`);
    return 'sync';
  }

  private cd(args: string[]): 'sync' {
    const path = args[0] === undefined ? '/' : this.path(args[0]);
    if (!this.host.fs.isDirectory(path)) return this.say(`Dossier introuvable : ${path}`);
    this.cwdPath = path;
    return 'sync';
  }

  private cat(args: string[]): 'sync' {
    const path = this.path(args[0]);
    const content = this.host.fs.readFile(path);
    if (content === null) return this.say(`Fichier introuvable : ${path}`);
    for (const line of content.split('\n')) this.out.print(line);
    return 'sync';
  }

  private mkdir(args: string[]): 'sync' {
    this.host.fs.mkdir(this.path(args[0]));
    return 'sync';
  }

  private touch(args: string[]): 'sync' {
    const path = this.path(args[0]);
    if (!this.host.fs.exists(path)) this.host.fs.writeFile(path, '');
    return 'sync';
  }

  private rm(args: string[]): 'sync' {
    const recursive = args[0] === '-r';
    const path = this.path(recursive ? args[1] : args[0]);
    if (path === '/') return this.say('Impossible de supprimer la racine.');
    this.host.fs.remove(path, recursive);
    if (!this.host.fs.isDirectory(this.cwdPath)) this.cwdPath = '/';
    return 'sync';
  }
}

export function describePing(result: PingResult): string {
  switch (result.kind) {
    case 'reply':
      return `Réponse de ${formatIp(result.from)} : temps=${result.rtt} ms TTL=${result.ttl}`;
    case 'time-exceeded':
      return `Réponse de ${formatIp(result.from)} : durée de vie (TTL) écoulée.`;
    case 'unreachable':
      return `Réponse de ${formatIp(result.from)} : ${result.code === 'net' ? 'réseau' : result.code === 'port' ? 'port' : 'hôte'} de destination inaccessible.`;
    case 'timeout':
      return 'Délai d’attente de la demande dépassé.';
    case 'no-route':
      return 'Aucune route vers cet hôte (vérifiez l’adresse IP et la passerelle).';
  }
}
