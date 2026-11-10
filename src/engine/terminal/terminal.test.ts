import type { Host } from '../devices/host';
import type { Network } from '../network';
import { ip, routedNetwork } from '../testing';
import { TERMINAL_COMMANDS, Terminal, tokenize, type TerminalEvent } from './terminal';

function setup() {
  const ctx = routedNetwork();
  ctx.b.install('dnsserver');
  ctx.b.dnsServer.updateConfig({ records: [{ name: 'www.ecole.fr', type: 'A', value: '192.168.2.10' }] });
  ctx.b.dnsServer.setActive(true);
  ctx.a.updateConfig({ dns: ip('192.168.2.10') });
  return ctx;
}

function terminal(host: Host) {
  const lines: string[] = [];
  let clears = 0;
  const term = new Terminal(host, { print: (l) => lines.push(l), clear: () => clears++ });
  return { term, lines, clears: () => clears };
}

/** Runs a command to completion and returns what it printed. */
function run(net: Network, t: ReturnType<typeof terminal>, line: string): string {
  const start = t.lines.length;
  let finished = false;
  t.term.execute(line, () => (finished = true));
  net.scheduler.runUntilIdle();
  expect(finished).toBe(true);
  expect(t.term.busy).toBe(false);
  return t.lines.slice(start).join('\n');
}

describe('Terminal', () => {
  test('découpage des arguments', () => {
    expect(tokenize('  echo "deux mots"  trois ')).toEqual(['echo', 'deux mots', 'trois']);
    expect(tokenize('')).toEqual([]);
  });

  test('aide, commande inconnue, ligne vide, echo, hostname, clear', () => {
    const { net, a } = setup();
    const t = terminal(a);
    net.start();
    expect(run(net, t, 'help')).toContain('ping');
    expect(run(net, t, 'xyz')).toContain('Commande inconnue : xyz');
    expect(run(net, t, '   ')).toBe('');
    expect(run(net, t, 'echo "a  b" c')).toBe('a  b c');
    expect(run(net, t, 'HOSTNAME')).toBe('A');
    run(net, t, 'cls');
    expect(t.clears()).toBe(1);
  });

  test('ipconfig', () => {
    const { net, a } = setup();
    const t = terminal(a);
    net.start();
    const out = run(net, t, 'ipconfig');
    expect(out).toContain('192.168.1.10');
    expect(out).toContain('255.255.255.0 (/24)');
    expect(out).toContain(a.mac);
    expect(run(net, t, 'ipconfig /renew')).toContain('n’utilise pas DHCP');
    expect(out).toMatch(/Carte réseau\.* : Ethernet \(câble\)/);
  });

  test('ipconfig indique la carte Wi-Fi et le réseau rejoint', () => {
    const { net, a } = setup();
    const t = terminal(a);
    net.setHostWifi(a.id, true);
    expect(run(net, t, 'ipconfig')).toContain('Wi-Fi (non connectée)');
    const sw = net.switches[0];
    if (!sw) throw new Error('switch attendu');
    net.joinWifi(a.id, sw.ssid);
    expect(run(net, t, 'ipconfig')).toContain(`Wi-Fi, réseau « ${sw.ssid} »`);
  });

  test('ipconfig /renew avec et sans serveur DHCP', () => {
    const { net, a, b } = setup();
    b.install('dhcpserver');
    b.dhcpServer.updateConfig({ rangeStart: ip('192.168.2.100'), rangeEnd: ip('192.168.2.120') });
    const t = terminal(a);
    a.updateConfig({ useDhcp: true });
    net.start();
    expect(run(net, t, 'ipconfig /renew')).toContain('Aucun serveur DHCP');
    const laptop = net.addHost('laptop', { config: { useDhcp: true } });
    net.connect(laptop.id, net.devices.find((d) => d.name === 'Switch 2')?.id ?? '');
    b.dhcpServer.setActive(true);
    expect(run(net, terminal(laptop), 'ipconfig /renew')).toContain('192.168.2.100');
  });

  test('ping par nom et par adresse, options, erreurs', () => {
    const { net, a } = setup();
    const t = terminal(a);
    net.start();
    const out = run(net, t, 'ping www.ecole.fr');
    expect(out).toContain('www.ecole.fr [192.168.2.10]');
    expect(out.match(/Réponse de 192\.168\.2\.10/g)).toHaveLength(4);
    expect(out).toContain('reçus = 4, perdus = 0 (0 % de perte)');
    expect(run(net, t, 'ping -n 2 192.168.2.1').match(/TTL=64/g)).toHaveLength(2);
    expect(run(net, t, 'ping -n 1 192.168.2.99')).toContain('hôte de destination inaccessible');
    expect(run(net, t, 'ping -n 1 172.16.0.1')).toContain('réseau de destination inaccessible');
    expect(run(net, t, 'ping inconnu.fr')).toContain('introuvable');
    expect(run(net, t, 'ping')).toContain('Utilisation');
    expect(run(net, t, 'ping -n 0 x')).toContain('invalide');
    a.updateConfig({ gateway: 0 });
    expect(run(net, t, 'ping 192.168.2.10')).toContain('Aucune route');
  });

  test('Ctrl+C interrompt un ping', () => {
    const { net, a } = setup();
    const t = terminal(a);
    net.start();
    let finished = false;
    t.term.execute('ping -n 50 192.168.2.10', () => (finished = true));
    net.scheduler.advance(2500);
    expect(t.term.busy).toBe(true);
    t.term.execute('hostname'); // ignored while busy
    t.term.interrupt();
    t.term.interrupt();
    net.scheduler.runUntilIdle();
    expect(finished).toBe(false);
    expect(t.term.busy).toBe(false);
    expect(t.lines.at(-1)).toBe('^C');
    expect(t.lines.filter((l) => l.startsWith('Réponse')).length).toBeLessThan(5);
  });

  test('traceroute', () => {
    const { net, a } = setup();
    const t = terminal(a);
    net.start();
    const out = run(net, t, 'tracert www.ecole.fr');
    expect(out).toMatch(/1\s+\d+ ms {2}192\.168\.1\.1/);
    expect(out).toMatch(/2\s+\d+ ms {2}192\.168\.2\.10/);
    expect(out).toContain('Itinéraire déterminé.');
    expect(run(net, t, 'traceroute 172.16.0.1')).toContain('destination inaccessible');
    expect(run(net, t, 'traceroute')).toContain('Utilisation');
    a.updateConfig({ gateway: 0 });
    expect(run(net, t, 'traceroute 192.168.2.10')).toContain('Aucune route');
  });

  test('traceroute : sauts muets et limite', () => {
    const { net, a, r } = setup();
    r.firewall.enabled = true; // drops every echo request it forwards
    const t = terminal(a);
    net.start();
    const out = run(net, t, 'traceroute 192.168.2.10');
    expect(out).toContain('délai d’attente dépassé');
    expect(out).toContain('Nombre maximal de sauts atteint.');
  });

  test('arp, route, netstat', () => {
    const { net, a, b } = setup();
    const t = terminal(a);
    net.start();
    expect(run(net, t, 'arp')).toContain('vide');
    run(net, t, 'ping -n 1 192.168.2.10');
    expect(run(net, t, 'arp -a')).toContain('192.168.1.1');
    expect(run(net, t, 'arp -d')).toContain('vidée');
    expect(a.stack.arp.entries).toHaveLength(0);
    const routes = run(net, t, 'route print');
    expect(routes).toContain('192.168.1.0');
    expect(routes).toContain('passerelle');
    expect(run(net, t, 'netstat -r')).toContain('192.168.1.0');
    b.install('webserver');
    b.webServer.setActive(true);
    const bt = terminal(b);
    const stat = run(net, bt, 'netstat');
    expect(stat).toMatch(/TCP\s+192\.168\.2\.10:80\s+\*:\*\s+LISTEN/);
    expect(stat).toMatch(/UDP\s+192\.168\.2\.10:53/);
    const unconfigured = net.addHost();
    expect(run(net, terminal(unconfigured), 'route')).toContain('vide');
  });

  test('nslookup', () => {
    const { net, a } = setup();
    const t = terminal(a);
    net.start();
    expect(run(net, t, 'nslookup www.ecole.fr')).toContain('www.ecole.fr  A  192.168.2.10');
    expect(run(net, t, 'host -type=MX www.ecole.fr')).toContain('Aucun enregistrement MX');
    expect(run(net, t, 'nslookup absent.fr')).toContain('nom de domaine inconnu');
    expect(run(net, t, 'nslookup')).toContain('Utilisation');
  });

  test('fichiers : ls, cd, pwd, mkdir, touch, cat, rm', () => {
    const { net, a } = setup();
    const t = terminal(a);
    net.start();
    expect(run(net, t, 'ls')).toBe('(dossier vide)');
    run(net, t, 'mkdir docs');
    run(net, t, 'cd docs');
    expect(t.term.prompt).toBe('/docs> ');
    expect(run(net, t, 'pwd')).toBe('/docs');
    run(net, t, 'touch note.txt');
    a.fs.writeFile('/docs/note.txt', 'l1\nl2');
    run(net, t, 'touch note.txt');
    expect(run(net, t, 'cat note.txt')).toBe('l1\nl2');
    expect(run(net, t, 'dir /')).toContain('[docs]');
    expect(run(net, t, 'ls')).toContain('5 octets');
    expect(run(net, t, 'type absent')).toContain('introuvable');
    expect(run(net, t, 'cd absent')).toContain('introuvable');
    expect(run(net, t, 'mkdir')).toContain('manquant');
    expect(run(net, t, 'rm /')).toContain('racine');
    expect(run(net, t, 'rm /docs')).toContain('pas vide');
    run(net, t, 'rm -r /docs');
    expect(t.term.cwd).toBe('/');
    run(net, t, 'cd');
    expect(t.term.cwd).toBe('/');
    expect(run(net, t, 'ls /absent')).toContain('introuvable');
  });
});

describe('Terminal : commandes autorisées et événements', () => {
  test('ne propose que les commandes autorisées', () => {
    const { net, a } = setup();
    net.start();
    const lines: string[] = [];
    const term = new Terminal(
      a,
      { print: (l) => lines.push(l), clear: () => undefined },
      { commands: new Set(['help', 'ipconfig', 'ping']) },
    );
    term.execute('help');
    expect(lines.join('\n')).toContain('ping');
    expect(lines.join('\n')).not.toContain('traceroute');
    lines.length = 0;
    term.execute('tracert 192.168.2.10');
    expect(lines).toEqual(['Commande inconnue : tracert. Tapez « help » pour la liste des commandes.']);
    // Un alias d'une commande autorisée reste utilisable.
    lines.length = 0;
    term.execute('ifconfig');
    expect(lines.join('\n')).toContain('Adresse IPv4');
  });

  test('chaque commande a un nom principal unique', () => {
    expect(new Set(TERMINAL_COMMANDS).size).toBe(TERMINAL_COMMANDS.length);
    const { net, a } = setup();
    net.start();
    const lines: string[] = [];
    const term = new Terminal(a, { print: (l) => lines.push(l), clear: () => undefined });
    term.execute('help');
    for (const name of TERMINAL_COMMANDS)
      expect(lines.some((l) => l.trimStart().startsWith(name))).toBe(true);
  });

  test('signale les commandes lancées, le résultat d’un ping et un nom introuvable', () => {
    const { net, a } = setup();
    net.start();
    const events: TerminalEvent[] = [];
    const term = new Terminal(
      a,
      { print: () => undefined, clear: () => undefined },
      { onEvent: (e) => events.push(e) },
    );
    const exec = (line: string) => {
      term.execute(line);
      net.scheduler.runUntilIdle();
    };
    exec('  IPCONFIG  ');
    exec('inconnue');
    exec('');
    exec('ping -n 2 192.168.2.10');
    exec('ping -n 1 192.168.1.77');
    exec('ping absent.ecole.fr');
    expect(events).toEqual([
      { kind: 'command', name: 'ipconfig', line: 'IPCONFIG' },
      { kind: 'command', name: 'ping', line: 'ping -n 2 192.168.2.10' },
      { kind: 'ping-done', target: ip('192.168.2.10'), sent: 2, received: 2 },
      { kind: 'command', name: 'ping', line: 'ping -n 1 192.168.1.77' },
      { kind: 'ping-done', target: ip('192.168.1.77'), sent: 1, received: 0 },
      { kind: 'command', name: 'ping', line: 'ping absent.ecole.fr' },
      { kind: 'resolve-failed', name: 'absent.ecole.fr', error: 'nxdomain' },
    ]);
  });
});
