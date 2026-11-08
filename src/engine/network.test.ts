import { Network } from './network';
import { MASK_24, ip, ping, routedNetwork, simpleLan, staticHost } from './testing';

describe('Network', () => {
  test('noms et identifiants par défaut', () => {
    const net = new Network();
    const a = net.addHost();
    const b = net.addHost('laptop');
    const c = net.addHost();
    expect([a.name, b.name, c.name]).toEqual(['Ordinateur 1', 'Portable 1', 'Ordinateur 2']);
    expect(net.addSwitch().name).toBe('Switch 1');
    expect(net.addRouter().name).toBe('Routeur 1');
    expect(new Set(net.devices.map((d) => d.id)).size).toBe(5);
  });

  test('identifiants imposés (chargement de projet)', () => {
    const net = new Network();
    net.addHost('computer', { id: 'n7', mac: '02:00:00:00:00:99' });
    expect(net.addHost().id).toBe('n8');
    expect(() => net.addHost('computer', { id: 'n7' })).toThrow(/double/);
    const r = net.addRouter({ macs: ['02:00:00:00:01:01', '02:00:00:00:01:02'] });
    expect(r.ports.map((p) => p.mac)).toEqual(['02:00:00:00:01:01', '02:00:00:00:01:02']);
  });

  test('renommer, déplacer, supprimer', () => {
    const { net, a, b, sw } = simpleLan();
    let changes = 0;
    net.events.on('change', () => changes++);
    net.rename(a.id, '  Poste élève  ');
    net.rename(a.id, '   ');
    net.rename('absent', 'x');
    expect(a.name).toBe('Poste élève');
    net.move(a.id, { x: 10, y: 20 });
    net.move('absent', { x: 0, y: 0 });
    expect(a.position).toEqual({ x: 10, y: 20 });
    expect(net.cables).toHaveLength(2);
    net.removeDevice(sw.id);
    net.removeDevice('absent');
    expect(net.cables).toHaveLength(0);
    expect(b.ports[0]?.cable).toBeNull();
    expect(net.device(sw.id)).toBeUndefined();
    expect(changes).toBeGreaterThan(3);
    net.disconnect('absent');
  });

  test('accès typés', () => {
    const { net, a, sw } = simpleLan();
    expect(net.host(a.id)).toBe(a);
    expect(() => net.host(sw.id)).toThrow();
    expect(() => net.router(a.id)).toThrow();
    const r = net.addRouter();
    expect(net.router(r.id)).toBe(r);
    const cable = net.cables[0];
    expect(cable && net.cable(cable.id)?.other(a.ports[0] ?? sw.ports[0]!)).toBeDefined(); // eslint-disable-line @typescript-eslint/no-non-null-assertion
  });

  test('événements de transmission et mode simulation', () => {
    const { net, a } = simpleLan();
    const sent: string[] = [];
    net.events.on('transmit', (e) => sent.push(e.from));
    expect(net.running).toBe(false);
    net.start();
    net.start();
    expect(net.running).toBe(true);
    a.stack.icmp.ping(ip('192.168.0.2'), {}, () => undefined);
    net.scheduler.runUntilIdle();
    expect(sent[0]).toBe(a.id);
    const added = net.addHost();
    expect(added.simulating).toBe(true);
    net.stop();
    net.stop();
    expect(added.simulating).toBe(false);
    expect(net.version).toBeGreaterThan(0);
  });
});

describe('Interfaces d’un routeur', () => {
  test('ajoute des interfaces jusqu’à 8, avec des adresses MAC uniques', () => {
    const net = new Network();
    const r = net.addRouter();
    for (let i = 2; i < 8; i++) net.addRouterInterface(r.id);
    expect(r.interfaces).toHaveLength(8);
    expect(r.ports.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(r.ports.map((p) => p.mac)).size).toBe(8);
    expect(r.canAddInterface).toBe(false);
    expect(() => {
      net.addRouterInterface(r.id);
    }).toThrow(/au plus 8/);
    expect(r.interfaces[7]?.ip).toBe(ip('0.0.0.0'));
  });

  test('garde au moins 2 interfaces et refuse les modifications en simulation', () => {
    const net = new Network();
    const r = net.addRouter();
    expect(r.canRemoveInterface).toBe(false);
    expect(() => {
      net.removeRouterInterface(r.id, 0);
    }).toThrow(/au moins 2/);
    net.addRouterInterface(r.id);
    expect(() => {
      net.removeRouterInterface(r.id, 5);
    }).toThrow(/inexistante/);
    net.start();
    expect(() => {
      net.addRouterInterface(r.id);
    }).toThrow(/simulation/);
    expect(() => {
      net.removeRouterInterface(r.id, 2);
    }).toThrow(/simulation/);
    net.stop();
    expect(() => {
      r.removeInterface(9);
    }).toThrow(/inexistante/);
  });

  test('retirer une interface supprime son câble, renumérote les suivantes et leurs routes', () => {
    const { net, a, b, r, s2 } = routedNetwork();
    // eth2 vers un troisième réseau, puis on retire eth1 (vers B).
    net.addRouterInterface(r.id);
    r.setInterface(2, { ip: ip('10.0.3.1'), mask: MASK_24 });
    const c = staticHost(net, 'C', '10.0.3.10', '10.0.3.1');
    const s3 = net.addSwitch();
    net.connect(c.id, s3.id);
    net.connect(r.id, s3.id, { portA: 2 });
    r.setStaticRoutes([
      { destination: ip('172.16.0.0'), mask: MASK_24, gateway: ip('192.168.2.254'), iface: 1 },
      { destination: ip('172.17.0.0'), mask: MASK_24, gateway: ip('10.0.3.254'), iface: 2 },
    ]);
    const removedMac = r.ports[1]?.mac;
    net.removeRouterInterface(r.id, 1);

    expect(r.interfaces.map((i) => i.ip)).toEqual([ip('192.168.1.1'), ip('10.0.3.1')]);
    expect(r.ports.map((p) => p.index)).toEqual([0, 1]);
    expect(r.staticRoutes).toEqual([expect.objectContaining({ destination: ip('172.17.0.0'), iface: 1 })]);
    expect(
      net.cables.some((cable) => [cable.a, cable.b].includes(r.id) && [cable.a, cable.b].includes(s2.id)),
    ).toBe(false);
    expect(net.cables).toContainEqual(expect.objectContaining({ a: r.id, portA: 1, b: s3.id }));
    expect(r.ports.some((p) => p.mac === removedMac)).toBe(false);

    net.start();
    expect(ping(net, a, '10.0.3.10').kind).toBe('reply');
    expect(ping(net, a, '192.168.2.10').kind).not.toBe('reply');
    expect(ping(net, b, '192.168.2.1').kind).not.toBe('reply');
  });

  test('refuse de retirer directement une interface encore câblée', () => {
    const { r } = routedNetwork();
    r.addInterface('02:00:00:00:09:09');
    expect(() => {
      r.removeInterface(0);
    }).toThrow(/câble/);
  });
});
