import { formatIp } from '../core/ipv4';
import { MAC_BROADCAST } from '../core/mac';
import { ConnectError, Network } from '../network';
import { MASK_24, ip, ping, routedNetwork, simpleLan, staticHost } from '../testing';
import { lookupRoute } from './routing';

describe('Couche liaison', () => {
  test('le switch apprend les adresses MAC et le ping fonctionne', () => {
    const { net, a, b, sw } = simpleLan();
    net.start();
    const result = ping(net, a, '192.168.0.2');
    expect(result).toMatchObject({ kind: 'reply', from: ip('192.168.0.2'), ttl: 64 });
    expect(sw.macTable).toEqual(
      expect.arrayContaining([
        { mac: a.mac, port: 0 },
        { mac: b.mac, port: 1 },
      ]),
    );
    const kinds = a.capture.entries.map((e) =>
      e.frame.payload.kind === 'arp' ? `arp-${e.frame.payload.op}` : e.frame.payload.payload.kind,
    );
    expect(kinds).toEqual(['arp-request', 'arp-reply', 'icmp', 'icmp']);
    expect(a.capture.entries[0]?.frame.dst).toBe(MAC_BROADCAST);
    expect(a.stack.arp.lookup(ip('192.168.0.2'))).toBe(b.mac);
    expect(b.stack.arp.lookup(ip('192.168.0.1'))).toBe(a.mac);
  });

  test('une trame connue n’est envoyée que sur le bon port', () => {
    const { net, a, b } = simpleLan();
    const c = staticHost(net, 'C', '192.168.0.3');
    net.connect(c.id, net.devices.find((d) => d.kind === 'switch')?.id ?? '');
    net.start();
    ping(net, a, '192.168.0.2');
    const seenByC = c.capture.entries.length;
    ping(net, a, '192.168.0.2');
    expect(c.capture.entries.length).toBe(seenByC);
    expect(seenByC).toBe(1); // only the broadcast ARP request reached C
    expect(b.capture.entries.length).toBeGreaterThan(2);
  });

  test('deux ordinateurs reliés directement par un câble', () => {
    const net = new Network();
    const a = staticHost(net, 'A', '10.0.0.1');
    staticHost(net, 'B', '10.0.0.2');
    net.connect(a.id, 'n2');
    net.start();
    expect(ping(net, a, '10.0.0.2').kind).toBe('reply');
  });

  test('ARP sans réponse : hôte inaccessible après 3 essais', () => {
    const { net, a } = simpleLan();
    net.start();
    const result = ping(net, a, '192.168.0.99');
    expect(result).toEqual({ kind: 'unreachable', from: ip('192.168.0.1'), code: 'host' });
    const arpRequests = a.capture.entries.filter((e) => e.frame.payload.kind === 'arp');
    expect(arpRequests).toHaveLength(3);
  });

  test('un câble débranché ne transmet plus rien', () => {
    const { net, a, b } = simpleLan();
    net.start();
    const cable = b.ports[0]?.cable;
    if (!cable) throw new Error('câble attendu');
    net.disconnect(cable.id);
    expect(ping(net, a, '192.168.0.2').kind).not.toBe('reply');
    expect(b.capture.entries).toHaveLength(0);
  });

  test('erreurs de câblage', () => {
    const { net, a, sw } = simpleLan();
    expect(() => net.connect(a.id, a.id)).toThrow(ConnectError);
    expect(() => net.connect(a.id, sw.id)).toThrow(/plus de port libre/);
    expect(() => net.connect(a.id, 'inconnu')).toThrow(ConnectError);
    expect(() => net.connect(sw.id, a.id)).toThrow(/plus de port libre/);
  });

  test('le switch ajoute des ports à la demande', () => {
    const net = new Network();
    const sw = net.addSwitch({ ports: 1 });
    for (let i = 0; i < 3; i++) net.connect(net.addHost().id, sw.id);
    expect(sw.ports).toHaveLength(3);
  });

  test('arrêter la simulation efface ARP, table SAT et captures', () => {
    const { net, a, sw } = simpleLan();
    net.start();
    ping(net, a, '192.168.0.2');
    net.stop();
    expect(a.stack.arp.entries).toHaveLength(0);
    expect(sw.macTable).toHaveLength(0);
    expect(a.capture.entries).toHaveLength(0);
  });
});

describe('Couche réseau', () => {
  test('ping à travers un routeur ; TTL décrémenté', () => {
    const { net, a } = routedNetwork();
    net.start();
    expect(ping(net, a, '192.168.2.10')).toMatchObject({ kind: 'reply', ttl: 63 });
    expect(ping(net, a, '192.168.2.1')).toMatchObject({ kind: 'reply', ttl: 64 });
  });

  test('sans passerelle, pas de route vers un autre réseau', () => {
    const { net, a } = routedNetwork();
    a.updateConfig({ gateway: 0 });
    net.start();
    expect(ping(net, a, '192.168.2.10')).toEqual({ kind: 'no-route' });
  });

  test('passerelle hors du réseau local : ignorée', () => {
    const { net, a } = routedNetwork();
    a.updateConfig({ gateway: ip('10.0.0.1') });
    expect(a.stack.routes().some((r) => r.source === 'default')).toBe(false);
    net.start();
    expect(ping(net, a, '192.168.2.10').kind).toBe('no-route');
  });

  test('TTL épuisé : le routeur répond « délai dépassé »', () => {
    const { net, a } = routedNetwork();
    net.start();
    expect(ping(net, a, '192.168.2.10', 1)).toMatchObject({ kind: 'time-exceeded', from: ip('192.168.1.1') });
  });

  test('réseau inconnu du routeur : destination inaccessible', () => {
    const { net, a } = routedNetwork();
    net.start();
    expect(ping(net, a, '172.16.0.1')).toEqual({ kind: 'unreachable', from: ip('192.168.1.1'), code: 'net' });
  });

  test('hôte absent derrière le routeur : hôte inaccessible', () => {
    const { net, a } = routedNetwork();
    net.start();
    expect(ping(net, a, '192.168.2.99')).toEqual({
      kind: 'unreachable',
      from: ip('192.168.1.1'),
      code: 'host',
    });
  });

  test('boucle locale et adresse propre', () => {
    const { net, a } = routedNetwork();
    net.start();
    expect(ping(net, a, '127.0.0.1').kind).toBe('reply');
    expect(ping(net, a, '192.168.1.10').kind).toBe('reply');
    expect(a.capture.entries).toHaveLength(0);
  });

  test('routes statiques entre trois réseaux', () => {
    const net = new Network();
    const a = staticHost(net, 'A', '10.0.1.10', '10.0.1.1');
    const c = staticHost(net, 'C', '10.0.3.10', '10.0.3.1');
    const r1 = net.addRouter({ name: 'R1' });
    const r2 = net.addRouter({ name: 'R2' });
    r1.setInterface(0, { ip: ip('10.0.1.1'), mask: MASK_24 });
    r1.setInterface(1, { ip: ip('10.0.2.1'), mask: MASK_24 });
    r2.setInterface(0, { ip: ip('10.0.2.2'), mask: MASK_24 });
    r2.setInterface(1, { ip: ip('10.0.3.1'), mask: MASK_24 });
    net.connect(a.id, r1.id);
    net.connect(r1.id, r2.id);
    net.connect(r2.id, c.id);
    net.start();
    expect(ping(net, a, '10.0.3.10').kind).toBe('unreachable');
    r1.setStaticRoutes([{ destination: ip('10.0.3.0'), mask: MASK_24, gateway: ip('10.0.2.2'), iface: 1 }]);
    r2.setStaticRoutes([{ destination: ip('10.0.1.0'), mask: MASK_24, gateway: ip('10.0.2.1'), iface: 0 }]);
    expect(ping(net, a, '10.0.3.10')).toMatchObject({ kind: 'reply', ttl: 62 });
    expect(r1.staticRoutes).toHaveLength(1);
  });

  test('un ping vers la diffusion n’obtient pas de réponse', () => {
    const { net, a } = simpleLan();
    net.start();
    expect(ping(net, a, '192.168.0.255').kind).toBe('timeout');
  });

  test('plus long préfixe puis métrique', () => {
    const routes = [
      { destination: 0, mask: 0, gateway: ip('1.1.1.1'), iface: 0, metric: 1, source: 'default' as const },
      {
        destination: ip('10.0.0.0'),
        mask: ip('255.0.0.0'),
        gateway: 0,
        iface: 1,
        metric: 5,
        source: 'rip' as const,
      },
      {
        destination: ip('10.0.0.0'),
        mask: ip('255.0.0.0'),
        gateway: 0,
        iface: 2,
        metric: 2,
        source: 'rip' as const,
      },
      {
        destination: ip('10.1.0.0'),
        mask: ip('255.255.0.0'),
        gateway: 0,
        iface: 3,
        metric: 9,
        source: 'rip' as const,
      },
    ];
    expect(lookupRoute(routes, ip('10.1.2.3'))?.iface).toBe(3);
    expect(lookupRoute(routes, ip('10.2.2.3'))?.iface).toBe(2);
    expect(lookupRoute(routes, ip('8.8.8.8'))?.iface).toBe(0);
    expect(lookupRoute(routes.slice(1), ip('8.8.8.8'))).toBeNull();
  });

  test('un routeur doit avoir entre 2 et 8 interfaces', () => {
    const net = new Network();
    expect(() => net.addRouter({ interfaces: 1 })).toThrow(RangeError);
    expect(() => net.addRouter({ interfaces: 9 })).toThrow(RangeError);
    expect(net.addRouter({ interfaces: 4 }).interfaces).toHaveLength(4);
    expect(() => {
      net.addRouter().setInterface(5, { ip: 0, mask: 0 });
    }).toThrow(RangeError);
  });

  test('table de routage d’un poste', () => {
    const { a } = routedNetwork();
    expect(a.stack.routes().map((r) => [formatIp(r.destination), formatIp(r.gateway), r.source])).toEqual([
      ['192.168.1.0', '0.0.0.0', 'connected'],
      ['0.0.0.0', '192.168.1.1', 'default'],
    ]);
  });
});
