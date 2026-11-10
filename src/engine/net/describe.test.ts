import { ip } from '../testing';
import { describeFrame, protocolTag, summarizeFrame } from './describe';
import type { EthernetFrame, Ipv4Packet, TransportPayload } from './frames';
import type { UdpData } from './messages';

const MAC_A = '02:00:00:00:00:01';
const MAC_B = '02:00:00:00:00:02';

function ipFrame(payload: TransportPayload): EthernetFrame {
  const packet: Ipv4Packet = {
    kind: 'ipv4',
    id: 7,
    src: ip('10.0.0.1'),
    dst: ip('10.0.0.2'),
    ttl: 64,
    payload,
  };
  return { src: MAC_A, dst: MAC_B, payload: packet };
}

const udp = (data: UdpData, srcPort = 50000, dstPort = 53) =>
  ipFrame({ kind: 'udp', srcPort, dstPort, data });

describe('Description des trames', () => {
  test('ARP', () => {
    const request: EthernetFrame = {
      src: MAC_A,
      dst: 'FF:FF:FF:FF:FF:FF',
      payload: {
        kind: 'arp',
        op: 'request',
        senderMac: MAC_A,
        senderIp: ip('10.0.0.1'),
        targetMac: '00:00:00:00:00:00',
        targetIp: ip('10.0.0.2'),
      },
    };
    expect(describeFrame(request).map((l) => l.protocol)).toEqual(['Ethernet', 'ARP']);
    expect(summarizeFrame(request).info).toBe('Qui a 10.0.0.2 ? Répondre à 10.0.0.1');
    const reply = { ...request, payload: { ...request.payload, op: 'reply' as const } };
    expect(summarizeFrame(reply).info).toBe(`10.0.0.1 est à ${MAC_A}`);
  });

  test('ICMP', () => {
    const types = [
      [{ type: 'echo-request' }, 'Requête d’écho (n° 3)'],
      [{ type: 'echo-reply' }, 'Réponse d’écho (n° 3)'],
      [{ type: 'time-exceeded' }, 'Durée de vie (TTL) écoulée'],
      [{ type: 'unreachable', code: 'net' }, 'Destination inaccessible (réseau)'],
      [{ type: 'unreachable', code: 'port' }, 'Destination inaccessible (port)'],
      [{ type: 'unreachable' }, 'Destination inaccessible (hôte)'],
    ] as const;
    for (const [fields, info] of types) {
      const frame = ipFrame({ kind: 'icmp', ident: 1, seq: 3, ...fields });
      expect(summarizeFrame(frame)).toMatchObject({ protocol: 'ICMP', info, layer: 'network' });
    }
    expect(describeFrame(ipFrame({ kind: 'icmp', type: 'echo-request', ident: 1, seq: 1 }))[1]).toMatchObject(
      {
        protocol: 'IP',
        info: 'TTL 64',
      },
    );
  });

  test('TCP et protocoles applicatifs', () => {
    const syn = ipFrame({
      kind: 'tcp',
      srcPort: 50000,
      dstPort: 80,
      seq: 1,
      ack: 0,
      flags: { syn: true },
      data: '',
    });
    expect(summarizeFrame(syn)).toMatchObject({
      protocol: 'TCP',
      info: 'SYN seq=1',
      destination: '10.0.0.2:80',
    });
    const get = ipFrame({
      kind: 'tcp',
      srcPort: 50000,
      dstPort: 80,
      seq: 2,
      ack: 5,
      flags: { ack: true, psh: true },
      data: 'GET / HTTP/1.1\r\nHost: x',
    });
    expect(describeFrame(get)[2]?.info).toBe('PSH, ACK seq=2 ack=5 (23 octets)');
    expect(summarizeFrame(get)).toMatchObject({
      protocol: 'HTTP',
      info: 'GET / HTTP/1.1',
      layer: 'application',
    });
    const pop = ipFrame({
      kind: 'tcp',
      srcPort: 110,
      dstPort: 50000,
      seq: 1,
      ack: 1,
      flags: { ack: true, fin: true, rst: true },
      data: `+OK ${'x'.repeat(100)}`,
    });
    expect(summarizeFrame(pop).protocol).toBe('POP3');
    expect(summarizeFrame(pop).info.endsWith('…')).toBe(true);
    const other = ipFrame({
      kind: 'tcp',
      srcPort: 1,
      dstPort: 2,
      seq: 1,
      ack: 1,
      flags: { ack: true },
      data: 'x',
    });
    expect(summarizeFrame(other).protocol).toBe('Données');
  });

  test('UDP : DHCP, DNS, RIP, texte', () => {
    const dhcp = udp(
      {
        kind: 'dhcp',
        msg: {
          op: 'ACK',
          xid: 1,
          clientMac: MAC_A,
          yourIp: ip('10.0.0.9'),
          serverIp: ip('10.0.0.1'),
          requestedIp: ip('10.0.0.9'),
          mask: ip('255.0.0.0'),
          gateway: ip('10.0.0.254'),
          dns: ip('10.0.0.1'),
        },
      },
      67,
      68,
    );
    expect(summarizeFrame(dhcp)).toMatchObject({ protocol: 'DHCP', info: 'ACK 10.0.0.9' });
    expect(summarizeFrame(dhcp).fields).toHaveLength(9);
    expect(describeFrame(dhcp)[2]).toMatchObject({ protocol: 'UDP', info: 'port 67 → 68' });
    const discover = udp({
      kind: 'dhcp',
      msg: { op: 'DISCOVER', xid: 1, clientMac: MAC_A, yourIp: 0, serverIp: 0 },
    });
    expect(summarizeFrame(discover).info).toBe('DISCOVER');

    const question = { name: 'www.x.fr', type: 'A' as const };
    const query = udp({ kind: 'dns', msg: { id: 1, response: false, question, answers: [], rcode: 'OK' } });
    expect(summarizeFrame(query).info).toBe('Requête A www.x.fr');
    const answer = udp({
      kind: 'dns',
      msg: { id: 1, response: true, question, answers: [{ ...question, value: '1.2.3.4' }], rcode: 'OK' },
    });
    expect(summarizeFrame(answer).info).toBe('Réponse A www.x.fr → 1.2.3.4');
    const empty = udp({ kind: 'dns', msg: { id: 1, response: true, question, answers: [], rcode: 'OK' } });
    expect(summarizeFrame(empty).info).toContain('aucun enregistrement');
    const nx = udp({ kind: 'dns', msg: { id: 1, response: true, question, answers: [], rcode: 'NXDOMAIN' } });
    expect(summarizeFrame(nx).info).toBe('Réponse A www.x.fr : NXDOMAIN');

    const rip = udp({
      kind: 'rip',
      msg: { command: 'response', routes: [{ network: ip('10.0.0.0'), mask: ip('255.0.0.0'), metric: 1 }] },
    });
    expect(summarizeFrame(rip)).toMatchObject({ protocol: 'RIP', info: 'Annonce de 1 route(s)' });
    expect(summarizeFrame(udp({ kind: 'rip', msg: { command: 'request', routes: [] } })).info).toBe(
      'Demande de routes',
    );
    expect(summarizeFrame(udp({ kind: 'text', text: 'salut\nà tous' })).info).toBe('salut');
  });
});

describe('Sorte de trafic d’une trame', () => {
  test('distingue ARP, ICMP, les services UDP et les segments TCP avec ou sans données', () => {
    const arp: EthernetFrame = {
      src: MAC_A,
      dst: MAC_B,
      payload: {
        kind: 'arp',
        op: 'request',
        senderMac: MAC_A,
        senderIp: ip('10.0.0.1'),
        targetMac: MAC_B,
        targetIp: ip('10.0.0.2'),
      },
    };
    expect(protocolTag(arp)).toBe('arp');
    expect(protocolTag(ipFrame({ kind: 'icmp', type: 'echo-request', ident: 1, seq: 1 }))).toBe('icmp');
    expect(protocolTag(udp({ kind: 'text', text: 'x' }))).toBe('udp');
    expect(protocolTag(udp({ kind: 'rip', msg: { command: 'request', routes: [] } }))).toBe('rip');
    const tcp = (data: string) =>
      ipFrame({
        kind: 'tcp',
        srcPort: 50000,
        dstPort: 80,
        seq: 1,
        ack: 0,
        flags: data === '' ? { syn: true } : { ack: true, psh: true },
        data,
      });
    expect(protocolTag(tcp(''))).toBe('tcp');
    expect(protocolTag(tcp('GET / HTTP/1.1'))).toBe('tcp-data');
  });
});
