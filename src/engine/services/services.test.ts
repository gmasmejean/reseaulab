import { IP_ANY, formatIp } from '../core/ipv4';
import type { Host } from '../devices/host';
import { Network } from '../network';
import {
  MASK_24,
  errorMessage,
  ip,
  ping,
  pingFor,
  routedNetwork,
  settle,
  simpleLan,
  staticHost,
} from '../testing';
import { DHCP_MAX_ATTEMPTS, DHCP_RETRY_DELAY } from './dhcp';
import type { DnsResult, ResolveResult } from './dns';
import { LineClient } from './echo';
import { formatUrl, httpGet, parseResponse, parseUrl, resolveLink, type HttpResult } from './http';
import { formatEmail, parseEmail, type MailResult } from './mail';
import { RIP_TIMEOUT } from './rip';

function dhcpLan() {
  const net = new Network();
  const server = staticHost(net, 'Serveur', '192.168.0.1');
  server.install('dhcpserver');
  server.dhcpServer.updateConfig({
    rangeStart: ip('192.168.0.100'),
    rangeEnd: ip('192.168.0.101'),
    gateway: ip('192.168.0.254'),
    dns: ip('192.168.0.1'),
  });
  server.dhcpServer.setActive(true);
  const sw = net.addSwitch();
  net.connect(server.id, sw.id);
  const client = (n: number) => {
    const c = net.addHost('laptop', { name: `Client ${n}`, config: { useDhcp: true } });
    net.connect(c.id, sw.id);
    return c;
  };
  const clients: [Host, Host, Host] = [client(1), client(2), client(3)];
  return { net, server, clients };
}

describe('DHCP', () => {
  test('les clients reçoivent une configuration complète ; plage épuisée', () => {
    const { net, server, clients } = dhcpLan();
    const [c1, c2, c3] = clients;
    net.start();
    expect(c1.addressing.ip).toBe(IP_ANY);
    net.scheduler.runUntilIdle();
    expect(formatIp(c1.addressing.ip)).toBe('192.168.0.100');
    expect(formatIp(c2.addressing.ip)).toBe('192.168.0.101');
    expect(c1.addressing).toMatchObject({
      mask: MASK_24,
      gateway: ip('192.168.0.254'),
      dns: ip('192.168.0.1'),
    });
    expect(c1.dhcpClient.status).toBe('bound');
    expect(c3.dhcpClient.status).toBe('failed');
    expect(server.dhcpServer.leases.filter((l) => l.confirmed)).toHaveLength(2);
    expect(server.dhcpServer.log.some((l) => l.text.includes('Plus d’adresse'))).toBe(true);
    expect(ping(net, c1, '192.168.0.101').kind).toBe('reply');
  });

  test('réservation par adresse MAC', () => {
    const { net, server, clients } = dhcpLan();
    const c3 = clients[2];
    server.dhcpServer.updateConfig({ reservations: [{ mac: c3.mac, ip: ip('192.168.0.50') }] });
    net.start();
    net.scheduler.runUntilIdle();
    expect(formatIp(c3.addressing.ip)).toBe('192.168.0.50');
  });

  test('sans serveur : échec après plusieurs essais ; arrêt = configuration effacée', () => {
    const { net, server, clients } = dhcpLan();
    server.dhcpServer.setActive(false);
    net.start();
    net.scheduler.advance(DHCP_RETRY_DELAY * DHCP_MAX_ATTEMPTS + 1);
    expect(clients[0].dhcpClient.status).toBe('failed');
    net.stop();
    expect(clients[0].dhcpClient.status).toBe('idle');
  });

  test('un serveur activé pendant la simulation répond au renouvellement', () => {
    const { net, server, clients } = dhcpLan();
    server.dhcpServer.setActive(false);
    net.start();
    net.scheduler.runUntilIdle();
    server.dhcpServer.setActive(true);
    expect(server.dhcpServer.isListening).toBe(true);
    clients[0].dhcpClient.discover();
    net.scheduler.runUntilIdle();
    expect(clients[0].dhcpClient.status).toBe('bound');
  });
});

function dnsNetwork() {
  const ctx = routedNetwork();
  const { net, a, b } = ctx;
  // A is the client, B hosts the DNS server.
  a.updateConfig({ dns: ip('192.168.2.10') });
  b.install('dnsserver');
  b.dnsServer.updateConfig({
    records: [
      { name: 'www.ecole.fr', type: 'A', value: '192.168.2.10' },
      { name: 'ecole.fr', type: 'MX', value: 'mail.ecole.fr' },
    ],
  });
  b.dnsServer.setActive(true);
  return { ...ctx, net };
}

function resolve(net: Network, host: Host, name: string): ResolveResult {
  return settle<ResolveResult>(net, (done) => {
    host.dns.resolve(name, done);
  });
}

describe('DNS', () => {
  test('résolution de noms, MX, nom inconnu, adresse littérale, localhost', () => {
    const { net, a } = dnsNetwork();
    net.start();
    expect(resolve(net, a, 'WWW.ecole.fr.')).toEqual({ kind: 'ok', ip: ip('192.168.2.10') });
    expect(resolve(net, a, 'inconnu.fr')).toEqual({ kind: 'error', error: 'nxdomain' });
    expect(resolve(net, a, 'ecole.fr')).toEqual({ kind: 'error', error: 'nxdomain' });
    expect(resolve(net, a, '10.1.2.3')).toEqual({ kind: 'ok', ip: ip('10.1.2.3') });
    expect(resolve(net, a, 'localhost')).toEqual({ kind: 'ok', ip: ip('127.0.0.1') });
    const mx = settle<DnsResult>(net, (done) => {
      a.dns.query('ecole.fr', 'MX', done);
    });
    expect(mx).toMatchObject({ kind: 'ok', records: [{ type: 'MX', value: 'mail.ecole.fr' }] });
  });

  test('pas de serveur configuré, serveur arrêté', () => {
    const { net, a, b } = dnsNetwork();
    net.start();
    b.dnsServer.setActive(false);
    expect(resolve(net, a, 'www.ecole.fr')).toEqual({ kind: 'error', error: 'timeout' });
    a.updateConfig({ dns: 0 });
    expect(resolve(net, a, 'www.ecole.fr')).toEqual({ kind: 'error', error: 'no-server' });
  });

  test('délégation de zone (NS) et récursion', () => {
    const { net, a, b, s1 } = dnsNetwork();
    const local = staticHost(net, 'DNS local', '192.168.1.53', '192.168.1.1');
    net.connect(local.id, s1.id);
    local.install('dnsserver');
    local.dnsServer.updateConfig({
      records: [
        { name: 'ecole.fr', type: 'NS', value: 'ns.ecole.fr' },
        { name: 'ns.ecole.fr', type: 'A', value: '192.168.2.10' },
      ],
    });
    local.dnsServer.setActive(true);
    a.updateConfig({ dns: ip('192.168.1.53') });
    net.start();
    expect(resolve(net, a, 'www.ecole.fr')).toEqual({ kind: 'ok', ip: ip('192.168.2.10') });
    expect(resolve(net, a, 'zzz.ecole.fr')).toEqual({ kind: 'error', error: 'nxdomain' });
    expect(resolve(net, a, 'www.autre.fr')).toEqual({ kind: 'error', error: 'nxdomain' });
    local.dnsServer.updateConfig({ recursion: false });
    expect(resolve(net, a, 'www.ecole.fr')).toEqual({ kind: 'error', error: 'nxdomain' });
    expect(b.dnsServer.log.length).toBeGreaterThan(0);
  });

  test('une délégation en boucle ne provoque pas de tempête', () => {
    const { net, a, b } = dnsNetwork();
    b.dnsServer.updateConfig({ records: [{ name: '.', type: 'NS', value: '192.168.2.10' }] });
    net.start();
    expect(resolve(net, a, 'boucle.fr').kind).toBe('error');
    expect(net.scheduler.now).toBeLessThan(10_000);
  });
});

function get(net: Network, host: Host, url: string): HttpResult {
  return settle<HttpResult>(net, (done) => {
    httpGet(host, url, done);
  });
}

describe('HTTP', () => {
  test('serveur web et navigateur', () => {
    const { net, a, b } = dnsNetwork();
    b.install('webserver');
    b.fs.mkdir('/webserver/docs', true);
    b.fs.writeFile('/webserver/docs/page.html', '<p>doc</p>');
    b.fs.writeFile('/webserver/docs/index.html', '<p>accueil docs</p>');
    b.webServer.setActive(true);
    net.start();
    const home = get(net, a, 'http://www.ecole.fr/');
    expect(home).toMatchObject({
      kind: 'ok',
      response: { status: 200, headers: { 'content-type': 'text/html' } },
    });
    expect(home.kind === 'ok' && home.response.body).toContain('Bienvenue');
    expect(get(net, a, 'www.ecole.fr/docs/page.html')).toMatchObject({ response: { body: '<p>doc</p>' } });
    expect(get(net, a, '192.168.2.10/docs')).toMatchObject({ response: { body: '<p>accueil docs</p>' } });
    expect(get(net, a, 'http://www.ecole.fr/absent.html')).toMatchObject({ response: { status: 404 } });
    expect(get(net, a, 'http://www.ecole.fr/../../etc')).toMatchObject({ response: { status: 404 } });
    expect(get(net, a, 'http://www.ecole.fr/%E0%A4%A')).toMatchObject({ response: { status: 404 } });
    expect(b.webServer.log.some((l) => l.text.includes('GET /docs/page.html'))).toBe(true);
  });

  test('erreurs côté navigateur', () => {
    const { net, a, b } = dnsNetwork();
    b.install('webserver');
    net.start();
    expect(get(net, a, 'http://www.ecole.fr/')).toEqual({
      kind: 'error',
      message: 'Connexion refusée par 192.168.2.10',
    });
    expect(errorMessage(get(net, a, 'http://nulle.part/'))).toContain('inconnu');
    expect(get(net, a, 'ht tp://x').kind).toBe('error');
    expect(errorMessage(get(net, a, 'http://192.168.2.99/'))).toContain('ne répond pas');
  });

  test('analyse d’URL, de liens et de réponses', () => {
    expect(parseUrl('http://Site.fr:8080/a/b')).toEqual({ host: 'site.fr', port: 8080, path: '/a/b' });
    expect(parseUrl('site.fr')).toEqual({ host: 'site.fr', port: 80, path: '/' });
    expect(parseUrl('http://site.fr:99999/')).toBeNull();
    expect(parseUrl('')).toBeNull();
    const base = { host: 'site.fr', port: 80, path: '/a/b.html' };
    expect(resolveLink(base, 'c.html')).toBe('http://site.fr/a/c.html');
    expect(resolveLink(base, '../d.html')).toBe('http://site.fr/d.html');
    expect(resolveLink(base, '/e.html')).toBe('http://site.fr/e.html');
    expect(resolveLink(base, 'http://autre.fr/')).toBe('http://autre.fr/');
    expect(formatUrl({ host: 'x', port: 81, path: '/' })).toBe('http://x:81/');
    expect(parseResponse('pas http')).toBeNull();
    expect(parseResponse('FOO\r\n\r\n')).toBeNull();
  });
});

function mailNetwork() {
  const ctx = dnsNetwork();
  const { b, a } = ctx;
  b.dnsServer.updateConfig({
    records: [
      { name: 'mail.ecole.fr', type: 'A', value: '192.168.2.10' },
      { name: 'ecole.fr', type: 'MX', value: 'mail.ecole.fr' },
    ],
  });
  b.install('mailserver');
  b.mailServer.updateConfig({ domain: 'ecole.fr' });
  b.mailServer.addAccount('alice', 'secret');
  b.mailServer.addAccount('Bob', 'mdp');
  b.mailServer.setActive(true);
  a.install('mailclient');
  a.mailClient.updateAccount({
    address: 'alice@ecole.fr',
    smtpServer: 'mail.ecole.fr',
    pop3Server: 'mail.ecole.fr',
    user: 'alice',
    password: 'secret',
  });
  return ctx;
}

function send(net: Network, host: Host, to: string[], subject = 'Bonjour'): MailResult {
  return settle<MailResult>(net, (done) => {
    host.mailClient.send({ to, cc: [], subject, body: 'Ligne 1\n.ligne avec point\nFin' }, done);
  });
}

function fetchMail(net: Network, host: Host) {
  return settle<{ kind: 'ok'; count: number } | { kind: 'error'; message: string }>(net, (done) => {
    host.mailClient.fetch(done);
  });
}

describe('Messagerie', () => {
  test('envoi SMTP puis relève POP3', () => {
    const { net, a, b } = mailNetwork();
    net.start();
    expect(send(net, a, ['bob@ecole.fr', 'alice@ecole.fr'])).toEqual({ kind: 'ok' });
    expect(b.mailServer.account('bob')?.mailbox).toHaveLength(1);
    expect(a.mailClient.sent).toHaveLength(1);

    expect(fetchMail(net, a)).toEqual({ kind: 'ok', count: 1 });
    expect(a.mailClient.inbox[0]).toMatchObject({
      from: 'alice@ecole.fr',
      subject: 'Bonjour',
      body: 'Ligne 1\n.ligne avec point\nFin',
    });
    expect(b.mailServer.account('alice')?.mailbox).toHaveLength(0);
  });

  test('erreurs : destinataire inconnu, mauvais mot de passe, adresse invalide', () => {
    const { net, a } = mailNetwork();
    net.start();
    expect(errorMessage(send(net, a, ['personne@ecole.fr']))).toContain('550');
    expect(errorMessage(send(net, a, ['pas-une-adresse']))).toContain('invalide');
    a.mailClient.updateAccount({ password: 'faux' });
    expect(fetchMail(net, a).kind).toBe('error');
  });

  test('relais entre deux serveurs grâce à l’enregistrement MX', () => {
    const { net, a, b, s1 } = mailNetwork();
    const other = staticHost(net, 'Mail lycée', '192.168.1.25', '192.168.1.1', '192.168.2.10');
    net.connect(other.id, s1.id);
    other.install('mailserver');
    other.mailServer.updateConfig({ domain: 'lycee.fr' });
    other.mailServer.addAccount('carla', 'x');
    other.mailServer.setActive(true);
    b.updateConfig({ dns: ip('192.168.2.10') });
    b.dnsServer.updateConfig({
      records: [
        ...b.dnsServer.config.records,
        { name: 'lycee.fr', type: 'MX', value: 'mail.lycee.fr' },
        { name: 'mail.lycee.fr', type: 'A', value: '192.168.1.25' },
      ],
    });
    net.start();
    expect(send(net, a, ['carla@lycee.fr'])).toEqual({ kind: 'ok' });
    expect(other.mailServer.account('carla')?.mailbox).toHaveLength(1);
    expect(b.mailServer.log.some((l) => l.text.includes('Relais vers mail.lycee.fr réussi'))).toBe(true);
  });

  test('format des messages', () => {
    const email = { from: 'a@x.fr', to: ['b@x.fr'], cc: ['c@x.fr'], subject: 'S', body: 'B', date: 42 };
    expect(parseEmail(formatEmail(email))).toEqual(email);
    expect(parseEmail('pas d’en-tête')).toMatchObject({ from: '', body: '' });
  });

  test('gestion des comptes', () => {
    const { b } = mailNetwork();
    expect(() => {
      b.mailServer.addAccount('alice', 'x');
    }).toThrow(/existe déjà/);
    expect(() => {
      b.mailServer.addAccount('a b', 'x');
    }).toThrow(/invalide/);
    b.mailServer.removeAccount('alice');
    expect(b.mailServer.account('alice')).toBeUndefined();
  });
});

describe('Écho et client simple', () => {
  test('échange de lignes puis déconnexion', () => {
    const { net, a, b } = simpleLan();
    b.install('echoserver');
    b.echoServer.setActive(true);
    b.echoServer.setPort(7000);
    net.start();
    const log: string[] = [];
    const client = new LineClient(a, {
      connected: (remote) => {
        log.push(`connecté ${remote}`);
        client.send('bonjour');
      },
      line: (line) => {
        log.push(line);
        client.disconnect();
      },
      closed: (message) => log.push(message),
    });
    client.connect('192.168.0.2', 7000);
    net.scheduler.runUntilIdle();
    expect(log).toEqual(['connecté 192.168.0.2:7000', 'bonjour', 'Connexion fermée']);
    expect(client.connected).toBe(false);
    expect(() => {
      b.echoServer.setPort(0);
    }).toThrow(RangeError);
    client.connect('nom.inconnu', 7000);
    net.scheduler.runUntilIdle();
    expect(log.at(-1)).toContain('introuvable');
  });

  test('désinstaller un serveur l’arrête', () => {
    const { net, b } = simpleLan();
    b.install('echoserver');
    b.echoServer.setActive(true);
    net.start();
    expect(b.tcp.listeningPorts).toEqual([55555]);
    b.uninstall('echoserver');
    expect(b.tcp.listeningPorts).toEqual([]);
    expect(b.isInstalled('echoserver')).toBe(false);
  });
});

describe('RIP', () => {
  function chain() {
    const net = new Network();
    const a = staticHost(net, 'A', '10.0.1.10', '10.0.1.1');
    const c = staticHost(net, 'C', '10.0.4.10', '10.0.4.1');
    const routers = [
      ['10.0.1.1', '10.0.2.1'],
      ['10.0.2.2', '10.0.3.1'],
      ['10.0.3.2', '10.0.4.1'],
    ].map(([x, y], i) => {
      const r = net.addRouter({ name: `R${i + 1}` });
      r.setInterface(0, { ip: ip(x ?? ''), mask: MASK_24 });
      r.setInterface(1, { ip: ip(y ?? ''), mask: MASK_24 });
      r.ripService.setEnabled(true);
      return r;
    });
    const [r1, r2, r3] = routers as [(typeof routers)[0], (typeof routers)[0], (typeof routers)[0]];
    net.connect(a.id, r1.id);
    net.connect(r1.id, r2.id);
    net.connect(r2.id, r3.id);
    net.connect(r3.id, c.id);
    return { net, a, c, r1, r2, r3 };
  }

  test('les routeurs apprennent les réseaux distants', () => {
    const { net, a, r1 } = chain();
    net.start();
    net.scheduler.advance(1000);
    const learned = r1.stack.routes().filter((r) => r.source === 'rip');
    expect(learned.map((r) => [formatIp(r.destination), r.metric])).toEqual(
      expect.arrayContaining([
        ['10.0.3.0', 1],
        ['10.0.4.0', 2],
      ]),
    );
    expect(pingFor(net, a, '10.0.4.10')).toMatchObject({ kind: 'reply', ttl: 61 });
  });

  test('une route disparaît quand le lien tombe', () => {
    const { net, r1, r2, r3 } = chain();
    net.start();
    net.scheduler.advance(1000);
    const cable = r3.ports[0]?.cable;
    if (!cable) throw new Error('câble attendu');
    net.disconnect(cable.id);
    net.scheduler.advance(RIP_TIMEOUT * 2);
    expect(r1.stack.routes().some((r) => formatIp(r.destination) === '10.0.4.0')).toBe(false);
    expect(r2.stack.routes().some((r) => formatIp(r.destination) === '10.0.4.0')).toBe(false);
  });

  test('désactiver RIP efface les routes apprises', () => {
    const { net, r1 } = chain();
    net.start();
    net.scheduler.advance(1000);
    r1.ripService.setEnabled(false);
    expect(r1.stack.dynamicRoutes).toHaveLength(0);
    expect(r1.rip).toBe(false);
  });
});
