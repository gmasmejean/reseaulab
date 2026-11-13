import { IP_ANY } from '../../engine/core/ipv4';
import { Network } from '../../engine/network';
import { exampleNetwork } from '../../project/example';
import type { Level } from '../content/types';
import { MASK_24, define, existing, ip, named } from './define';
import type { Activity } from './schema';
import { collegeMuseum } from './college-musee';
import { classroom } from './salle-techno';

/* Activities shipped with RéseauLab: ready to use, and examples of what a
 * teacher can write. Each one is a starting network and an activity whose
 * objectives the simulator checks. They are proposals to adapt. */

export interface BuiltinActivity {
  readonly id: string;
  readonly title: string;
  readonly level: Level;
  /** One sentence for the list of activities. */
  readonly summary: string;
  /** A new starting network and the activity, at each call. */
  build(): { network: Network; activity: Activity };
}

const firstNetwork: BuiltinActivity = {
  id: 'premier-reseau',
  title: 'Mon premier réseau',
  level: '4e',
  summary: 'Relier deux ordinateurs par un switch, leur donner une adresse et vérifier qu’ils communiquent.',
  build: () =>
    define(new Network(), {
      id: 'premier-reseau',
      title: 'Mon premier réseau',
      level: '4e',
      duration: 30,
      intro: `Deux ordinateurs doivent pouvoir échanger des fichiers. Il faut les **relier** et leur donner à chacun une **adresse**.

Suis les étapes : les objectifs se cochent tout seuls quand ils sont atteints.`,
      profile: { base: '4e' },
      steps: [
        {
          id: 'poser',
          title: 'Poser les équipements',
          body: 'Dans la palette, à gauche, clique sur **Ordinateur** deux fois, puis sur **Switch**. Déplace-les pour que le plan soit lisible.',
          notions: ['reseau', 'terminal', 'switch'],
          hints: ['Un clic dans la palette ajoute l’équipement sur le plan.'],
          objectives: [
            {
              id: 'deux-ordinateurs',
              label: 'Il y a deux ordinateurs sur le plan',
              check: { type: 'deviceCount', kind: 'computer', min: 2 },
            },
            { id: 'un-switch', label: 'Il y a un switch', check: { type: 'deviceCount', kind: 'switch' } },
          ],
        },
        {
          id: 'relier',
          title: 'Relier les ordinateurs au switch',
          body: 'Choisis l’outil **Câble**, clique sur un ordinateur puis sur le switch. Recommence pour le second ordinateur.',
          notions: ['liaison', 'topologie'],
          hints: [
            'L’outil Câble est dans la palette, sous les équipements.',
            'Un câble se pose en deux clics : le premier équipement, puis le second.',
          ],
          objectives: [
            {
              id: 'cable-1',
              label: 'Ordinateur 1 est relié au switch',
              check: { type: 'linked', a: named('Ordinateur 1'), b: named('Switch 1') },
            },
            {
              id: 'cable-2',
              label: 'Ordinateur 2 est relié au switch',
              check: { type: 'linked', a: named('Ordinateur 2'), b: named('Switch 1') },
            },
          ],
        },
        {
          id: 'adresser',
          title: 'Donner une adresse à chaque ordinateur',
          body: `Clique sur un ordinateur : son panneau s’ouvre en bas. Donne-lui une [[adresse-ip|adresse IP]] du réseau \`192.168.1.0\`, par exemple \`192.168.1.1\`. Le [[masque]] \`255.255.255.0\` est proposé.

Donne au second ordinateur une **autre** adresse du même réseau.`,
          notions: ['adresse-ip', 'masque'],
          hints: [
            'Avec le masque 255.255.255.0, deux adresses sont dans le même réseau si leurs trois premiers nombres sont identiques.',
            'Par exemple : 192.168.1.1 pour l’un, 192.168.1.2 pour l’autre.',
          ],
          objectives: [
            {
              id: 'adresses',
              label: 'Chaque ordinateur a une adresse du réseau 192.168.1.0',
              check: {
                type: 'config',
                device: { by: 'kind', kind: 'computer' },
                field: 'ip',
                inNetwork: '192.168.1.0/24',
              },
            },
            {
              id: 'rien-a-signaler',
              label: 'Le bouton Vérifier ne signale plus rien',
              check: { type: 'lintClean' },
            },
          ],
        },
        {
          id: 'tester',
          title: 'Tester la communication',
          body: `Passe en mode **Simulation**. Clique sur Ordinateur 1 pour ouvrir son bureau, lance la **ligne de commande** et tape \`ping\` suivi de l’adresse de l’autre ordinateur.

Observe les messages qui circulent sur les câbles, puis clique sur **Vérifier mon travail**.`,
          notions: ['ping', 'guide-observer'],
          hints: ['Exemple : ping 192.168.1.2'],
          objectives: [
            { id: 'simulation', label: 'La simulation a été lancée', check: { type: 'simulationStarted' } },
            {
              id: 'commande-ping',
              label: 'La commande ping a été utilisée sur Ordinateur 1',
              check: { type: 'commandRan', command: 'ping', device: named('Ordinateur 1') },
            },
            {
              id: 'communication',
              label: 'Ordinateur 1 communique avec Ordinateur 2',
              check: { type: 'ping', from: named('Ordinateur 1'), to: named('Ordinateur 2') },
            },
          ],
        },
      ],
    }),
};

const connectedObject: BuiltinActivity = {
  id: 'objet-connecte',
  title: 'Ajouter un objet connecté',
  level: '4e',
  summary:
    'Ajouter un objet connecté à un réseau existant : le relier, lui choisir une adresse libre, le joindre.',
  build: () => {
    const network = new Network();
    const sw = network.addSwitch({ name: 'Switch', position: { x: 420, y: 260 } });
    const hosts = [
      ['Ordinateur 1', '192.168.0.1', 200, 160],
      ['Ordinateur 2', '192.168.0.2', 200, 360],
    ] as const;
    for (const [name, address, x, y] of hosts) {
      const host = network.addHost('computer', {
        name,
        position: { x, y },
        config: { ip: ip(address), mask: MASK_24 },
      });
      network.connect(host.id, sw.id);
    }
    const first = existing(network, 'Ordinateur 1');
    return define(network, {
      id: 'objet-connecte',
      title: 'Ajouter un objet connecté',
      level: '4e',
      duration: 25,
      intro: `Le réseau de la salle fonctionne : deux ordinateurs reliés à un switch. On veut y ajouter une **station météo connectée**, que l’on pourra consulter depuis les ordinateurs.

Un [[objet-connecte|objet connecté]] se configure comme un ordinateur : il lui faut une liaison et une adresse du réseau.`,
      profile: { base: '4e' },
      steps: [
        {
          id: 'observer',
          title: 'Observer le réseau existant',
          body: 'Clique sur chaque ordinateur et relève son adresse IP et son masque. Dans quel réseau sont-ils ?',
          notions: ['adresse-ip', 'masque'],
          hints: [
            'Les trois premiers nombres des deux adresses sont identiques : c’est la partie « réseau ».',
          ],
          objectives: [],
        },
        {
          id: 'ajouter',
          title: 'Ajouter et relier l’objet',
          body: 'Ajoute un **Objet connecté** depuis la palette, puis relie-le au switch avec l’outil Câble.',
          notions: ['objet-connecte', 'liaison'],
          hints: ['L’objet connecté est dans la palette, avec les autres équipements.'],
          objectives: [
            {
              id: 'objet-present',
              label: 'Un objet connecté est sur le plan',
              check: { type: 'deviceCount', kind: 'object' },
            },
            {
              id: 'objet-relie',
              label: 'L’objet connecté est relié au switch',
              check: { type: 'linked', a: named('Objet connecté 1'), b: existing(network, 'Switch') },
            },
          ],
        },
        {
          id: 'adresser',
          title: 'Lui donner une adresse',
          body: 'Donne à l’objet une adresse **du même réseau** que les ordinateurs, et que **personne n’utilise** déjà.',
          notions: ['adresse-ip', 'dhcp'],
          hints: [
            'Le réseau est 192.168.0.0 : l’adresse doit commencer par 192.168.0.',
            'Les adresses 192.168.0.1 et 192.168.0.2 sont déjà prises.',
          ],
          objectives: [
            {
              id: 'objet-adresse',
              label: 'L’objet a une adresse du réseau 192.168.0.0',
              check: {
                type: 'config',
                device: { by: 'kind', kind: 'object' },
                field: 'ip',
                inNetwork: '192.168.0.0/24',
              },
            },
            {
              id: 'pas-de-doublon',
              label: 'Aucune adresse n’est utilisée deux fois',
              check: { type: 'lintClean' },
            },
          ],
        },
        {
          id: 'joindre',
          title: 'Joindre l’objet',
          body: `En mode **Simulation**, ouvre la ligne de commande d’Ordinateur 1 et teste la communication avec l’objet : \`ping\` suivi de son adresse.

Tu peux aussi installer le **navigateur web** sur l’ordinateur et taper l’adresse de l’objet : il affiche sa mesure.`,
          notions: ['ping', 'client-serveur'],
          hints: [
            'Le navigateur s’installe depuis « Installer des logiciels », sur le bureau de l’ordinateur.',
          ],
          objectives: [
            {
              id: 'ping-objet',
              label: 'La commande ping a été utilisée sur Ordinateur 1',
              check: { type: 'commandRan', command: 'ping', device: first },
            },
            {
              id: 'objet-joignable',
              label: 'Ordinateur 1 communique avec l’objet connecté',
              check: { type: 'ping', from: first, to: named('Objet connecté 1') },
            },
          ],
        },
      ],
    });
  },
};

const homeNetwork: BuiltinActivity = {
  id: 'reseau-maison',
  title: 'Le réseau de la maison',
  level: '4e',
  summary:
    'Autour d’une box : brancher un ordinateur, connecter un smartphone en Wi-Fi, voir la box distribuer les adresses.',
  build: () => {
    const network = new Network();
    network.addBox({ name: 'Box', position: { x: 520, y: 280 }, ssid: 'Maison' });
    const box = existing(network, 'Box');
    return define(network, {
      id: 'reseau-maison',
      title: 'Le réseau de la maison',
      level: '4e',
      duration: 30,
      intro: `À la maison, on branche un appareil sur la [[box]], ou on choisit son Wi-Fi, et « ça marche ». Pourquoi ? Parce que la box **distribue les adresses** toute seule.

Reconstruis ce réseau, puis regarde la box travailler.`,
      profile: { base: '4e' },
      steps: [
        {
          id: 'ordinateur',
          title: 'Brancher un ordinateur',
          body: `Ajoute un **Ordinateur** et relie-le à la box avec l’outil Câble.

Dans son panneau, coche **Configuration automatique (DHCP)** : c’est la box qui lui donnera son adresse.`,
          notions: ['box', 'dhcp'],
          hints: [
            'La case « Configuration automatique (DHCP) » est dans le panneau du bas, quand l’ordinateur est sélectionné.',
          ],
          objectives: [
            {
              id: 'ordinateur-relie',
              label: 'Ordinateur 1 est relié à la box',
              check: { type: 'linked', a: named('Ordinateur 1'), b: box },
            },
            {
              id: 'ordinateur-automatique',
              label: 'Ordinateur 1 est en configuration automatique',
              check: { type: 'config', device: named('Ordinateur 1'), field: 'dhcp', isSet: true },
            },
          ],
        },
        {
          id: 'wifi',
          title: 'Connecter un smartphone en Wi-Fi',
          body: `Ajoute un **Smartphone**. Il n’a pas de prise : dans son panneau, choisis le réseau sans fil **Maison**, celui de la box.

Coche aussi sa configuration automatique.`,
          notions: ['wifi'],
          hints: [
            'Le réseau sans fil (SSID) se choisit dans « Connexion réseau », dans le panneau du smartphone.',
          ],
          objectives: [
            {
              id: 'smartphone-relie',
              label: 'Smartphone 1 a rejoint le Wi-Fi de la box',
              check: { type: 'linked', a: named('Smartphone 1'), b: box },
            },
            {
              id: 'smartphone-automatique',
              label: 'Smartphone 1 est en configuration automatique',
              check: { type: 'config', device: named('Smartphone 1'), field: 'dhcp', isSet: true },
            },
          ],
        },
        {
          id: 'observer',
          title: 'Regarder la box distribuer les adresses',
          body: `Passe en mode **Simulation** : chaque appareil demande une adresse, la box répond. L’adresse reçue s’affiche sous l’appareil.

Ouvre la ligne de commande de l’ordinateur : \`ipconfig\` montre son adresse, et \`ping\` suivi de l’adresse du smartphone teste la communication.`,
          notions: ['dhcp', 'ping'],
          hints: [
            'Les adresses distribuées par la box commencent par 192.168.1. Un clic droit sur la box, puis « Afficher les tables de la box », en donne la liste.',
            'Double-clique sur l’ordinateur pour ouvrir son bureau, puis sur « Ligne de commande ».',
          ],
          objectives: [
            { id: 'simulation', label: 'La simulation a été lancée', check: { type: 'simulationStarted' } },
            {
              id: 'ipconfig',
              label: 'La commande ipconfig a été utilisée sur Ordinateur 1',
              check: { type: 'commandRan', command: 'ipconfig', device: named('Ordinateur 1') },
            },
            {
              id: 'communique',
              label: 'Ordinateur 1 communique avec Smartphone 1',
              check: { type: 'ping', from: named('Ordinateur 1'), to: named('Smartphone 1') },
            },
          ],
        },
      ],
    });
  },
};

const twoNetworks: BuiltinActivity = {
  id: 'deux-reseaux',
  title: 'Relier deux réseaux',
  level: '3e',
  summary: 'Faire communiquer deux salles grâce à un routeur : interfaces, passerelles, test du chemin.',
  build: () => {
    const network = new Network();
    const switchA = network.addSwitch({ name: 'Switch salle A', position: { x: 300, y: 260 } });
    const switchB = network.addSwitch({ name: 'Switch salle B', position: { x: 860, y: 260 } });
    network.addRouter({ name: 'Routeur', position: { x: 580, y: 420 } });
    const hosts = [
      ['Poste A1', '192.168.1.10', 120, 160, switchA.id],
      ['Poste A2', '192.168.1.11', 120, 360, switchA.id],
      ['Poste B1', '192.168.2.10', 1040, 260, switchB.id],
    ] as const;
    for (const [name, address, x, y, sw] of hosts) {
      const host = network.addHost('computer', {
        name,
        position: { x, y },
        config: { ip: ip(address), mask: MASK_24 },
      });
      network.connect(host.id, sw);
    }
    const router = existing(network, 'Routeur');
    const a1 = existing(network, 'Poste A1');
    const b1 = existing(network, 'Poste B1');
    return define(network, {
      id: 'deux-reseaux',
      title: 'Relier deux réseaux',
      level: '3e',
      duration: 40,
      intro: `La salle A (réseau \`192.168.1.0\`) et la salle B (réseau \`192.168.2.0\`) ont chacune leur switch. Leurs postes ne peuvent pas communiquer d’une salle à l’autre.

Il faut un [[routeur]] : il relie des réseaux différents. Il est posé sur le plan, mais ni branché ni réglé.`,
      profile: { base: '3e' },
      steps: [
        {
          id: 'brancher',
          title: 'Brancher le routeur',
          body: 'Relie le routeur au switch de la salle A, puis au switch de la salle B.',
          notions: ['routeur', 'reseau-local-internet'],
          hints: ['Le premier câble utilise l’interface eth0 du routeur, le second eth1.'],
          objectives: [
            {
              id: 'routeur-a',
              label: 'Le routeur est relié au switch de la salle A',
              check: { type: 'linked', a: router, b: existing(network, 'Switch salle A') },
            },
            {
              id: 'routeur-b',
              label: 'Le routeur est relié au switch de la salle B',
              check: { type: 'linked', a: router, b: existing(network, 'Switch salle B') },
            },
          ],
        },
        {
          id: 'interfaces',
          title: 'Donner une adresse à chaque interface',
          body: 'Clique sur le routeur. Chaque interface doit avoir une adresse **du réseau auquel elle est reliée** : une adresse libre de la salle A pour l’une, de la salle B pour l’autre.',
          notions: ['routeur', 'adresse-ip'],
          hints: [
            'Par habitude, on donne au routeur la première adresse du réseau.',
            'Par exemple : 192.168.1.1 côté salle A, 192.168.2.1 côté salle B.',
          ],
          objectives: [
            {
              id: 'interface-a',
              label: 'Une interface du routeur est dans le réseau 192.168.1.0',
              check: { type: 'routerInterface', device: router, inNetwork: '192.168.1.0/24' },
            },
            {
              id: 'interface-b',
              label: 'Une interface du routeur est dans le réseau 192.168.2.0',
              check: { type: 'routerInterface', device: router, inNetwork: '192.168.2.0/24' },
            },
          ],
        },
        {
          id: 'passerelles',
          title: 'Indiquer la passerelle de chaque poste',
          body: 'Pour sortir de son réseau, un poste confie ses messages à sa [[passerelle]] : l’adresse de l’interface du routeur qui est **dans son réseau**. Règle-la sur les trois postes.',
          notions: ['passerelle'],
          hints: [
            'La passerelle des postes de la salle A est l’adresse de l’interface du routeur reliée à la salle A.',
            'Le poste de la salle B aussi a besoin d’une passerelle : sans elle, il ne pourrait pas répondre.',
          ],
          objectives: [
            {
              id: 'passerelles-reglees',
              label: 'Chaque poste a une passerelle',
              check: {
                type: 'config',
                device: { by: 'kind', kind: 'computer' },
                field: 'gateway',
                isSet: true,
              },
            },
            {
              id: 'rien-a-signaler',
              label: 'Le bouton Vérifier ne signale plus rien',
              check: { type: 'lintClean' },
            },
          ],
        },
        {
          id: 'tester',
          title: 'Tester d’une salle à l’autre',
          body: 'En mode **Simulation**, depuis Poste A1, lance un `ping` vers Poste B1 (`192.168.2.10`), puis `traceroute` vers la même adresse : quel équipement le message traverse-t-il ?',
          notions: ['ping', 'ttl', 'table-de-routage'],
          hints: [
            'En cas d’échec, le bouton « Pourquoi ça ne marche pas ? » indique où le message s’arrête.',
          ],
          objectives: [
            {
              id: 'traceroute',
              label: 'La commande traceroute a été utilisée sur Poste A1',
              check: { type: 'commandRan', command: 'traceroute', device: a1 },
            },
            {
              id: 'a-vers-b',
              label: 'Poste A1 communique avec Poste B1',
              check: { type: 'ping', from: a1, to: b1 },
            },
          ],
        },
      ],
    });
  },
};

const troubleshooting: BuiltinActivity = {
  id: 'depannage',
  title: 'Dépannage : le site du collège ne s’affiche plus',
  level: '3e',
  summary: 'Trouver et réparer trois pannes dans le réseau du collège, à l’aide des outils de diagnostic.',
  build: () => {
    const network = exampleNetwork();
    const find = (name: string) => {
      const device = network.devices.find((d) => d.name === name);
      if (!device) throw new Error(`Réseau d’exemple : « ${name} » introuvable`);
      return device;
    };
    // Three faults: a cable is unplugged, the web server is stopped, and it lost its gateway.
    const router = find('Routeur');
    const servers = find('Switch serveurs');
    const cable = network.cables.find(
      (c) => (c.a === router.id && c.b === servers.id) || (c.a === servers.id && c.b === router.id),
    );
    if (cable) network.disconnect(cable.id);
    const web = network.host(find('Serveur web').id);
    web.webServer.setActive(false);
    web.updateConfig({ gateway: IP_ANY });
    const poste = existing(network, 'Poste 1');
    return define(network, {
      id: 'depannage',
      title: 'Dépannage : le site du collège ne s’affiche plus',
      level: '3e',
      duration: 40,
      intro: `Ce matin, plus personne dans la salle des élèves n’arrive à ouvrir \`www.college.fr\`. Hier, tout fonctionnait.

À toi de trouver ce qui ne va pas — il y a **plusieurs pannes** — et de réparer. Les outils du technicien : la commande \`ping\`, le bouton **Vérifier** et son test de communication.`,
      profile: { base: '3e' },
      steps: [
        {
          id: 'constater',
          title: 'Constater la panne',
          body: 'Passe en **Simulation** et, depuis Poste 1, essaie de joindre le serveur web : `ping www.college.fr`. Que répond la commande ?',
          notions: ['ping', 'guide-verifier'],
          hints: ['Après un ping raté, clique sur « Pourquoi ça ne marche pas ? ».'],
          objectives: [
            { id: 'simulation', label: 'La simulation a été lancée', check: { type: 'simulationStarted' } },
            {
              id: 'ping-essaye',
              label: 'La commande ping a été utilisée sur Poste 1',
              check: { type: 'commandRan', command: 'ping', device: poste },
            },
          ],
        },
        {
          id: 'reparer',
          title: 'Trouver et réparer',
          body: 'Reviens en **Conception**. Ouvre **Vérifier** : la vérification du réseau liste ce qui semble mal réglé, et « Tester une communication » indique où un message s’arrête. Corrige un problème à la fois, puis teste de nouveau.',
          notions: ['passerelle', 'liaison', 'client-serveur'],
          hints: [
            'Regarde le plan : tous les équipements sont-ils reliés ?',
            'Un message doit aussi pouvoir revenir : le serveur a-t-il une passerelle ?',
            'Un serveur web installé mais arrêté ne répond pas : il se démarre depuis sa fenêtre, en simulation.',
          ],
          objectives: [
            {
              id: 'reseau-sain',
              label: 'Le bouton Vérifier ne signale plus rien',
              check: { type: 'lintClean' },
            },
            {
              id: 'serveur-joignable',
              label: 'Poste 1 communique avec le serveur web',
              check: { type: 'ping', from: poste, to: existing(network, 'Serveur web') },
            },
          ],
        },
        {
          id: 'verifier',
          title: 'Vérifier que le site s’affiche',
          body: 'En simulation, ouvre le **navigateur web** de Poste 1 et va sur `www.college.fr`.',
          notions: ['web-http', 'dns'],
          hints: ['Si le ping fonctionne mais pas la page, c’est le logiciel serveur qu’il faut regarder.'],
          objectives: [
            {
              id: 'nom-traduit',
              label: 'Le nom www.college.fr est traduit en adresse',
              check: { type: 'resolves', from: poste, name: 'www.college.fr' },
            },
            {
              id: 'site-affiche',
              label: 'Le site du collège s’affiche depuis Poste 1',
              check: { type: 'httpGet', from: poste, url: 'http://www.college.fr/', contains: 'Bienvenue' },
            },
          ],
        },
      ],
    });
  },
};

export const BUILTIN_ACTIVITIES: readonly BuiltinActivity[] = [
  firstNetwork,
  connectedObject,
  homeNetwork,
  classroom,
  twoNetworks,
  troubleshooting,
  collegeMuseum,
];
