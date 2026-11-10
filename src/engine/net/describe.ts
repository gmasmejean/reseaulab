import { IP_ANY, formatIp } from '../core/ipv4';
import type { EthernetFrame, IcmpMessage, Ipv4Packet, TcpSegment, UdpDatagram } from './frames';
import type { UdpData } from './messages';

export type Layer = 'link' | 'network' | 'transport' | 'application';

export const LAYER_LABEL: Record<Layer, string> = {
  link: 'Liaison',
  network: 'Réseau',
  transport: 'Transport',
  application: 'Application',
};

export interface LayerSummary {
  readonly layer: Layer;
  readonly protocol: string;
  readonly source: string;
  readonly destination: string;
  readonly info: string;
  readonly fields: readonly (readonly [string, string])[];
}

const WELL_KNOWN_TCP: Record<number, string> = { 80: 'HTTP', 25: 'SMTP', 110: 'POP3' };

function firstLine(text: string, max = 80): string {
  const line = text.split(/\r?\n/)[0] ?? '';
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function describeIcmp(m: IcmpMessage): string {
  switch (m.type) {
    case 'echo-request':
      return `Requête d’écho (n° ${m.seq})`;
    case 'echo-reply':
      return `Réponse d’écho (n° ${m.seq})`;
    case 'time-exceeded':
      return 'Durée de vie (TTL) écoulée';
    case 'unreachable':
      return `Destination inaccessible (${m.code === 'net' ? 'réseau' : m.code === 'port' ? 'port' : 'hôte'})`;
  }
}

function tcpFlags(seg: TcpSegment): string {
  const names: string[] = [];
  if (seg.flags.syn) names.push('SYN');
  if (seg.flags.fin) names.push('FIN');
  if (seg.flags.rst) names.push('RST');
  if (seg.flags.psh) names.push('PSH');
  if (seg.flags.ack) names.push('ACK');
  return names.join(', ');
}

function describeUdpData(data: UdpData): { protocol: string; info: string; fields: [string, string][] } {
  switch (data.kind) {
    case 'dhcp': {
      const m = data.msg;
      const offered = m.yourIp === IP_ANY ? '' : ` ${formatIp(m.yourIp)}`;
      const fields: [string, string][] = [
        ['Type', m.op],
        ['Transaction', String(m.xid)],
        ['MAC du client', m.clientMac],
        ['Adresse attribuée', formatIp(m.yourIp)],
        ['Serveur', formatIp(m.serverIp)],
      ];
      if (m.requestedIp !== undefined) fields.push(['Adresse demandée', formatIp(m.requestedIp)]);
      if (m.mask !== undefined) fields.push(['Masque', formatIp(m.mask)]);
      if (m.gateway !== undefined) fields.push(['Passerelle', formatIp(m.gateway)]);
      if (m.dns !== undefined) fields.push(['Serveur DNS', formatIp(m.dns)]);
      return { protocol: 'DHCP', info: `${m.op}${offered}`, fields };
    }
    case 'dns': {
      const m = data.msg;
      const q = `${m.question.type} ${m.question.name}`;
      const info = !m.response
        ? `Requête ${q}`
        : m.rcode !== 'OK'
          ? `Réponse ${q} : ${m.rcode}`
          : `Réponse ${q} → ${m.answers.map((a) => a.value).join(', ') || 'aucun enregistrement'}`;
      return {
        protocol: 'DNS',
        info,
        fields: [
          ['Identifiant', String(m.id)],
          ['Question', q],
          ['Code de réponse', m.response ? m.rcode : '—'],
          ...m.answers.map((a, i): [string, string] => [
            `Réponse ${i + 1}`,
            `${a.name} ${a.type} ${a.value}`,
          ]),
        ],
      };
    }
    case 'rip':
      return {
        protocol: 'RIP',
        info:
          data.msg.command === 'request'
            ? 'Demande de routes'
            : `Annonce de ${data.msg.routes.length} route(s)`,
        fields: data.msg.routes.map((r): [string, string] => [
          `${formatIp(r.network)}/${formatIp(r.mask)}`,
          `distance ${r.metric}`,
        ]),
      };
    case 'text':
      return { protocol: 'Données', info: firstLine(data.text), fields: [['Contenu', data.text]] };
  }
}

function transportLayers(packet: Ipv4Packet): LayerSummary[] {
  const src = formatIp(packet.src);
  const dst = formatIp(packet.dst);
  const p = packet.payload;
  if (p.kind === 'icmp') {
    return [
      {
        layer: 'network',
        protocol: 'ICMP',
        source: src,
        destination: dst,
        info: describeIcmp(p),
        fields: [
          ['Type', describeIcmp(p)],
          ['Numéro de séquence', String(p.seq)],
        ],
      },
    ];
  }
  const layers: LayerSummary[] = [];
  if (p.kind === 'udp') {
    layers.push(udpLayer(p, src, dst));
    const app = describeUdpData(p.data);
    layers.push({ layer: 'application', source: src, destination: dst, ...app });
    return layers;
  }
  layers.push({
    layer: 'transport',
    protocol: 'TCP',
    source: `${src}:${p.srcPort}`,
    destination: `${dst}:${p.dstPort}`,
    info: `${tcpFlags(p)} seq=${p.seq}${p.flags.ack ? ` ack=${p.ack}` : ''}${p.data ? ` (${p.data.length} octets)` : ''}`,
    fields: [
      ['Port source', String(p.srcPort)],
      ['Port destination', String(p.dstPort)],
      ['Drapeaux', tcpFlags(p)],
      ['Numéro de séquence', String(p.seq)],
      ['Numéro d’acquittement', p.flags.ack ? String(p.ack) : '—'],
      ['Longueur des données', String(p.data.length)],
    ],
  });
  if (p.data.length > 0) {
    const protocol = WELL_KNOWN_TCP[p.dstPort] ?? WELL_KNOWN_TCP[p.srcPort] ?? 'Données';
    layers.push({
      layer: 'application',
      protocol,
      source: src,
      destination: dst,
      info: firstLine(p.data),
      fields: [['Contenu', p.data]],
    });
  }
  return layers;
}

function udpLayer(p: UdpDatagram, src: string, dst: string): LayerSummary {
  return {
    layer: 'transport',
    protocol: 'UDP',
    source: `${src}:${p.srcPort}`,
    destination: `${dst}:${p.dstPort}`,
    info: `port ${p.srcPort} → ${p.dstPort}`,
    fields: [
      ['Port source', String(p.srcPort)],
      ['Port destination', String(p.dstPort)],
    ],
  };
}

/** Describes every layer of a frame, from Ethernet to the application. */
export function describeFrame(frame: EthernetFrame): LayerSummary[] {
  const link: LayerSummary = {
    layer: 'link',
    protocol: 'Ethernet',
    source: frame.src,
    destination: frame.dst,
    info: frame.payload.kind === 'arp' ? 'Trame ARP' : 'Trame IPv4',
    fields: [
      ['MAC source', frame.src],
      ['MAC destination', frame.dst],
    ],
  };
  const payload = frame.payload;
  if (payload.kind === 'arp') {
    const info =
      payload.op === 'request'
        ? `Qui a ${formatIp(payload.targetIp)} ? Répondre à ${formatIp(payload.senderIp)}`
        : `${formatIp(payload.senderIp)} est à ${payload.senderMac}`;
    return [
      link,
      {
        layer: 'network',
        protocol: 'ARP',
        source: formatIp(payload.senderIp),
        destination: formatIp(payload.targetIp),
        info,
        fields: [
          ['Opération', payload.op === 'request' ? 'requête' : 'réponse'],
          ['MAC émetteur', payload.senderMac],
          ['IP émetteur', formatIp(payload.senderIp)],
          ['MAC cible', payload.targetMac],
          ['IP cible', formatIp(payload.targetIp)],
        ],
      },
    ];
  }
  const ip: LayerSummary = {
    layer: 'network',
    protocol: 'IP',
    source: formatIp(payload.src),
    destination: formatIp(payload.dst),
    info: `TTL ${payload.ttl}`,
    fields: [
      ['IP source', formatIp(payload.src)],
      ['IP destination', formatIp(payload.dst)],
      ['Durée de vie (TTL)', String(payload.ttl)],
      ['Identifiant', String(payload.id)],
    ],
  };
  return [link, ip, ...transportLayers(payload)];
}

/** The most specific layer, used for the one-line summary of a frame. */
export function summarizeFrame(frame: EthernetFrame): LayerSummary {
  const layers = describeFrame(frame);
  const top = layers[layers.length - 1];
  if (!top) throw new Error('trame vide');
  return top;
}

/** Kind of traffic a frame carries, for colours, filters and statistics. */
export type ProtocolTag = 'arp' | 'icmp' | 'tcp' | 'tcp-data' | 'udp' | 'dhcp' | 'dns' | 'rip';

export function protocolTag(frame: EthernetFrame): ProtocolTag {
  const packet = frame.payload;
  if (packet.kind === 'arp') return 'arp';
  const transport = packet.payload;
  if (transport.kind === 'icmp') return 'icmp';
  if (transport.kind === 'udp') return transport.data.kind === 'text' ? 'udp' : transport.data.kind;
  // Segments that carry application data stand out from those that manage the connection.
  return transport.data.length > 0 ? 'tcp-data' : 'tcp';
}
