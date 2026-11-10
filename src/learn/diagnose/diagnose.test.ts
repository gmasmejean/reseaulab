import { IP_ANY } from '../../engine/core/ipv4';
import { Network } from '../../engine/network';
import { MASK_24, ip, routedNetwork, simpleLan, staticHost } from '../../engine/testing';
import { exampleNetwork } from '../../project/example';
import { serializeProject } from '../../project/serialize';
import { MAX_EVENTS, prepareProbe, runBounded } from '../sim/probe';
import { LINT_CODES, TRACE_CODES, bySeverity, worstFor, type Finding, type FindingCode } from './findings';
import { lintNetwork } from './lint';
import { MESSAGES, describeFinding, enumerate } from './messages.fr';
import { attachments, segmentOf, segments, switchLoop } from './topology';
import { tracePath } from './trace';

const codes = (findings: readonly Finding[]) => findings.map((f) => f.code);
const only = (findings: readonly Finding[], code: FindingCode) => findings.filter((f) => f.code === code);

describe('Topologie', () => {
  test('regroupe les cartes réseau reliées par des switchs, de chaque côté d’un routeur', () => {
    const { net, a, b, r, s1, s2 } = routedNetwork();
    const all = segments(net);
    expect(all).toHaveLength(2);
    const left = segmentOf(all, a.id);
    expect(left?.switches).toEqual([s1.id]);
    expect(left?.members.map((m) => `${m.deviceId}#${m.iface}`).sort()).toEqual(
      [`${a.id}#0`, `${r.id}#0`].sort(),
    );
    expect(segmentOf(all, r.id, 1)).toBe(segmentOf(all, b.id));
    expect(segmentOf(all, b.id)?.switches).toEqual([s2.id]);
    expect(segmentOf(all, 'inconnu')).toBeUndefined();
  });

  test('une carte sans câble est seule ; un poste en DHCP n’a pas d’adresse connue à l’avance', () => {
    const net = new Network();
    const a = staticHost(net, 'A', '10.0.0.1');
    const b = net.addHost('computer', { name: 'B', config: { ip: ip('10.0.0.2'), useDhcp: true } });
    expect(segments(net)).toHaveLength(2);
    expect(attachments(net)).toEqual([
      { deviceId: a.id, iface: 0, ip: ip('10.0.0.1'), mask: MASK_24, dynamic: false },
      { deviceId: b.id, iface: 0, ip: IP_ANY, mask: IP_ANY, dynamic: true },
    ]);
    net.connect(a.id, b.id);
    expect(segments(net)).toHaveLength(1);
    expect(segments(net)[0]?.switches).toEqual([]);
  });

  test('repère une boucle de switchs, y compris deux câbles entre les mêmes switchs', () => {
    const net = new Network();
    const [s1, s2, s3] = [net.addSwitch(), net.addSwitch(), net.addSwitch()];
    net.connect(s1.id, s2.id);
    net.connect(s2.id, s3.id);
    expect(switchLoop(net)).toEqual([]);
    net.connect(s3.id, s1.id);
    expect(switchLoop(net).sort()).toEqual([s1.id, s3.id].sort());

    const twin = new Network();
    const [t1, t2] = [twin.addSwitch(), twin.addSwitch()];
    twin.connect(t1.id, t2.id);
    twin.connect(t1.id, t2.id);
    expect(switchLoop(twin).sort()).toEqual([t1.id, t2.id].sort());
  });
});

describe('Vérification du réseau (contrôles statiques)', () => {
  test('un réseau correct ne signale rien', () => {
    expect(lintNetwork(simpleLan().net)).toEqual([]);
    expect(lintNetwork(routedNetwork().net)).toEqual([]);
    expect(lintNetwork(new Network())).toEqual([]);
  });

  test('le réseau d’exemple ne signale rien non plus', () => {
    expect(lintNetwork(exampleNetwork())).toEqual([]);
  });

  test('ne modifie pas le réseau', () => {
    const net = exampleNetwork();
    const before = serializeProject(net);
    lintNetwork(net);
    expect(serializeProject(net)).toBe(before);
  });

  test('poste non relié ; Wi-Fi sans réseau ; rien à dire d’un équipement seul sur le plan', () => {
    const alone = new Network();
    staticHost(alone, 'A', '10.0.0.1');
    expect(lintNetwork(alone)).toEqual([]);

    const net = simpleLan().net;
    const c = staticHost(net, 'C', '192.168.0.3');
    expect(lintNetwork(net)).toEqual([
      { code: 'not-cabled', severity: 'error', deviceIds: [c.id], params: {} },
    ]);
    net.setHostWifi(c.id, true);
    expect(codes(lintNetwork(net))).toEqual(['wifi-not-joined']);
  });

  test('adresse manquante, masque manquant, adresse inutilisable', () => {
    const { net, a, b } = simpleLan();
    a.updateConfig({ ip: IP_ANY });
    b.updateConfig({ mask: IP_ANY });
    const c = staticHost(net, 'C', '192.168.0.255');
    net.connect(c.id, net.switches[0]?.id ?? '');
    const found = lintNetwork(net);
    expect(codes(found)).toEqual(['ip-missing', 'mask-missing', 'ip-not-usable']);
    expect(found[1]).toMatchObject({ deviceIds: [b.id], params: { ip: '192.168.0.2' } });
    expect(found[2]).toMatchObject({ deviceIds: [c.id], params: { ip: '192.168.0.255' } });
  });

  test('même adresse deux fois dans le même réseau', () => {
    const { net, a, b } = simpleLan();
    b.updateConfig({ ip: ip('192.168.0.1') });
    expect(lintNetwork(net)).toEqual([
      { code: 'ip-duplicate', severity: 'error', deviceIds: [a.id, b.id], params: { ip: '192.168.0.1' } },
    ]);
    // De part et d'autre d'un routeur, ce n'est pas le même réseau : pas de conflit signalé ici.
    const routed = routedNetwork();
    routed.b.updateConfig({ ip: ip('192.168.1.10'), gateway: IP_ANY });
    expect(only(lintNetwork(routed.net), 'ip-duplicate')).toEqual([]);
  });

  test('équipements du même switch dans des réseaux IP différents', () => {
    const { net, a, b } = simpleLan();
    b.updateConfig({ ip: ip('192.168.1.2') });
    expect(lintNetwork(net)).toEqual([
      {
        code: 'segment-several-networks',
        severity: 'warning',
        deviceIds: [a.id, b.id],
        params: { networks: '192.168.0.0/24 et 192.168.1.0/24' },
      },
    ]);
  });

  test('passerelle hors réseau, inexistante, sur un ordinateur, ou manquante près d’un routeur', () => {
    const { net, a, b, r } = routedNetwork();
    a.updateConfig({ gateway: ip('192.168.9.1') });
    expect(lintNetwork(net)).toEqual([
      {
        code: 'gateway-outside',
        severity: 'error',
        deviceIds: [a.id],
        params: { gateway: '192.168.9.1', ip: '192.168.1.10', mask: '255.255.255.0' },
      },
    ]);
    a.updateConfig({ gateway: ip('192.168.1.254') });
    expect(lintNetwork(net)).toEqual([
      { code: 'gateway-nobody', severity: 'error', deviceIds: [a.id], params: { gateway: '192.168.1.254' } },
    ]);
    a.updateConfig({ gateway: IP_ANY });
    expect(lintNetwork(net)).toEqual([
      { code: 'gateway-missing', severity: 'warning', deviceIds: [a.id], params: {} },
    ]);
    // Sans routeur dans son réseau, un poste sans passerelle n'a rien d'anormal.
    net.removeDevice(r.id);
    expect(only(lintNetwork(net), 'gateway-missing')).toEqual([]);
    expect(only(lintNetwork(net), 'gateway-nobody').map((f) => f.deviceIds)).toEqual([[b.id]]);

    const lan = simpleLan();
    lan.a.updateConfig({ gateway: ip('192.168.0.2') });
    expect(lintNetwork(lan.net)).toEqual([
      {
        code: 'gateway-not-router',
        severity: 'error',
        deviceIds: [lan.a.id, lan.b.id],
        params: { gateway: '192.168.0.2' },
      },
    ]);
  });

  test('une passerelle qui peut être distribuée par DHCP n’est pas dite inexistante', () => {
    const { net, a, sw } = simpleLan();
    a.updateConfig({ gateway: ip('192.168.0.254') });
    const dynamic = net.addHost('computer', { name: 'D', config: { useDhcp: true } });
    net.connect(dynamic.id, sw.id);
    expect(only(lintNetwork(net), 'gateway-nobody')).toEqual([]);
  });

  test('DNS : absent alors qu’un serveur existe, ou adresse sans serveur', () => {
    const { net, a, b } = simpleLan();
    a.updateConfig({ dns: ip('192.168.0.2') });
    expect(lintNetwork(net)).toEqual([
      { code: 'dns-no-server', severity: 'warning', deviceIds: [a.id, b.id], params: { dns: '192.168.0.2' } },
    ]);
    a.updateConfig({ dns: ip('192.168.0.77') });
    expect(only(lintNetwork(net), 'dns-no-server')[0]?.deviceIds).toEqual([a.id]);

    b.install('dnsserver');
    b.dnsServer.setActive(true);
    a.updateConfig({ dns: IP_ANY });
    // Le serveur lui-même n'a pas besoin d'un serveur DNS.
    expect(lintNetwork(net)).toEqual([
      { code: 'dns-missing', severity: 'info', deviceIds: [a.id], params: {} },
    ]);
    a.updateConfig({ dns: ip('192.168.0.2') });
    expect(lintNetwork(net)).toEqual([]);
  });

  test('serveur installé mais pas démarré', () => {
    const { net, b } = simpleLan();
    b.install('webserver');
    expect(lintNetwork(net)).toEqual([
      { code: 'server-not-started', severity: 'warning', deviceIds: [b.id], params: { app: 'Serveur web' } },
    ]);
    b.webServer.setActive(true);
    expect(lintNetwork(net)).toEqual([]);
  });

  test('DHCP : pas de serveur démarré dans le réseau du poste ; serveur lui-même en automatique', () => {
    const { net, a, b } = simpleLan();
    a.updateConfig({ useDhcp: true });
    expect(codes(lintNetwork(net))).toEqual(['dhcp-no-server']);
    b.install('dhcpserver');
    expect(codes(lintNetwork(net))).toEqual(['dhcp-no-server', 'server-not-started']);
    b.dhcpServer.setActive(true);
    expect(lintNetwork(net)).toEqual([]);
    // Le serveur est toujours là pour A ; c'est lui qui ne peut pas se servir lui-même.
    b.updateConfig({ useDhcp: true });
    expect(lintNetwork(net)).toEqual([
      { code: 'dhcp-server-dynamic', severity: 'error', deviceIds: [b.id], params: {} },
    ]);

    // Un serveur DHCP derrière un routeur ne sert pas ce réseau : les diffusions ne traversent pas.
    const routed = routedNetwork();
    routed.a.updateConfig({ useDhcp: true });
    routed.b.install('dhcpserver');
    routed.b.dhcpServer.setActive(true);
    expect(codes(lintNetwork(routed.net))).toEqual(['dhcp-no-server']);
  });

  test('routeur : interface câblée sans adresse, deux interfaces dans le même réseau', () => {
    const { net, b, r } = routedNetwork();
    r.setInterface(1, { ip: IP_ANY, mask: IP_ANY });
    // Le poste B y perd du même coup sa passerelle.
    expect(lintNetwork(net)).toEqual([
      { code: 'gateway-nobody', severity: 'error', deviceIds: [b.id], params: { gateway: '192.168.2.1' } },
      { code: 'router-iface-unconfigured', severity: 'error', deviceIds: [r.id], params: { iface: 'eth1' } },
    ]);
    r.setInterface(1, { ip: ip('192.168.1.2'), mask: MASK_24 });
    expect(only(lintNetwork(net), 'router-ifaces-same-network')).toEqual([
      {
        code: 'router-ifaces-same-network',
        severity: 'error',
        deviceIds: [r.id],
        params: { a: 'eth0', b: 'eth1', network: '192.168.1.0/24' },
      },
    ]);
    r.setInterface(1, { ip: ip('192.168.2.0'), mask: IP_ANY });
    expect(codes(lintNetwork(net))).toContain('mask-missing');
    r.setInterface(1, { ip: ip('192.168.2.0'), mask: MASK_24 });
    expect(only(lintNetwork(net), 'ip-not-usable')[0]?.deviceIds).toEqual([r.id]);
    // Une interface libre et sans adresse n'est pas une erreur.
    net.addRouterInterface(r.id);
    expect(only(lintNetwork(net), 'router-iface-unconfigured')).toEqual([]);
  });

  test('boucle de switchs', () => {
    const { net, sw } = simpleLan();
    const other = net.addSwitch();
    net.connect(sw.id, other.id);
    net.connect(sw.id, other.id);
    const loop = only(lintNetwork(net), 'switch-loop');
    expect(loop).toHaveLength(1);
    expect([...(loop[0]?.deviceIds ?? [])].sort()).toEqual([sw.id, other.id].sort());
  });

  test('classe les constats et donne le niveau le plus grave par équipement', () => {
    const { net, a, b } = simpleLan();
    b.install('webserver');
    a.updateConfig({ ip: IP_ANY });
    const found = lintNetwork(net);
    expect(codes(bySeverity([...found].reverse()))).toEqual(['ip-missing', 'server-not-started']);
    expect(worstFor(found, a.id)).toBe('error');
    expect(worstFor(found, b.id)).toBe('warning');
    expect(worstFor(found, 'autre')).toBeNull();
  });
});

describe('Simulation sur une copie', () => {
  test('s’arrête à la condition, au délai, ou au nombre d’événements', () => {
    const { net } = routedNetwork();
    net.start();
    expect(runBounded(net, () => true, 1000)).toBe('done');
    expect(runBounded(net, () => false, 1000)).toBe('timeout');
    expect(net.scheduler.now).toBe(1000);
    let ticks = 0;
    const tick = () => {
      ticks++;
      net.scheduler.schedule(1, tick);
    };
    tick();
    expect(runBounded(net, () => ticks >= 5, 1000)).toBe('done');
    expect(runBounded(net, () => false, 1_000_000, 50)).toBe('overflow');
  });

  test('prépare une copie démarrée, sans toucher au réseau d’origine', () => {
    const net = exampleNetwork();
    const before = serializeProject(net);
    const probe = prepareProbe(net);
    expect(probe.overflow).toBe(false);
    expect(probe.sim).not.toBe(net);
    expect(probe.sim.running).toBe(true);
    expect(net.running).toBe(false);
    expect(serializeProject(net)).toBe(before);
    // Les postes en DHCP ont obtenu leur adresse pendant la mise en route.
    const poste = probe.sim.devices.find((d) => d.name === 'Poste 1');
    expect(poste && probe.sim.host(poste.id).addressing.ip).not.toBe(IP_ANY);
    expect(probe.drops).toEqual([]);
    expect(probe.transmits).toEqual([]);
  });

  test('une boucle de switchs ne bloque pas : le trafic sans fin est signalé', () => {
    const { net, sw } = simpleLan();
    const other = net.addSwitch();
    // Trois câbles entre deux switchs : chaque diffusion repart en double, sans fin.
    for (let i = 0; i < 3; i++) net.connect(sw.id, other.id);
    const dynamic = net.addHost('computer', { name: 'D', config: { useDhcp: true } });
    net.connect(dynamic.id, sw.id);
    const probe = prepareProbe(net);
    expect(probe.overflow).toBe(true);
    // Arrêté par le nombre d'événements, bien avant la fin du délai de mise en route.
    expect(probe.sim.scheduler.now).toBeLessThan(1000);
    expect(MAX_EVENTS).toBeGreaterThan(1000);
  });
});

describe('Pourquoi ça ne marche pas ? (ping rejoué sur une copie)', () => {
  const explain = (net: Network, fromId: string, target: string) => {
    const result = tracePath(net, fromId, { kind: 'text', text: target });
    return { code: result.findings[0]?.code, finding: result.findings[0], result };
  };

  test('communication réussie, par adresse, par équipement ou par nom d’équipement', () => {
    const { net, a, b, r, s1, s2 } = routedNetwork();
    const result = tracePath(net, a.id, { kind: 'device', id: b.id });
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([
      { code: 'trace-ok', severity: 'success', deviceIds: [a.id, b.id], params: { target: '192.168.2.10' } },
    ]);
    expect(result.reached).toEqual([a.id, s1.id, r.id, s2.id, b.id]);
    expect(explain(net, a.id, '192.168.2.10').code).toBe('trace-ok');
    expect(explain(net, a.id, ' b ').code).toBe('trace-ok');
    // Un routeur peut aussi être le point de départ.
    expect(tracePath(net, r.id, { kind: 'device', id: a.id }).ok).toBe(true);
    // Le réseau de l'élève n'a pas été démarré ni modifié.
    expect(net.running).toBe(false);
  });

  test('par nom DNS, après obtention des adresses par DHCP', () => {
    const net = exampleNetwork();
    const poste = net.devices.find((d) => d.name === 'Poste 1');
    const web = net.devices.find((d) => d.name === 'Serveur web');
    const result = tracePath(net, poste?.id ?? '', { kind: 'text', text: 'www.college.fr' });
    expect(result.findings).toEqual([
      {
        code: 'trace-ok',
        severity: 'success',
        deviceIds: [poste?.id, web?.id],
        params: { target: 'www.college.fr' },
      },
    ]);
    const unknown = explain(net, poste?.id ?? '', 'www.inconnu.fr');
    expect(unknown.code).toBe('trace-dns');
    expect(unknown.finding?.params).toEqual({ target: 'www.inconnu.fr', reason: 'nom de domaine inconnu' });
  });

  test('destination inconnue ou sans adresse', () => {
    const { net, a, b, sw } = simpleLan();
    expect(explain(net, a.id, '').code).toBe('trace-target-unknown');
    expect(explain(net, a.id, sw.name).code).toBe('trace-target-unknown');
    expect(tracePath(net, a.id, { kind: 'device', id: sw.id }).findings[0]?.code).toBe(
      'trace-target-unknown',
    );
    expect(tracePath(net, sw.id, { kind: 'device', id: a.id }).findings[0]?.code).toBe(
      'trace-target-unknown',
    );
    // Sans serveur DNS, un nom ne peut pas être traduit.
    expect(explain(net, a.id, 'www.college.fr').code).toBe('trace-dns');
    b.updateConfig({ ip: IP_ANY });
    const result = tracePath(net, a.id, { kind: 'device', id: b.id });
    expect(result.findings[0]).toMatchObject({ code: 'trace-target-no-address', deviceIds: [a.id, b.id] });
  });

  test('l’émetteur n’a pas d’adresse, pas de passerelle, ou une passerelle hors réseau', () => {
    const { net, a } = routedNetwork();
    a.updateConfig({ gateway: IP_ANY });
    expect(explain(net, a.id, '192.168.2.10').finding).toEqual({
      code: 'trace-no-gateway',
      severity: 'error',
      deviceIds: [a.id],
      params: { target: '192.168.2.10' },
    });
    a.updateConfig({ gateway: ip('192.168.7.1') });
    expect(explain(net, a.id, '192.168.2.10').code).toBe('trace-gateway-outside');
    a.updateConfig({ ip: IP_ANY });
    expect(explain(net, a.id, '192.168.2.10').code).toBe('trace-no-address');
  });

  test('l’émetteur n’est pas câblé', () => {
    const { net, b } = simpleLan();
    const lonely = staticHost(net, 'Seul', '192.168.0.9');
    const { code, result } = explain(net, lonely.id, '192.168.0.2');
    expect(code).toBe('trace-no-link');
    // Le message n'a pas quitté l'émetteur.
    expect(result.reached).toEqual([lonely.id]);
    expect(tracePath(net, lonely.id, { kind: 'device', id: b.id }).ok).toBe(false);
  });

  test('personne n’a l’adresse ; ou son propriétaire est sur un autre switch', () => {
    const { net, a, b } = routedNetwork();
    expect(explain(net, a.id, '192.168.1.77').finding).toEqual({
      code: 'trace-nobody-has-address',
      severity: 'error',
      deviceIds: [a.id],
      params: { target: '192.168.1.77' },
    });
    // Masque trop large : A croit que B est dans son réseau et l'appelle directement.
    a.updateConfig({ mask: ip('255.255.0.0') });
    expect(explain(net, a.id, '192.168.2.10').finding).toMatchObject({
      code: 'trace-other-segment',
      deviceIds: [a.id, b.id],
    });
  });

  test('passerelle inexistante, ou qui est un ordinateur', () => {
    const { net, a } = routedNetwork();
    a.updateConfig({ gateway: ip('192.168.1.254') });
    expect(explain(net, a.id, '192.168.2.10').finding).toEqual({
      code: 'trace-gateway-nobody',
      severity: 'error',
      deviceIds: [a.id],
      params: { target: '192.168.2.10', gateway: '192.168.1.254' },
    });
    const lan = simpleLan();
    lan.a.updateConfig({ gateway: ip('192.168.0.2') });
    expect(explain(lan.net, lan.a.id, '10.0.0.1').finding).toMatchObject({
      code: 'trace-gateway-not-router',
      deviceIds: [lan.b.id, lan.a.id],
    });
  });

  test('le routeur ne connaît pas la route, à l’aller ou au retour', () => {
    const { net, a, b, r } = routedNetwork();
    expect(explain(net, a.id, '10.9.9.9').finding).toMatchObject({
      code: 'trace-router-no-route',
      deviceIds: [r.id],
    });
    expect(explain(net, a.id, '192.168.2.77').finding).toMatchObject({
      code: 'trace-nobody-has-address',
      deviceIds: [r.id],
    });

    // Second routeur derrière B, sans route de retour vers le réseau de A.
    const far = net.addRouter({ name: 'R2' });
    far.setInterface(0, { ip: ip('192.168.2.2'), mask: MASK_24 });
    far.setInterface(1, { ip: ip('192.168.3.1'), mask: MASK_24 });
    const c = staticHost(net, 'C', '192.168.3.10', '192.168.3.1');
    net.connect(far.id, net.switches[1]?.id ?? '');
    net.connect(c.id, far.id);
    r.setStaticRoutes([
      { destination: ip('192.168.3.0'), mask: MASK_24, gateway: ip('192.168.2.2'), iface: 1 },
    ]);
    expect(explain(net, a.id, '192.168.3.10').finding).toMatchObject({
      code: 'trace-router-no-return-route',
      deviceIds: [far.id],
    });
    r.setStaticRoutes([
      { destination: ip('192.168.3.0'), mask: MASK_24, gateway: ip('192.168.2.99'), iface: 1 },
    ]);
    expect(explain(net, a.id, '192.168.3.10').finding).toMatchObject({
      code: 'trace-next-hop-nobody',
      deviceIds: [r.id],
      params: { gateway: '192.168.2.99' },
    });
    expect(b.config.gateway).toBe(ip('192.168.2.1'));
  });

  test('le destinataire n’a pas de passerelle pour répondre', () => {
    const { net, a, b, r, s1, s2 } = routedNetwork();
    b.updateConfig({ gateway: IP_ANY });
    const { finding, result } = explain(net, a.id, '192.168.2.10');
    expect(finding).toMatchObject({ code: 'trace-no-return-route', deviceIds: [b.id] });
    // La demande, elle, est allée jusqu'au bout.
    expect(result.reached).toEqual([a.id, s1.id, r.id, s2.id]);
  });

  test('pare-feu, boucle de routage, interface de routeur sans adresse', () => {
    const { net, a, b, r, s1 } = routedNetwork();
    r.firewall.setEnabled(true);
    const blocked = explain(net, a.id, '192.168.2.10');
    expect(blocked.finding).toMatchObject({ code: 'trace-firewall', deviceIds: [r.id] });
    expect(blocked.result.reached).toEqual([a.id, s1.id, r.id]);
    r.firewall.setEnabled(false);
    b.firewall.setEnabled(true);
    expect(explain(net, a.id, '192.168.2.10').finding).toMatchObject({
      code: 'trace-firewall',
      deviceIds: [b.id],
    });
    b.firewall.setEnabled(false);

    // Deux routeurs qui se renvoient un réseau inconnu.
    const second = net.addRouter({ name: 'R2' });
    second.setInterface(0, { ip: ip('192.168.2.2'), mask: MASK_24 });
    net.connect(second.id, net.switches[1]?.id ?? '');
    r.setStaticRoutes([{ destination: ip('10.0.0.0'), mask: MASK_24, gateway: ip('192.168.2.2'), iface: 1 }]);
    second.setStaticRoutes([
      { destination: ip('10.0.0.0'), mask: MASK_24, gateway: ip('192.168.2.1'), iface: 0 },
    ]);
    expect(explain(net, a.id, '10.0.0.5').code).toBe('trace-ttl');
  });

  test('refuse de simuler une boucle de switchs', () => {
    const { net, a, sw } = simpleLan();
    const other = net.addSwitch();
    net.connect(sw.id, other.id);
    net.connect(sw.id, other.id);
    expect(explain(net, a.id, '192.168.0.2').code).toBe('trace-not-simulated');
  });

  test('un poste se répond à lui-même', () => {
    const { net, a } = simpleLan();
    const { code, result } = explain(net, a.id, '192.168.0.1');
    expect(code).toBe('trace-ok');
    expect(result.reached).toEqual([a.id]);
  });
});

describe('Textes du diagnostic', () => {
  test('chaque constat a un titre, une explication et une notion', () => {
    for (const code of [...LINT_CODES, ...TRACE_CODES]) {
      const text = MESSAGES[code];
      expect(text.title.length, code).toBeGreaterThan(5);
      expect(text.explain.length, code).toBeGreaterThan(10);
      expect(text.notion, code).toMatch(/^[a-z-]+$/);
    }
    expect(Object.keys(MESSAGES).sort()).toEqual([...LINT_CODES, ...TRACE_CODES].sort());
  });

  test('les phrases citent les équipements et les valeurs du constat', () => {
    const names: Record<string, string> = { h1: 'Poste 1', h2: 'Poste 2', h3: 'Poste 3' };
    const nameOf = (id: string) => names[id] ?? '?';
    const text = describeFinding(
      { code: 'ip-duplicate', severity: 'error', deviceIds: ['h1', 'h2', 'h3'], params: { ip: '10.0.0.1' } },
      nameOf,
    );
    expect(text.title).toBe('L’adresse 10.0.0.1 est utilisée plusieurs fois');
    expect(text.explain).toContain('Poste 1, Poste 2 et Poste 3 ont la même adresse IP');
    expect(text.notion).toBe('adresse-ip');

    const gateway = describeFinding(
      {
        code: 'gateway-not-router',
        severity: 'error',
        deviceIds: ['h1', 'h2'],
        params: { gateway: '10.0.0.2' },
      },
      nameOf,
    );
    expect(gateway.title).toBe('Poste 1 : sa passerelle (10.0.0.2) est Poste 2, qui n’est pas un routeur');
    expect(enumerate([])).toBe('');
    expect(enumerate(['A'])).toBe('A');
    expect(enumerate(['A', 'B'])).toBe('A et B');
  });

  test('aucun texte ne garde de variable non remplacée pour les constats réels', () => {
    const networks = [routedNetwork(), routedNetwork()];
    networks[0]?.a.updateConfig({ gateway: ip('192.168.1.254'), dns: ip('192.168.1.9') });
    networks[1]?.r.setInterface(1, { ip: ip('192.168.1.2'), mask: MASK_24 });
    for (const { net, a } of networks) {
      const nameOf = (id: string) => net.device(id)?.name ?? '?';
      const found = [
        ...lintNetwork(net),
        ...tracePath(net, a.id, { kind: 'text', text: '192.168.2.10' }).findings,
      ];
      expect(found.length).toBeGreaterThan(1);
      for (const finding of found) {
        const text = describeFinding(finding, nameOf);
        expect(`${text.title} ${text.explain} ${text.fix}`, finding.code).not.toMatch(/[{}]/);
      }
    }
  });

  test('un enseignant peut reformuler un message', () => {
    const text = describeFinding(
      { code: 'ip-missing', severity: 'error', deviceIds: ['x'], params: {} },
      () => 'PC',
      { 'ip-missing': { title: '{device} : adresse à compléter', fix: 'Voir la fiche {inconnu}.' } },
    );
    expect(text.title).toBe('PC : adresse à compléter');
    expect(text.fix).toBe('Voir la fiche {inconnu}.');
    expect(text.explain).toContain('identifie un équipement');
  });
});
