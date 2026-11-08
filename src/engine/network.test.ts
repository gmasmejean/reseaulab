import { Network } from './network';
import { ip, simpleLan } from './testing';

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
