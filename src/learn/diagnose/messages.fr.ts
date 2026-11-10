import type { DropReason, FrameVerdict } from '../../engine/net/drop';
import type { ProtocolTag } from '../../engine/net/describe';
import type { Finding, FindingCode } from './findings';

/* Texts of the diagnosis, written for 13 to 15 year old pupils: what is
 * wrong, why it matters, what to do. Placeholders between braces are replaced
 * by the names of the devices ({device}, {other}, {devices}) and by the values
 * of the finding ({ip}, {gateway}…). */

export interface MessageText {
  /** One line: what is wrong. */
  readonly title: string;
  /** Why it prevents the network from working. */
  readonly explain: string;
  /** What to do; empty when there is nothing to correct. */
  readonly fix: string;
  /** Identifier of the knowledge card to read (see the pedagogical pack). */
  readonly notion: string;
}

export const MESSAGES: Record<FindingCode, MessageText> = {
  'not-cabled': {
    title: '{device} n’est relié à rien',
    explain: 'Sans câble ni Wi-Fi, aucun message ne peut partir de cet équipement ni lui arriver.',
    fix: 'Avec l’outil Câble, reliez-le à un switch ou à un autre équipement.',
    notion: 'liaison',
  },
  'wifi-not-joined': {
    title: '{device} n’a rejoint aucun réseau Wi-Fi',
    explain: 'Sa carte réseau est réglée en Wi-Fi, mais aucun réseau sans fil n’est choisi.',
    fix: 'Dans sa configuration, choisissez le nom Wi-Fi (SSID) d’un switch, ou repassez en filaire.',
    notion: 'wifi',
  },
  'ip-missing': {
    title: '{device} n’a pas d’adresse IP',
    explain:
      'L’adresse IP identifie un équipement sur le réseau : sans elle, il ne peut ni envoyer ni recevoir de messages.',
    fix: 'Donnez-lui une adresse IP (par exemple 192.168.0.1) ou cochez la configuration automatique (DHCP).',
    notion: 'adresse-ip',
  },
  'mask-missing': {
    title: '{device} : il manque le masque',
    explain:
      'Le masque indique quelle partie de l’adresse {ip} désigne le réseau. Sans lui, l’équipement ne sait pas qui fait partie de son réseau.',
    fix: 'Indiquez un masque, par exemple 255.255.255.0.',
    notion: 'masque',
  },
  'ip-not-usable': {
    title: '{device} : l’adresse {ip} n’est pas utilisable',
    explain:
      'C’est l’adresse du réseau lui-même ou son adresse de diffusion : aucune des deux ne peut être donnée à un équipement.',
    fix: 'Choisissez une autre adresse du même réseau.',
    notion: 'adresse-ip',
  },
  'ip-duplicate': {
    title: 'L’adresse {ip} est utilisée plusieurs fois',
    explain:
      '{devices} ont la même adresse IP dans le même réseau. Un message envoyé à cette adresse n’arrive pas toujours au bon équipement.',
    fix: 'Donnez une adresse différente à chacun.',
    notion: 'adresse-ip',
  },
  'segment-several-networks': {
    title: 'Des équipements reliés ensemble ne sont pas dans le même réseau',
    explain:
      '{devices} sont reliés par les mêmes switchs, mais leurs adresses appartiennent à des réseaux différents ({networks}). Ils ne peuvent pas communiquer directement.',
    fix: 'Donnez-leur des adresses du même réseau (même début d’adresse, même masque), ou séparez les réseaux par un routeur.',
    notion: 'masque',
  },
  'gateway-outside': {
    title: '{device} : la passerelle {gateway} n’est pas dans son réseau',
    explain:
      'Un équipement ne peut joindre sa passerelle que si elle est dans le même réseau que lui ({ip}, masque {mask}). Cette passerelle sera ignorée.',
    fix: 'Indiquez l’adresse de l’interface du routeur qui se trouve dans le réseau de {device}.',
    notion: 'passerelle',
  },
  'gateway-nobody': {
    title: '{device} : aucun équipement n’a l’adresse de sa passerelle ({gateway})',
    explain:
      'La passerelle est le routeur par lequel passent les messages destinés aux autres réseaux. Ici, personne dans le réseau de {device} ne porte cette adresse.',
    fix: 'Vérifiez l’adresse de la passerelle, ou donnez cette adresse à l’interface du routeur reliée à ce réseau.',
    notion: 'passerelle',
  },
  'gateway-not-router': {
    title: '{device} : sa passerelle ({gateway}) est {other}, qui n’est pas un routeur',
    explain:
      'Seul un routeur fait passer les messages d’un réseau à un autre. Un ordinateur ignore ceux qui ne lui sont pas destinés.',
    fix: 'Indiquez comme passerelle l’adresse de l’interface d’un routeur.',
    notion: 'passerelle',
  },
  'gateway-missing': {
    title: '{device} n’a pas de passerelle',
    explain:
      'Il peut communiquer avec les équipements de son réseau, mais pas avec ceux des autres réseaux, de l’autre côté du routeur.',
    fix: 'Indiquez comme passerelle l’adresse de l’interface du routeur reliée à son réseau.',
    notion: 'passerelle',
  },
  'dns-missing': {
    title: '{device} n’a pas de serveur DNS',
    explain:
      'Il peut joindre les autres équipements par leur adresse IP, mais pas par leur nom (comme www.college.fr).',
    fix: 'Indiquez l’adresse du serveur DNS dans sa configuration.',
    notion: 'dns',
  },
  'dns-no-server': {
    title: '{device} : aucun serveur DNS à l’adresse {dns}',
    explain:
      'Personne ne porte cette adresse, ou l’équipement qui la porte n’a pas le logiciel « Serveur DNS ». Les noms ne pourront pas être traduits en adresses.',
    fix: 'Corrigez l’adresse du serveur DNS, ou installez un serveur DNS sur l’équipement qui porte cette adresse.',
    notion: 'dns',
  },
  'server-not-started': {
    title: '{device} : « {app} » est installé mais pas démarré',
    explain: 'Un serveur ne répond aux demandes que lorsqu’il est démarré.',
    fix: 'En simulation, ouvrez sa fenêtre depuis le bureau de {device} et cliquez sur Démarrer.',
    notion: 'client-serveur',
  },
  'dhcp-no-server': {
    title: '{device} attend une adresse automatique, mais aucun serveur DHCP n’est démarré dans son réseau',
    explain:
      'En configuration automatique, c’est un serveur DHCP du même réseau qui distribue les adresses. Sans lui, {device} reste sans adresse.',
    fix: 'Installez et démarrez un serveur DHCP dans ce réseau, ou donnez une adresse fixe à {device}.',
    notion: 'dhcp',
  },
  'dhcp-server-dynamic': {
    title: '{device} est serveur DHCP mais attend lui-même une adresse automatique',
    explain: 'Un serveur DHCP doit avoir une adresse fixe : il ne peut pas se la distribuer à lui-même.',
    fix: 'Décochez sa configuration automatique et donnez-lui une adresse IP fixe.',
    notion: 'dhcp',
  },
  'router-iface-unconfigured': {
    title: '{device} : l’interface {iface} est câblée mais n’a pas d’adresse',
    explain:
      'Chaque interface d’un routeur est sa porte dans un réseau : elle doit avoir une adresse de ce réseau.',
    fix: 'Donnez à {iface} une adresse du réseau auquel elle est reliée.',
    notion: 'routeur',
  },
  'router-ifaces-same-network': {
    title: '{device} : {a} et {b} sont dans le même réseau ({network})',
    explain:
      'Un routeur relie des réseaux différents : chacune de ses interfaces doit être dans un réseau distinct.',
    fix: 'Changez l’adresse de l’une des deux interfaces.',
    notion: 'routeur',
  },
  'switch-loop': {
    title: 'Des switchs sont reliés en boucle',
    explain:
      '{devices} forment une boucle. Un message diffusé à tous tournerait sans fin d’un switch à l’autre et bloquerait le réseau.',
    fix: 'Supprimez l’un des câbles qui ferment la boucle.',
    notion: 'switch',
  },

  'trace-ok': {
    title: '{device} communique avec {target}',
    explain: 'La demande est arrivée à destination et la réponse est revenue.',
    fix: '',
    notion: 'ping',
  },
  'trace-not-simulated': {
    title: 'Test impossible tant que des switchs forment une boucle',
    explain: 'Les messages tourneraient sans fin et le test ne se terminerait pas.',
    fix: 'Corrigez d’abord la boucle signalée dans la vérification du réseau.',
    notion: 'switch',
  },
  'trace-target-unknown': {
    title: 'Destination inconnue',
    explain:
      '« {target} » n’est ni une adresse IP, ni le nom d’un ordinateur ou d’un routeur du plan, ni un nom que cet équipement peut demander à un serveur DNS.',
    fix: 'Choisissez un équipement dans la liste, ou tapez son adresse IP.',
    notion: 'adresse-ip',
  },
  'trace-target-no-address': {
    title: '{other} n’a pas d’adresse IP',
    explain: 'Pour lui envoyer un message, il faut connaître son adresse : il n’en a aucune.',
    fix: 'Donnez une adresse IP à {other}, ou vérifiez le serveur DHCP de son réseau.',
    notion: 'adresse-ip',
  },
  'trace-dns': {
    title: 'Le nom « {target} » n’a pas pu être traduit en adresse',
    explain: 'Réponse à la demande de {device} : {reason}.',
    fix: 'Vérifiez l’adresse du serveur DNS indiquée sur {device}, que ce serveur est démarré, et qu’il connaît ce nom.',
    notion: 'dns',
  },
  'trace-no-address': {
    title: '{device} n’a pas d’adresse IP',
    explain:
      'Sans adresse, il ne peut rien envoyer. S’il est en configuration automatique, aucun serveur DHCP ne lui a répondu.',
    fix: 'Donnez-lui une adresse IP, ou vérifiez le serveur DHCP de son réseau.',
    notion: 'adresse-ip',
  },
  'trace-no-gateway': {
    title: '{device} ne sait pas par où envoyer vers {target}',
    explain:
      '{target} n’est pas dans le réseau de {device}, et {device} n’a pas de passerelle : il ne connaît aucun chemin vers les autres réseaux.',
    fix: 'Indiquez comme passerelle l’adresse de l’interface du routeur reliée à son réseau.',
    notion: 'passerelle',
  },
  'trace-gateway-outside': {
    title: 'La passerelle de {device} n’est pas dans son réseau',
    explain: '{device} l’ignore donc, et ne connaît aucun chemin vers {target}.',
    fix: 'Indiquez l’adresse de l’interface du routeur qui se trouve dans le réseau de {device}.',
    notion: 'passerelle',
  },
  'trace-no-link': {
    title: '{device} n’est relié à rien de ce côté',
    explain: 'Le message ne peut pas partir : rien n’est branché sur l’interface qu’il devait emprunter.',
    fix: 'Reliez {device} avec l’outil Câble (ou choisissez son réseau Wi-Fi).',
    notion: 'liaison',
  },
  'trace-nobody-has-address': {
    title: 'Personne n’a l’adresse {target}',
    explain:
      '{device} a demandé à tout le réseau « qui a l’adresse {target} ? » (protocole ARP) et n’a reçu aucune réponse : aucun équipement ne porte cette adresse.',
    fix: 'Vérifiez l’adresse demandée, et l’adresse IP de l’équipement que vous vouliez joindre.',
    notion: 'arp',
  },
  'trace-other-segment': {
    title: '{other} a bien l’adresse {target}, mais {device} ne peut pas le joindre directement',
    explain:
      'D’après son adresse et son masque, {device} croit que {target} est dans son propre réseau et l’appelle directement. Or {other} n’est pas relié aux mêmes switchs : la demande ne lui parvient pas.',
    fix: 'Reliez-les au même switch, ou corrigez adresses et masques pour qu’ils soient dans deux réseaux différents reliés par un routeur.',
    notion: 'masque',
  },
  'trace-gateway-nobody': {
    title: 'La passerelle de {device} ({gateway}) ne répond pas',
    explain:
      'Pour sortir de son réseau, {device} confie le message à sa passerelle. Aucun équipement relié à son réseau ne porte cette adresse.',
    fix: 'Vérifiez l’adresse de la passerelle, celle de l’interface du routeur, et que le routeur est bien relié à ce réseau.',
    notion: 'passerelle',
  },
  'trace-gateway-not-router': {
    title: '{device} a reçu le message mais ne l’a pas transmis : ce n’est pas un routeur',
    explain:
      '{other} l’utilise comme passerelle, mais un ordinateur ignore les messages qui ne lui sont pas destinés.',
    fix: 'Sur {other}, indiquez comme passerelle l’adresse de l’interface d’un routeur.',
    notion: 'passerelle',
  },
  'trace-router-no-route': {
    title: '{device} ne connaît aucun chemin vers {target}',
    explain:
      'Le message est arrivé jusqu’à ce routeur, mais sa table de routage ne contient pas le réseau de destination.',
    fix: 'Ajoutez sur {device} une route vers ce réseau, ou activez le routage automatique (RIP) sur tous les routeurs.',
    notion: 'table-de-routage',
  },
  'trace-router-no-return-route': {
    title: 'La réponse est restée bloquée sur {device}',
    explain:
      'La demande est bien arrivée à destination, mais au retour ce routeur ne connaît aucun chemin vers le réseau de l’émetteur.',
    fix: 'Ajoutez sur {device} une route vers le réseau de l’émetteur, ou activez le routage automatique (RIP).',
    notion: 'table-de-routage',
  },
  'trace-no-return-route': {
    title: '{device} a reçu la demande mais ne peut pas répondre',
    explain:
      'Il n’a pas de passerelle utilisable : il ne connaît aucun chemin pour renvoyer sa réponse vers un autre réseau.',
    fix: 'Indiquez sur {device} la passerelle de son réseau.',
    notion: 'passerelle',
  },
  'trace-next-hop-nobody': {
    title: '{device} ne trouve pas le routeur suivant ({gateway})',
    explain:
      'Sa table de routage envoie ce message vers {gateway}, mais aucun équipement relié ne porte cette adresse.',
    fix: 'Corrigez la route de {device}, ou l’adresse du routeur voisin.',
    notion: 'table-de-routage',
  },
  'trace-router-iface-unconfigured': {
    title: '{device} a reçu le message sur une interface sans adresse',
    explain: 'Un routeur ne traite que ce qui arrive sur une interface configurée.',
    fix: 'Donnez une adresse à l’interface de {device} reliée à ce réseau.',
    notion: 'routeur',
  },
  'trace-firewall': {
    title: 'Le pare-feu de {device} a bloqué le message',
    explain: 'Un pare-feu activé refuse tout ce qu’aucune règle n’autorise.',
    fix: 'Ajoutez une règle qui autorise cet échange (protocole ICMP pour un ping), ou désactivez le pare-feu.',
    notion: 'pare-feu',
  },
  'trace-ttl': {
    title: 'Le message a tourné en rond',
    explain:
      'Sa durée de vie (TTL) s’est épuisée sur {device} : les routeurs se renvoient le message de l’un à l’autre.',
    fix: 'Vérifiez les routes statiques des routeurs : deux d’entre eux se désignent mutuellement.',
    notion: 'ttl',
  },
  'trace-unexplained': {
    title: 'Pas de réponse de {target}',
    explain: 'La demande est partie, mais aucune réponse n’est revenue dans le délai.',
    fix: 'Vérifiez la configuration des équipements signalés dans la vérification du réseau.',
    notion: 'ping',
  },
};

/** « A », « A et B », « A, B et C ». */
export function enumerate(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items.at(-1) ?? ''}`;
}

/**
 * Sentences of a finding, with the names of its devices. `overrides` lets a
 * pedagogical pack reword any message.
 */
export function describeFinding(
  finding: Finding,
  nameOf: (deviceId: string) => string,
  overrides: Partial<Record<FindingCode, Partial<MessageText>>> = {},
): MessageText {
  const text = { ...MESSAGES[finding.code], ...overrides[finding.code] };
  const names = finding.deviceIds.map(nameOf);
  const values: Record<string, string> = {
    device: names[0] ?? '',
    other: names[1] ?? '',
    devices: enumerate(names),
  };
  for (const [key, value] of Object.entries(finding.params)) values[key] = String(value);
  // Unknown placeholders are left as they are: easier to spot in a reworded message.
  const fill = (template: string) =>
    template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
  return { title: fill(text.title), explain: fill(text.explain), fix: fill(text.fix), notion: text.notion };
}

/** Why a device gave up on a packet, in a few words (mark on the plan). */
export const DROP_LABEL: Record<DropReason, string> = {
  'no-address': 'pas d’adresse IP',
  'no-route': 'aucun chemin vers la destination',
  'no-link': 'rien n’est branché',
  'arp-timeout': 'personne ne répond à cette adresse',
  'ttl-expired': 'durée de vie (TTL) épuisée',
  firewall: 'bloqué par le pare-feu',
  'not-a-router': 'ce n’est pas un routeur',
  'iface-unconfigured': 'interface sans adresse',
  'port-closed': 'aucun logiciel n’écoute ce port',
};

/** What a device did with a received frame (data exchanges). */
export const VERDICT_LABEL: Record<FrameVerdict, string> = {
  accepted: 'acceptée',
  forwarded: 'relayée',
  ignored: 'ignorée',
  filtered: 'bloquée par le pare-feu',
};

/** Legend of the frames drawn on the cables: name and role of each kind of traffic. */
export const TRAFFIC_LEGEND: readonly {
  readonly tag: ProtocolTag;
  readonly name: string;
  readonly role: string;
}[] = [
  { tag: 'arp', name: 'ARP', role: 'qui a cette adresse IP ?' },
  { tag: 'icmp', name: 'ICMP', role: 'test de communication (ping)' },
  { tag: 'dhcp', name: 'DHCP', role: 'adresse automatique' },
  { tag: 'dns', name: 'DNS', role: 'nom → adresse IP' },
  { tag: 'tcp', name: 'TCP', role: 'ouverture et fermeture d’une connexion' },
  { tag: 'tcp-data', name: 'Données', role: 'page web, message… dans une connexion TCP' },
  { tag: 'rip', name: 'RIP', role: 'les routeurs s’échangent leurs routes' },
  { tag: 'udp', name: 'UDP', role: 'message sans connexion' },
];
