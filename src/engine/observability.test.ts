import { IP_ANY } from './core/ipv4';
import type { Host } from './devices/host';
import type { Router } from './devices/router';
import type { DropEvent } from './net/drop';
import type { EthernetFrame } from './net/frames';
import type { Network } from './network';
import { MASK_24, ip, ping, routedNetwork, simpleLan, staticHost } from './testing';

/** Records the packets the devices of `net` give up on. */
function watch(net: Network): DropEvent[] {
  const drops: DropEvent[] = [];
  net.events.on('drop', (d) => drops.push(d));
  return drops;
}

function summary(drops: readonly DropEvent[]) {
  return drops.map((d) => `${d.deviceId}:${d.stage}:${d.reason}`);
}

function echoRequest(dst: string, dstMac: string, src = '192.168.0.1'): EthernetFrame {
  return {
    src: '02:00:00:00:00:99',
    dst: dstMac,
    payload: {
      kind: 'ipv4',
      id: 1,
      src: ip(src),
      dst: ip(dst),
      ttl: 64,
      payload: { kind: 'icmp', type: 'echo-request', ident: 1, seq: 1 },
    },
  };
}

describe('Paquets abandonnés (événement drop)', () => {
  test('aucun abandon quand tout fonctionne', () => {
    const lan = simpleLan();
    const routed = routedNetwork();
    const drops = [...watch(lan.net), ...watch(routed.net)];
    lan.net.start();
    routed.net.start();
    expect(ping(lan.net, lan.a, '192.168.0.2').kind).toBe('reply');
    expect(ping(routed.net, routed.a, '192.168.2.10').kind).toBe('reply');
    expect(drops).toEqual([]);
  });

  test('no-address : le poste n’a pas d’adresse IP', () => {
    const { net, a } = simpleLan();
    a.updateConfig({ ip: IP_ANY, mask: IP_ANY });
    const drops = watch(net);
    net.start();
    expect(ping(net, a, '192.168.0.2').kind).toBe('no-route');
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({
      deviceId: a.id,
      reason: 'no-address',
      stage: 'send',
      iface: null,
      src: IP_ANY,
      dst: ip('192.168.0.2'),
    });
    expect(drops[0]?.gatewayIgnored).toBeUndefined();
  });

  test('no-route : pas de passerelle, ou passerelle hors du réseau du poste', () => {
    const { net, a } = simpleLan();
    const drops = watch(net);
    net.start();
    expect(ping(net, a, '10.0.0.1').kind).toBe('no-route');
    expect(drops[0]).toMatchObject({ deviceId: a.id, reason: 'no-route', stage: 'send', time: 0 });
    expect(drops[0]?.gatewayIgnored).toBeUndefined();

    // Une passerelle dans un autre réseau est ignorée : c'est une erreur fréquente.
    a.updateConfig({ gateway: ip('192.168.9.1') });
    ping(net, a, '10.0.0.1');
    expect(drops[1]).toMatchObject({ reason: 'no-route', gatewayIgnored: true });
  });

  test('no-link : aucun câble sur la carte réseau', () => {
    const net = simpleLan().net;
    const lonely = staticHost(net, 'Seul', '192.168.0.9');
    const drops = watch(net);
    net.start();
    expect(ping(net, lonely, '192.168.0.2')).toMatchObject({ kind: 'unreachable', code: 'host' });
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({
      deviceId: lonely.id,
      reason: 'no-link',
      stage: 'send',
      iface: 0,
      nextHop: ip('192.168.0.2'),
    });
  });

  test('arp-timeout : personne n’a l’adresse demandée, sur le réseau local ou derrière le routeur', () => {
    const { net, a, r } = routedNetwork();
    const drops = watch(net);
    net.start();
    ping(net, a, '192.168.1.77');
    expect(summary(drops)).toEqual([`${a.id}:send:arp-timeout`]);
    expect(drops[0]).toMatchObject({ nextHop: ip('192.168.1.77'), src: ip('192.168.1.10') });

    drops.length = 0;
    expect(ping(net, a, '192.168.2.77')).toMatchObject({ kind: 'unreachable', code: 'host' });
    expect(summary(drops)).toEqual([`${r.id}:forward:arp-timeout`]);
    expect(drops[0]).toMatchObject({ iface: 1, nextHop: ip('192.168.2.77'), dst: ip('192.168.2.77') });
  });

  test('arp-timeout : la passerelle indiquée n’existe pas', () => {
    const { net, a } = routedNetwork();
    a.updateConfig({ gateway: ip('192.168.1.254') });
    const drops = watch(net);
    net.start();
    ping(net, a, '192.168.2.10');
    expect(drops[0]).toMatchObject({
      deviceId: a.id,
      reason: 'arp-timeout',
      nextHop: ip('192.168.1.254'),
      dst: ip('192.168.2.10'),
    });
  });

  test('no-route (retour) : le destinataire reçoit la demande mais ne sait pas répondre', () => {
    const { net, a, b } = routedNetwork();
    b.updateConfig({ gateway: IP_ANY });
    const drops = watch(net);
    net.start();
    expect(ping(net, a, '192.168.2.10').kind).toBe('timeout');
    expect(summary(drops)).toEqual([`${b.id}:send:no-route`]);
    expect(drops[0]?.payload).toMatchObject({ kind: 'icmp', type: 'echo-reply' });
  });

  test('ttl-expired et no-route sur un routeur', () => {
    const { net, a, r } = routedNetwork();
    const drops = watch(net);
    net.start();
    expect(ping(net, a, '192.168.2.10', 1).kind).toBe('time-exceeded');
    expect(ping(net, a, '10.9.9.9')).toMatchObject({ kind: 'unreachable', code: 'net' });
    expect(summary(drops)).toEqual([`${r.id}:forward:ttl-expired`, `${r.id}:forward:no-route`]);
    expect(drops[0]).toMatchObject({ iface: 0 });
  });

  test('firewall : sur le poste visé (réception) ou sur le routeur (transfert)', () => {
    const { net, a, b, r } = routedNetwork();
    const drops = watch(net);
    b.firewall.setEnabled(true);
    net.start();
    expect(ping(net, a, '192.168.2.10').kind).toBe('timeout');
    expect(summary(drops)).toEqual([`${b.id}:receive:firewall`]);
    net.stop();

    drops.length = 0;
    b.firewall.setEnabled(false);
    r.firewall.setEnabled(true);
    net.start();
    expect(ping(net, a, '192.168.2.10').kind).toBe('timeout');
    expect(summary(drops)).toEqual([`${r.id}:forward:firewall`]);
  });

  test('not-a-router : la passerelle indiquée est un ordinateur', () => {
    const { net, a, b } = simpleLan();
    a.updateConfig({ gateway: ip('192.168.0.2') });
    const drops = watch(net);
    net.start();
    expect(ping(net, a, '10.0.0.1').kind).toBe('timeout');
    expect(summary(drops)).toEqual([`${b.id}:receive:not-a-router`]);
    expect(drops[0]).toMatchObject({ dst: ip('10.0.0.1'), iface: 0 });
  });

  test('iface-unconfigured : un routeur reçoit un paquet sur une interface sans adresse', () => {
    const net = simpleLan().net;
    const router: Router = net.addRouter();
    router.setInterface(0, { ip: ip('10.0.0.1'), mask: MASK_24 });
    const drops = watch(net);
    net.start();
    const port = router.ports[1];
    port?.deliver(echoRequest('10.0.0.50', port.mac));
    expect(summary(drops)).toEqual([`${router.id}:receive:iface-unconfigured`]);
  });

  test('port-closed : aucune application n’écoute le port UDP visé', () => {
    const { net, a, b } = simpleLan();
    const drops = watch(net);
    net.start();
    a.udp.send(5000, ip('192.168.0.2'), 9999, { kind: 'text', text: 'x' });
    net.scheduler.runUntilIdle();
    expect(summary(drops)).toEqual([`${b.id}:receive:port-closed`]);
    expect(drops[0]?.payload).toMatchObject({ kind: 'udp', dstPort: 9999 });
  });

  test('une diffusion sans destinataire n’est pas un abandon', () => {
    const { net, a } = simpleLan();
    const drops = watch(net);
    net.start();
    // Comme une demande DHCP reçue par un poste qui n'est pas serveur.
    a.udp.send(68, ip('255.255.255.255'), 67, { kind: 'text', text: 'x' });
    net.scheduler.runUntilIdle();
    expect(drops).toEqual([]);
  });
});

describe('Verdict des trames reçues (capture)', () => {
  const verdicts = (device: Host | Router) =>
    device.capture.entries.map((e) => {
      const p = e.frame.payload;
      const what =
        p.kind === 'arp' ? `arp-${p.op}` : p.payload.kind === 'icmp' ? p.payload.type : p.payload.kind;
      return `${e.direction} ${what} ${e.verdict ?? '-'}`;
    });

  test('acceptée par le destinataire, ignorée par les autres postes', () => {
    const { net, a, b, sw } = simpleLan();
    const c = staticHost(net, 'C', '192.168.0.3');
    net.connect(c.id, sw.id);
    net.start();
    ping(net, a, '192.168.0.2');
    // La trame reçue est listée avant la réponse qu'elle déclenche.
    expect(verdicts(b)).toEqual([
      'in arp-request accepted',
      'out arp-reply -',
      'in echo-request accepted',
      'out echo-reply -',
    ]);
    // C entend la demande ARP diffusée, qui ne le concerne pas.
    expect(verdicts(c)).toEqual(['in arp-request ignored']);
    expect(verdicts(a)).toEqual([
      'out arp-request -',
      'in arp-reply accepted',
      'out echo-request -',
      'in echo-reply accepted',
    ]);
  });

  test('ignorée : trame inondée par un switch, diffusion que personne n’écoute', () => {
    const { net, a, b } = simpleLan();
    net.start();
    // Trame adressée à une autre carte réseau, que le switch a diffusée faute de la connaître.
    b.ports[0]?.deliver(echoRequest('192.168.0.50', '02:00:00:00:00:77'));
    a.udp.send(68, ip('255.255.255.255'), 67, { kind: 'text', text: 'x' });
    net.scheduler.runUntilIdle();
    expect(verdicts(b)).toEqual(['in echo-request ignored', 'in udp ignored']);
  });

  test('relayée par le routeur, filtrée par un pare-feu', () => {
    const { net, a, b, r } = routedNetwork();
    net.start();
    ping(net, a, '192.168.2.10');
    expect(verdicts(r).filter((v) => v.includes('echo'))).toEqual([
      'in echo-request forwarded',
      'out echo-request -',
      'in echo-reply forwarded',
      'out echo-reply -',
    ]);
    net.stop();

    b.firewall.setEnabled(true);
    net.start();
    ping(net, a, '192.168.2.10');
    expect(verdicts(b).filter((v) => v.includes('echo'))).toEqual(['in echo-request filtered']);
    net.stop();

    b.firewall.setEnabled(false);
    r.firewall.setEnabled(true);
    net.start();
    ping(net, a, '192.168.2.10');
    expect(verdicts(r).filter((v) => v.includes('echo'))).toEqual(['in echo-request filtered']);
  });

  test('un ordinateur pris pour passerelle ignore le paquet', () => {
    const { net, a, b } = simpleLan();
    a.updateConfig({ gateway: ip('192.168.0.2') });
    net.start();
    ping(net, a, '10.0.0.1');
    expect(verdicts(b).filter((v) => v.includes('echo'))).toEqual(['in echo-request ignored']);
  });

  test('le verdict d’une entrée sortie du journal est simplement perdu', () => {
    const { net, b } = simpleLan();
    net.start();
    b.capture.setVerdict(999, 'accepted');
    const no = b.capture.record(0, 0, 'in', echoRequest('192.168.0.2', b.mac));
    b.capture.record(0, 0, 'out', echoRequest('192.168.0.1', b.mac));
    b.capture.setVerdict(no, 'filtered');
    b.capture.setVerdict(no - 1, 'accepted');
    expect(b.capture.entries.map((e) => e.verdict)).toEqual(['filtered', undefined]);
  });
});
