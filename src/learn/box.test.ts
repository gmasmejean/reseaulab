import { describe, expect, test } from 'vitest';
import { IP_ANY, formatIp } from '../engine/core/ipv4';
import { BOX_LAN, BOX_WAN } from '../engine/devices/box';
import { Network } from '../engine/network';
import { MASK_24, ip, staticHost } from '../engine/testing';
import { parseProject, serializeProject, toProject } from '../project/serialize';
import { evaluateAll } from './activity/evaluate';
import { EMPTY_WORK, activitySchema, familyOf } from './activity/schema';
import { startingNetwork, suggestObjectives } from './activity/suggest';
import type { Finding } from './diagnose/findings';
import { lintNetwork } from './diagnose/lint';
import { describeFinding } from './diagnose/messages.fr';
import { segmentOf, segments, switchLoop } from './diagnose/topology';
import { tracePath } from './diagnose/trace';
import { can } from './profile/capabilities';
import { addressingTable } from './report/addressing';

const codes = (findings: readonly Finding[]) => findings.map((f) => f.code);

/** A home: a box, a computer on a cable (DHCP), a lamp with a fixed address, a phone in Wi-Fi. */
function home() {
  const net = new Network();
  const box = net.addBox({ name: 'Box' });
  const pc = net.addHost('computer', { name: 'PC', config: { useDhcp: true } });
  const lamp = net.addHost('object', {
    name: 'Lampe',
    config: { ip: ip('192.168.1.200'), mask: MASK_24 },
  });
  const phone = net.addHost('smartphone', { name: 'Téléphone', config: { useDhcp: true } });
  net.connect(pc.id, box.id);
  net.connect(lamp.id, box.id);
  net.joinWifi(phone.id, box.ssid);
  return { net, box, pc, lamp, phone };
}

/** The same home, with the provider's router and a server behind the Internet socket. */
function homeAndInternet() {
  const ctx = home();
  const { net, box } = ctx;
  const router = net.addRouter({ name: 'Fournisseur' });
  router.setInterface(0, { ip: ip('10.0.0.1'), mask: MASK_24 });
  router.setInterface(1, { ip: ip('172.16.0.1'), mask: MASK_24 });
  const server = staticHost(net, 'Serveur', '172.16.0.10', '172.16.0.1');
  net.connect(box.id, router.id);
  net.connect(router.id, server.id);
  box.setWan({ ip: ip('10.0.0.2'), mask: MASK_24 });
  box.setGateway(ip('10.0.0.1'));
  return { ...ctx, router, server };
}

describe('Box : structure du réseau', () => {
  test('les prises de la maison forment un seul réseau, la prise Internet un autre', () => {
    const { net, box, pc, lamp, phone, router } = homeAndInternet();
    const all = segments(net);
    const inside = segmentOf(all, box.id, BOX_LAN);
    expect(inside?.members.map((m) => m.deviceId).sort()).toEqual([box.id, pc.id, lamp.id, phone.id].sort());
    const outside = segmentOf(all, box.id, BOX_WAN);
    expect(outside).not.toBe(inside);
    expect(outside?.members.map((m) => m.deviceId).sort()).toEqual([box.id, router.id].sort());
  });

  test('deux câbles entre un switch et la box forment une boucle', () => {
    const net = new Network();
    const box = net.addBox();
    const sw = net.addSwitch();
    net.connect(box.id, sw.id);
    expect(switchLoop(net)).toEqual([]);
    net.connect(box.id, sw.id);
    expect(switchLoop(net).sort()).toEqual([box.id, sw.id].sort());
    expect(codes(lintNetwork(net))).toContain('switch-loop');
  });

  test('un routeur entre la prise Internet et une prise de la maison ne fait pas de boucle', () => {
    const net = new Network();
    const box = net.addBox();
    const router = net.addRouter();
    net.connect(box.id, router.id);
    net.connect(box.id, router.id);
    expect(switchLoop(net)).toEqual([]);
  });
});

describe('Box : vérification du réseau', () => {
  test('une maison bien réglée ne signale rien', () => {
    expect(lintNetwork(home().net)).toEqual([]);
    expect(lintNetwork(homeAndInternet().net).filter((f) => f.severity === 'error')).toEqual([]);
  });

  test('la box compte comme serveur DHCP de la maison, sauf si le sien est arrêté', () => {
    const { net, box, pc, phone } = home();
    box.dhcp.setActive(false);
    const missing = lintNetwork(net).filter((f) => f.code === 'dhcp-no-server');
    expect(missing.map((f) => f.deviceIds[0]).sort()).toEqual([pc.id, phone.id].sort());
  });

  test('pas de serveur DHCP côté Internet', () => {
    const net = new Network();
    const box = net.addBox();
    const outside = net.addHost('computer', { config: { useDhcp: true } });
    net.connect(outside.id, box.id, { portB: BOX_WAN });
    expect(codes(lintNetwork(net))).toContain('dhcp-no-server');
  });

  test('plage d’adresses hors du réseau de la box, ou d’un ordinateur serveur DHCP', () => {
    const { net, box } = home();
    box.dhcp.updateConfig({ rangeStart: ip('10.0.0.10'), rangeEnd: ip('10.0.0.50') });
    const [finding] = lintNetwork(net).filter((f) => f.code === 'dhcp-range-outside');
    expect(finding?.deviceIds).toEqual([box.id]);
    expect(finding?.params).toEqual({ start: '10.0.0.10', end: '10.0.0.50', network: '192.168.1.0/24' });
    if (!finding) throw new Error('constat attendu');
    expect(describeFinding(finding, (id) => net.device(id)?.name ?? '').title).toBe(
      'Box distribue des adresses (10.0.0.10 à 10.0.0.50) qui ne sont pas dans son réseau (192.168.1.0/24)',
    );

    const lan = new Network();
    const server = staticHost(lan, 'Serveur', '192.168.0.1');
    const client = lan.addHost('computer', { config: { useDhcp: true } });
    lan.connect(server.id, client.id);
    server.install('dhcpserver');
    server.dhcpServer.setActive(true);
    // No range yet: nothing to compare.
    expect(codes(lintNetwork(lan))).not.toContain('dhcp-range-outside');
    server.dhcpServer.updateConfig({ rangeStart: ip('192.168.5.10'), rangeEnd: ip('192.168.5.20') });
    expect(codes(lintNetwork(lan))).toContain('dhcp-range-outside');
    server.dhcpServer.updateConfig({ rangeStart: ip('192.168.0.10'), rangeEnd: ip('192.168.0.20') });
    expect(codes(lintNetwork(lan))).not.toContain('dhcp-range-outside');
  });

  test('changer l’adresse de la box déplace la plage avec elle', () => {
    const { net, box } = home();
    box.setLan({ ip: ip('192.168.50.254'), mask: MASK_24 });
    expect(formatIp(box.dhcp.config.rangeStart)).toBe('192.168.50.10');
    expect(formatIp(box.dhcp.config.rangeEnd)).toBe('192.168.50.50');
    expect(codes(lintNetwork(net))).not.toContain('dhcp-range-outside');
    // A range chosen outside on purpose is left alone.
    box.dhcp.updateConfig({ rangeStart: ip('10.0.0.1'), rangeEnd: ip('10.0.0.9') });
    box.setLan({ ip: ip('192.168.1.1'), mask: MASK_24 });
    expect(formatIp(box.dhcp.config.rangeStart)).toBe('10.0.0.1');
    // Without address, nothing can follow.
    box.setLan({ ip: IP_ANY, mask: IP_ANY });
    expect(box.dhcp.config.gateway).toBe(IP_ANY);
  });

  test('côté Internet câblé sans adresse, passerelle hors réseau, deux côtés dans le même réseau', () => {
    const { net, box } = homeAndInternet();
    box.setWan({ ip: IP_ANY, mask: IP_ANY });
    const [unset] = lintNetwork(net).filter((f) => f.code === 'router-iface-unconfigured');
    expect(unset?.params).toEqual({ iface: 'Internet' });

    box.setWan({ ip: ip('10.0.0.2'), mask: MASK_24 });
    box.setGateway(ip('10.9.9.9'));
    const [outside] = lintNetwork(net).filter((f) => f.code === 'gateway-outside');
    expect(outside?.deviceIds).toEqual([box.id]);
    expect(outside?.params.gateway).toBe('10.9.9.9');

    box.setGateway(IP_ANY);
    box.setWan({ ip: ip('192.168.1.2'), mask: MASK_24 });
    const [same] = lintNetwork(net).filter((f) => f.code === 'router-ifaces-same-network');
    expect(same?.params).toEqual({ a: 'Internet', b: 'Maison', network: '192.168.1.0/24' });
  });

  test('une passerelle n’est réclamée aux terminaux que si la box mène quelque part', () => {
    const alone = home();
    expect(codes(lintNetwork(alone.net))).not.toContain('gateway-missing');
    const linked = homeAndInternet();
    const missing = lintNetwork(linked.net).filter((f) => f.code === 'gateway-missing');
    expect(missing.map((f) => f.deviceIds[0])).toEqual([linked.lamp.id]);
    linked.lamp.updateConfig({ gateway: ip('192.168.1.1') });
    expect(codes(lintNetwork(linked.net))).not.toContain('gateway-missing');
  });
});

describe('Box : pourquoi ça ne marche pas ?', () => {
  test('dans la maison, tout communique', () => {
    const { net, pc, lamp, phone, box } = home();
    expect(tracePath(net, pc.id, { kind: 'device', id: lamp.id }).ok).toBe(true);
    expect(tracePath(net, phone.id, { kind: 'text', text: '192.168.1.1' }).ok).toBe(true);
    expect(tracePath(net, box.id, { kind: 'device', id: pc.id }).ok).toBe(true);
  });

  test('vers Internet : le routeur d’en face doit connaître le chemin du retour', () => {
    const { net, pc, box, router, server } = homeAndInternet();
    const lost = tracePath(net, pc.id, { kind: 'device', id: server.id });
    expect(lost.ok).toBe(false);
    expect(codes(lost.findings)).toEqual(['trace-router-no-return-route']);
    expect(lost.findings[0]?.deviceIds).toEqual([router.id]);
    router.setStaticRoutes([
      { destination: ip('192.168.1.0'), mask: MASK_24, gateway: ip('10.0.0.2'), iface: 0 },
    ]);
    const found = tracePath(net, pc.id, { kind: 'device', id: server.id });
    expect(found.ok).toBe(true);
    expect(found.reached).toEqual([pc.id, box.id, router.id, server.id]);
  });

  test('avec RIP des deux côtés, la route du retour est apprise toute seule', () => {
    const { net, pc, box, router, server } = homeAndInternet();
    box.ripService.setEnabled(true);
    router.ripService.setEnabled(true);
    expect(tracePath(net, pc.id, { kind: 'device', id: server.id }).ok).toBe(true);
  });

  test('sans passerelle vers Internet, la box ne sait pas où envoyer', () => {
    const { net, pc, box, server } = homeAndInternet();
    box.setGateway(IP_ANY);
    const result = tracePath(net, pc.id, { kind: 'device', id: server.id });
    expect(codes(result.findings)).toEqual(['trace-router-no-route']);
    expect(result.findings[0]?.deviceIds).toEqual([box.id]);
  });
});

describe('Box : activités, compte rendu, fichier, profils', () => {
  test('table d’adressage : une ligne par côté de la box', () => {
    const { net, box } = homeAndInternet();
    const rows = addressingTable(net).filter((r) => r.deviceId === box.id);
    expect(rows.map((r) => [r.iface, r.link, r.ip, r.gateway])).toEqual([
      ['Internet', 'Fournisseur', '10.0.0.2', '10.0.0.1'],
      ['Maison', 'PC, Lampe, Téléphone (Wi-Fi)', '192.168.1.1', ''],
    ]);
    const phone = addressingTable(net).find((r) => r.name === 'Téléphone');
    expect([phone?.link, phone?.mode]).toEqual(['Wi-Fi « Box-1 » (Box)', 'automatique (DHCP)']);
    const lonely = new Network();
    lonely.addBox();
    expect(addressingTable(lonely).map((r) => r.link)).toEqual(['non relié', 'non relié']);
  });

  test('objectifs proposés et vérifiés sur un réseau avec box', () => {
    const { net } = home();
    const all = suggestObjectives(net);
    const labels = all.map((s) => s.label);
    // What the pupil did (commands, simulation) is not in the network itself.
    const suggestions = all.filter((s) => familyOf(s.check) !== 'journal');
    expect(labels).toContain('Le plan contient 1 box internet');
    expect(labels).toContain('PC est relié à Box');
    const activity = activitySchema.parse({
      id: 'maison',
      title: 'Maison',
      level: '5e',
      steps: [
        {
          id: 'e',
          title: 'Étape',
          objectives: suggestions.map((s, i) => ({ id: `o${i}`, label: s.label, check: s.check })),
        },
      ],
    });
    const outcomes = [...evaluateAll(activity, net, EMPTY_WORK).values()];
    expect(outcomes.every((o) => o.status === 'done')).toBe(true);
  });

  test('réseau de départ « sans les adresses » : la box garde ses réglages d’origine côté maison', () => {
    const { net, box } = homeAndInternet();
    const start = startingNetwork(net, 'no-addresses');
    const copy = start.box(box.id);
    expect(copy.wan.ip).toBe(IP_ANY);
    expect(copy.gateway).toBe(IP_ANY);
    expect(formatIp(copy.lan.ip)).toBe('192.168.1.1');
    // The teacher's network is untouched.
    expect(formatIp(box.wan.ip)).toBe('10.0.0.2');
  });

  test('aller-retour par le fichier sans perte, câbles et Wi-Fi compris', () => {
    const { net, box, phone } = homeAndInternet();
    box.dhcp.updateConfig({ dns: ip('172.16.0.10') });
    box.rip = true;
    net.setSsid(box.id, 'Maison');
    net.joinWifi(phone.id, 'Maison');
    const text = serializeProject(net);
    const loaded = parseProject(text);
    expect(serializeProject(loaded)).toBe(text);
    const copy = loaded.box(box.id);
    expect(copy.ssid).toBe('Maison');
    expect(copy.rip).toBe(true);
    expect(copy.wanPort.isConnected).toBe(true);
    expect(loaded.wifiAccessPoint(loaded.host(phone.id))).toBe(copy);
    expect(formatIp(copy.dhcp.config.dns)).toBe('172.16.0.10');
  });

  test('fichier refusé : nom Wi-Fi en double, adresse MAC en double', () => {
    const net = new Network();
    net.addBox({ ssid: 'Maison' });
    net.addBox({ ssid: 'Voisin' });
    const project = toProject(net);
    const [first, second] = project.devices;
    if (first?.kind !== 'box' || second?.kind !== 'box') throw new Error('deux box attendues');
    const sameSsid = { ...project, devices: [first, { ...second, ssid: 'Maison' }] };
    expect(() => parseProject(JSON.stringify(sameSsid))).toThrow(/Box « Box 2 »/);
    const sameMac = {
      ...project,
      devices: [first, { ...second, lan: { ...second.lan, mac: first.wan.mac } }],
    };
    expect(() => parseProject(JSON.stringify(sameMac))).toThrow(/MAC en double/);
  });

  test('la box est proposée dès la 5e', () => {
    expect(can({ base: '5e' }, 'device:box')).toBe(true);
    expect(can({ base: '5e', hide: ['device:box'] }, 'device:box')).toBe(false);
  });
});
