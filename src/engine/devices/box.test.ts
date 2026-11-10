import { describe, expect, test } from 'vitest';
import { formatIp } from '../core/ipv4';
import { ConnectError, Network } from '../network';
import { RIP_INTERVAL } from '../services/rip';
import { MASK_24, ip, ping, pingFor, staticHost } from '../testing';
import { BOX_DEFAULTS, BOX_LAN, BOX_LAN_PORTS, BOX_WAN } from './box';

/** A box with two wired computers and a smartphone in Wi-Fi, all addressed by DHCP. */
function home() {
  const net = new Network();
  const box = net.addBox({ name: 'Box' });
  const pc = net.addHost('computer', { name: 'PC', config: { useDhcp: true } });
  const lamp = net.addHost('object', { name: 'Lampe', config: { useDhcp: true } });
  const phone = net.addHost('smartphone', { name: 'Téléphone', config: { useDhcp: true } });
  net.connect(pc.id, box.id);
  net.connect(lamp.id, box.id);
  net.joinWifi(phone.id, box.ssid);
  return { net, box, pc, lamp, phone };
}

/** Home — box — router of the provider — web server. */
function homeAndInternet() {
  const { net, box, pc, lamp, phone } = home();
  const router = net.addRouter({ name: 'Fournisseur' });
  router.setInterface(0, { ip: ip('10.0.0.1'), mask: MASK_24 });
  router.setInterface(1, { ip: ip('172.16.0.1'), mask: MASK_24 });
  const server = staticHost(net, 'Serveur', '172.16.0.10', '172.16.0.1');
  net.connect(box.id, router.id);
  net.connect(router.id, server.id);
  box.setWan({ ip: ip('10.0.0.2'), mask: MASK_24 });
  box.setGateway(ip('10.0.0.1'));
  return { net, box, pc, lamp, phone, router, server };
}

describe('box : un nouvel équipement', () => {
  test('a une prise Internet, des prises pour la maison et un réseau Wi-Fi', () => {
    const net = new Network();
    const box = net.addBox();
    expect(box.kind).toBe('box');
    expect(box.name).toBe('Box 1');
    expect(box.ssid).toBe('Box-1');
    expect(box.ports).toHaveLength(1 + BOX_LAN_PORTS);
    expect(box.wanPort.index).toBe(BOX_WAN);
    expect(box.homePorts).toHaveLength(BOX_LAN_PORTS);
    expect(net.addBox().ssid).toBe('Box-2');
    expect(net.box(box.id)).toBe(box);
    expect(() => net.box('inconnu')).toThrow();
  });

  test('est réglée comme à la maison : 192.168.1.1 et un serveur DHCP en marche', () => {
    const box = new Network().addBox();
    expect(formatIp(box.lan.ip)).toBe('192.168.1.1');
    expect(box.lan.mask).toBe(MASK_24);
    expect(box.wan.ip).toBe(0);
    expect(box.iface).toBe(box.lan);
    expect(box.interfaces).toHaveLength(2);
    expect(box.dhcp.active).toBe(true);
    expect(box.dhcp.config.rangeStart).toBe(BOX_DEFAULTS.rangeStart);
    expect(box.dhcp.config.gateway).toBe(box.lan.ip);
  });

  test('changer son adresse change la passerelle distribuée', () => {
    const box = new Network().addBox();
    box.setLan({ ip: ip('192.168.5.254'), mask: MASK_24 });
    expect(formatIp(box.dhcp.config.gateway)).toBe('192.168.5.254');
  });

  test('sa suppression retire aussi ses câbles et ses liaisons Wi-Fi', () => {
    const net = new Network();
    const box = net.addBox();
    net.connect(net.addHost().id, box.id);
    net.joinWifi(net.addHost('tablet').id, box.ssid);
    net.connect(box.id, net.addRouter().id);
    expect(net.cables).toHaveLength(3);
    net.removeDevice(box.id);
    expect(net.cables).toEqual([]);
    expect(net.accessPoints).toEqual([]);
  });

  test('refuse un nom Wi-Fi déjà pris par un switch', () => {
    const net = new Network();
    const sw = net.addSwitch({ ssid: 'Maison' });
    expect(() => net.addBox({ ssid: 'Maison' })).toThrow(/déjà utilisé/);
    const box = net.addBox();
    expect(net.ssidProblem('Maison', box.id)).toMatch(/déjà utilisé/);
    net.setSsid(box.id, 'Chez moi');
    expect(net.accessPointBySsid('Chez moi')).toBe(box);
    expect(net.accessPoints).toEqual([sw, box]);
  });
});

describe('box : câblage', () => {
  test('un terminal ou un switch se branche côté maison, un routeur côté Internet', () => {
    const net = new Network();
    const box = net.addBox();
    const pc = net.addHost();
    const sw = net.addSwitch();
    const router = net.addRouter();
    expect(net.connect(pc.id, box.id).b.index).toBe(1);
    expect(net.connect(box.id, sw.id).a.index).toBe(2);
    expect(net.connect(box.id, router.id).a).toBe(box.wanPort);
    // The Internet socket is taken: a second router goes to the home side.
    expect(net.connect(net.addRouter().id, box.id).b.index).toBe(3);
  });

  test('deux box se relient par leur prise Internet', () => {
    const net = new Network();
    const a = net.addBox();
    const b = net.addBox();
    const cable = net.connect(a.id, b.id);
    expect(cable.a).toBe(a.wanPort);
    expect(cable.b).toBe(b.wanPort);
  });

  test('de nouvelles prises apparaissent quand toutes sont utilisées', () => {
    const net = new Network();
    const box = net.addBox();
    for (let i = 0; i < BOX_LAN_PORTS + 2; i++) net.connect(net.addHost().id, box.id);
    expect(box.homePorts).toHaveLength(BOX_LAN_PORTS + 2);
    expect(box.wanPort.isConnected).toBe(false);
    expect(box.portAt(12)?.index).toBe(12);
    expect(box.portAt(-1)).toBeNull();
    expect(box.portAt(300)).toBeNull();
  });

  test('le Wi-Fi rejoint la box, jamais sa prise Internet', () => {
    const net = new Network();
    const box = net.addBox();
    const phone = net.addHost('smartphone');
    const tablet = net.addHost('tablet');
    const link = net.joinWifi(phone.id, box.ssid);
    expect(link.wireless).toBe(true);
    expect(net.wifiAccessPoint(phone)).toBe(box);
    expect(phone.wifiNetwork).toBe(box.ssid);
    expect(() => net.connect(tablet.id, box.id, { portB: BOX_WAN })).toThrow(ConnectError);
    // Renaming the Wi-Fi network disconnects its terminals, as with a switch.
    net.setSsid(box.id, 'Nouveau');
    expect(net.wifiAccessPoint(phone)).toBeNull();
  });
});

describe('box : réseau de la maison', () => {
  test('distribue les adresses, la passerelle et rien d’autre', () => {
    const { net, box, pc, lamp, phone } = home();
    net.start();
    net.scheduler.runUntilIdle();
    expect([pc, lamp, phone].map((h) => h.dhcpClient.status)).toEqual(['bound', 'bound', 'bound']);
    expect([pc, lamp, phone].map((h) => formatIp(h.iface.ip)).sort()).toEqual([
      '192.168.1.10',
      '192.168.1.11',
      '192.168.1.12',
    ]);
    expect(formatIp(pc.addressing.gateway)).toBe('192.168.1.1');
    expect(box.dhcp.leases).toHaveLength(3);
  });

  test('les terminaux communiquent entre eux et avec la box', () => {
    const { net, box, pc, lamp, phone } = home();
    net.start();
    net.scheduler.runUntilIdle();
    expect(ping(net, pc, formatIp(lamp.iface.ip)).kind).toBe('reply');
    expect(ping(net, phone, formatIp(pc.iface.ip)).kind).toBe('reply');
    expect(ping(net, pc, '192.168.1.1').kind).toBe('reply');
    expect(ping(net, box, formatIp(phone.iface.ip)).kind).toBe('reply');
  });

  test('retient derrière quelle prise se trouve chaque terminal', () => {
    const { net, box, pc, lamp } = home();
    net.start();
    net.scheduler.runUntilIdle();
    expect(box.macTable).toContainEqual({ mac: pc.mac, port: 1 });
    expect(box.macTable).toContainEqual({ mac: lamp.mac, port: 2 });
    net.stop();
    expect(box.macTable).toEqual([]);
    expect(box.dhcp.leases).toEqual([]);
  });

  test('une trame entre deux terminaux ne passe pas par la box elle-même', () => {
    const { net, box, pc, lamp } = home();
    net.start();
    net.scheduler.runUntilIdle();
    const before = box.capture.entries.length;
    ping(net, pc, formatIp(lamp.iface.ip));
    // Only the ARP broadcast reaches the box itself; the ping is switched.
    const seen = box.capture.entries.slice(before);
    expect(seen.every((e) => e.frame.payload.kind === 'arp')).toBe(true);
    expect(seen.every((e) => e.iface === BOX_LAN)).toBe(true);
  });

  test('sans serveur DHCP, les terminaux n’obtiennent rien', () => {
    const { net, box, pc } = home();
    box.dhcp.setActive(false);
    net.start();
    net.scheduler.runUntilIdle();
    expect(pc.dhcpClient.status).toBe('failed');
  });

  test('une box sans rien de branché abandonne faute de liaison', () => {
    const net = new Network();
    const box = net.addBox();
    const reasons: string[] = [];
    net.events.on('drop', (drop) => reasons.push(drop.reason));
    net.start();
    expect(ping(net, box, '192.168.1.20').kind).toBe('unreachable');
    expect(reasons).toEqual(['no-link']);
  });
});

describe('box : vers Internet', () => {
  test('relaie entre la maison et Internet quand le routeur connaît le chemin du retour', () => {
    const { net, box, pc, router } = homeAndInternet();
    net.start();
    net.scheduler.runUntilIdle();
    // Without address translation, the provider must know where the home network is.
    expect(ping(net, pc, '172.16.0.10').kind).toBe('timeout');
    router.setStaticRoutes([
      { destination: ip('192.168.1.0'), mask: MASK_24, gateway: ip('10.0.0.2'), iface: 0 },
    ]);
    const result = ping(net, pc, '172.16.0.10');
    expect(result.kind).toBe('reply');
    // Two routers on the way: the box and the provider.
    expect(result.kind === 'reply' && result.ttl).toBe(62);
    expect(box.capture.entries.some((e) => e.iface === BOX_WAN && e.direction === 'out')).toBe(true);
    expect(box.capture.entries.some((e) => e.verdict === 'forwarded')).toBe(true);
    expect(box.gateway).toBe(ip('10.0.0.1'));
  });

  test('ne distribue pas d’adresses côté Internet', () => {
    const net = new Network();
    const box = net.addBox();
    const outside = net.addHost('computer', { name: 'Dehors', config: { useDhcp: true } });
    net.connect(outside.id, box.id, { portB: BOX_WAN });
    box.setWan({ ip: ip('10.0.0.2'), mask: MASK_24 });
    net.start();
    net.scheduler.runUntilIdle();
    expect(outside.dhcpClient.status).toBe('failed');
    expect(box.dhcp.leases).toEqual([]);
  });

  test('avec RIP, la box annonce le réseau de la maison', () => {
    const { net, box, pc, router } = homeAndInternet();
    box.ripService.setEnabled(true);
    router.ripService.setEnabled(true);
    net.start();
    net.scheduler.advance(2 * RIP_INTERVAL);
    expect(router.stack.routes().some((r) => r.source === 'rip' && r.destination === ip('192.168.1.0'))).toBe(
      true,
    );
    expect(pingFor(net, pc, '172.16.0.10')?.kind).toBe('reply');
    net.stop();
    expect(box.stack.dynamicRoutes).toEqual([]);
  });
});
