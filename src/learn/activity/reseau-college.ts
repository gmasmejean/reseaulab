import { Network } from '../../engine/network';
import type { BuiltinActivity } from './builtin';
import { MASK_24, define, existing, ip, named } from './define';
import { protectionOf } from './protect';

/* « Reconstruire le réseau du collège » : an activity for a class of 4e. Two
 * classrooms and the computer room are drawn as coloured zones; the pupil
 * finds out that each classroom needs its own switch (the one of the computer
 * room has four sockets and no more), links them to the central switch, gives
 * every device its address and mask from an addressing plan, then lets a DHCP
 * server configure laptops that join by Wi-Fi. Text and hints lead to each
 * idea, the pupil builds, and the questions come last. Like the other
 * activities, wording and questions are a proposal for the teacher to adjust. */

const PART_1 = 'Partie 1 — Câbler les salles';
const PART_2 = 'Partie 2 — Une adresse pour chaque appareil';
const PART_3 = 'Partie 3 — Des portables qui se règlent tout seuls';
const PART_4 = 'Partie 4 — Ce que j’ai compris';

/** Infrastructure of the school: read by the pupil, never set. */
const ROUTER = 'Routeur du collège';
/** Its four sockets: the router, the server, and one wall socket for each classroom. */
const CENTRAL = 'Switch salle info';
const SERVER = 'Serveur';

/** The devices of a classroom, as they stand on their tables: no cable, no address. */
export const ROOMS = [
  { postes: ['Poste 1A', 'Poste 1B', 'Poste 1C'], printer: 'Imprimante 1' },
  { postes: ['Poste 2A', 'Poste 2B', 'Poste 2C'], printer: 'Imprimante 2' },
] as const;

/** The three rooms, the infrastructure of the computer room, and the classrooms to cable. */
function startingNetwork(): Network {
  const network = new Network();
  const zone = (text: string, x: number, y: number, width: number, height: number, color: string) =>
    network.addNote({
      kind: 'zone',
      x,
      y,
      width,
      height,
      text,
      color,
      fontSize: 14,
      bold: true,
      italic: false,
    });
  zone('Salle informatique', 215, 20, 420, 180, '#dfe7fb');
  zone('Salle 1', 30, 230, 380, 330, '#dcf2df');
  zone('Salle 2', 440, 230, 380, 330, '#fdebd0');

  const server = network.addHost('server', {
    name: SERVER,
    position: { x: 290, y: 110 },
    config: { ip: ip('192.168.1.1'), mask: MASK_24 },
  });
  // A real switch: four sockets, two of them left for the classrooms.
  const central = network.addSwitch({
    name: CENTRAL,
    position: { x: 425, y: 110 },
    ports: 4,
    fixedPorts: true,
    ssid: 'Salle-Info',
  });
  const router = network.addRouter({ name: ROUTER, position: { x: 565, y: 110 } });
  router.setInterface(0, { ip: ip('192.168.1.254'), mask: MASK_24 });
  router.setInterface(1, { ip: ip('82.64.12.34'), mask: MASK_24 });
  network.connect(router.id, central.id);
  network.connect(server.id, central.id);
  network.addNote({
    kind: 'text',
    x: 648,
    y: 92,
    width: 180,
    height: 40,
    text: '→ vers Internet',
    color: '#555555',
    fontSize: 12,
    bold: false,
    italic: true,
  });

  // In each classroom: the computers along the wall, the printer in a corner,
  // and room left near the computer room for what the pupil will add.
  const tables = [
    { postes: [95, 215, 335], printer: 95 },
    { postes: [525, 645, 765], printer: 765 },
  ] as const;
  ROOMS.forEach((room, index) => {
    const at = tables[index];
    room.postes.forEach((name, i) => {
      network.addHost('computer', { name, position: { x: at?.postes[i] ?? 0, y: 480 } });
    });
    network.addHost('printer', { name: room.printer, position: { x: at?.printer ?? 0, y: 330 } });
  });
  return network;
}

export const schoolNetwork: BuiltinActivity = {
  id: 'reseau-college',
  title: 'Reconstruire le réseau du collège',
  level: '4e',
  summary:
    'Câbler deux salles de cours avec un switch chacune, les relier à la salle informatique, adresser postes et imprimantes, puis accueillir des portables grâce au DHCP.',
  build: () => {
    const network = startingNetwork();
    const ref = (name: string) => existing(network, name);
    const central = ref(CENTRAL);
    const server = ref(SERVER);
    const [room1, room2] = ROOMS;

    /** « X est relié au réseau du collège », for each device of a classroom. */
    const reached = (room: (typeof ROOMS)[number], prefix: string) =>
      [...room.postes, room.printer].map((name, i) => ({
        id: `${prefix}-relie-${i + 1}`,
        label: `${name} est relié${name.startsWith('Imprimante') ? 'e' : ''} au réseau du collège`,
        check: { type: 'linked', a: ref(name), b: central } as const,
      }));
    /**
     * One switch for the classroom, which is not the one of the other
     * classroom, and one cable from it to the computer room. The first label
     * does not name the switch: the pupil is to find out that one is needed.
     */
    const oneCable = (room: (typeof ROOMS)[number], other: (typeof ROOMS)[number], n: number) => ({
      id: `salle${n}-un-cable`,
      label:
        n === 1
          ? 'Un seul câble relie la salle 1 à la salle informatique'
          : `La salle ${n} a son propre switch : un seul câble la relie à la salle informatique`,
      check: {
        type: 'sameSwitch',
        devices: [...room.postes, room.printer].map(ref),
        uplink: central,
        apart: [...other.postes, other.printer].map(ref),
      } as const,
    });
    /** The addressing plan of a classroom: computers from .x1 to .x8, the printer at .x9. */
    const addressed = (room: (typeof ROOMS)[number], prefix: string, n: number) => [
      ...room.postes.map((name, i) => ({
        id: `${prefix}-adresse-${i + 1}`,
        label: `${name} a une adresse libre de la salle ${n} : de 192.168.1.${n}1 à 192.168.1.${n}8`,
        check: {
          type: 'config',
          device: ref(name),
          field: 'ip',
          inNetwork: '192.168.1.0/24',
          range: { from: `192.168.1.${n}1`, to: `192.168.1.${n}8` },
          unique: true,
        } as const,
      })),
      {
        id: `${prefix}-adresse-imprimante`,
        label: `${room.printer} a l’adresse 192.168.1.${n}9`,
        check: { type: 'config', device: ref(room.printer), field: 'ip', equals: `192.168.1.${n}9` } as const,
      },
      {
        id: `${prefix}-meme-reseau`,
        label: `Les appareils de la salle ${n} ont le masque du Serveur, 255.255.255.0 : ils sont dans le même réseau que lui`,
        check: {
          type: 'sameNetwork',
          devices: [...room.postes, room.printer, SERVER].map(ref),
        } as const,
      },
    ];

    return define(network, {
      id: 'reseau-college',
      title: 'Reconstruire le réseau du collège',
      level: '4e',
      duration: 110,
      intro: `Pendant les vacances, le collège a été **recâblé**. La **salle informatique** est prête : le routeur relie le collège à Internet, le serveur et le switch sont en place. Mais dans la **salle 1** et la **salle 2**, les postes et l’imprimante sont posés sur les tables… et rien n’est branché.

À toi de **reconstruire le réseau** :

- **Partie 1** : câbler les deux salles.
- **Partie 2** : donner une adresse à chaque appareil.
- **Partie 3** : accueillir des ordinateurs portables qui se règlent tout seuls.
- **Partie 4** : quelques questions pour vérifier ce que tu as compris.

**Plan d’adressage du collège** (réseau \`192.168.1.0\`, masque \`255.255.255.0\`) :

- salle informatique : serveur \`.1\`, routeur \`.254\` ;
- salle 1 : postes de \`.11\` à \`.18\`, imprimante \`.19\` ;
- salle 2 : postes de \`.21\` à \`.28\`, imprimante \`.29\` ;
- ordinateurs portables : de \`.100\` à \`.150\`, distribuées automatiquement.

Les objectifs se cochent tout seuls quand ils sont atteints. Si tu es bloqué, demande un **indice**. Avant de partir, clique sur [[ecran:enregistrer]] : tu pourras rouvrir ton fichier avec [[ecran:ouvrir]].`,
      profile: {
        base: '4e',
        // A box would bring its own DHCP server and its own network: not the story of this school.
        // No mask filled in with the address: giving every device its mask is part of the work.
        hide: ['device:box', 'device:object', 'device:smartphone', 'device:tablet', 'feature:mask-default'],
      },
      // The computer room is the infrastructure: its cables and settings stay as they are.
      protect: protectionOf(network, [ROUTER, CENTRAL]),
      steps: [
        /* ---------- Partie 1 ---------- */
        {
          id: 'salle-1',
          title: 'Relier la salle 1',
          part: PART_1,
          body: `Les trois postes et l’imprimante de la **salle 1** doivent rejoindre le réseau du collège, c’est-à-dire être reliés au **Switch salle info**.

Un [[switch]] relie les appareils branchés sur ses prises, ses **ports**. Clique sur le Switch salle info et lis le [[ecran:panneau]] : combien de ports a-t-il ? Combien sont encore libres ?

Avec l’outil [[ecran:cable]], essaie de brancher les appareils de la salle 1… et **lis le message** qui s’affiche. À toi de trouver comment relier **toute** la salle avec le matériel de la [[ecran:palette]].`,
          notions: ['switch', 'liaison'],
          hints: [
            'Le Switch salle info a 4 ports, pas un de plus : le routeur et le serveur en occupent deux. Il en reste un pour la salle 1 et un pour la salle 2.',
            'Une seule prise pour quatre appareils… Quel équipement de la palette a plusieurs ports et sert justement à relier les appareils d’un même lieu ?',
            'Ajoute un Switch et place-le dans la salle 1. Branche dessus les trois postes et l’imprimante, puis relie ce switch au Switch salle info.',
            'Si tu as déjà branché des appareils directement sur le Switch salle info, libère ses ports : clic droit sur le câble, puis « Supprimer le câble ».',
          ],
          solution: `Le **Switch salle info** n’a que 4 ports : routeur, serveur, et un port pour chaque salle. Au troisième appareil branché, le message « Switch salle info » n’a plus de port libre s’affiche. Il faut donc ajouter un **Switch** dans la salle 1, y brancher **Poste 1A, 1B, 1C** et **Imprimante 1**, puis le relier au **Switch salle info** par un seul câble. Les câbles posés directement sur le Switch salle info sont à supprimer.`,
          teacherNote:
            'La consigne ne dit pas d’ajouter un switch : l’élève le déduit du message « n’a plus de port libre ». Le dernier objectif vérifie que les quatre appareils sont branchés sur un même switch, lui-même relié directement au Switch salle info ; le nom que l’élève donne à ce switch ne compte pas.',
          objectives: [...reached(room1, 'salle1'), oneCable(room1, room2, 1)],
        },
        {
          id: 'salle-2',
          title: 'Relier la salle 2',
          body: `Tu as trouvé : un switch dans la salle, et **un seul câble** vers la salle informatique. C’est ce qu’on fait dans un vrai collège, où une seule prise murale arrive dans chaque salle.

Fais de même pour la **salle 2**, avec le dernier port libre du Switch salle info.

Observe ensuite ton plan : chaque appareil est relié au switch de sa salle, et chaque switch de salle au switch de la salle informatique. C’est une [[topologie]] **en étoile**, répétée à chaque étage du réseau.`,
          notions: ['switch', 'topologie'],
          hints: [
            'Comme pour la salle 1 : un nouveau Switch placé dans la salle 2, les trois postes et l’imprimante branchés dessus.',
            'N’oublie pas le câble entre le switch de la salle 2 et le Switch salle info.',
          ],
          solution: `Un second **Switch** dans la salle 2, avec **Poste 2A, 2B, 2C** et **Imprimante 2**, relié au **Switch salle info**. Le Switch salle info est alors complet : routeur, serveur, salle 1, salle 2.`,
          objectives: [...reached(room2, 'salle2'), oneCable(room2, room1, 2)],
        },

        /* ---------- Partie 2 ---------- */
        {
          id: 'adresses-salle-1',
          title: 'Les adresses de la salle 1',
          part: PART_2,
          partNote:
            'Tout est câblé, mais personne ne peut encore se parler : sur un réseau, un message est envoyé **à une adresse**. Sans adresse, un poste est comme une maison sans numéro.',
          body: `Clique sur le **Serveur** : le [[ecran:panneau]] montre son [[adresse-ip|adresse IP]], \`192.168.1.1\`, et son [[masque]], \`255.255.255.0\`. Avec ce masque, les **trois premiers nombres** (\`192.168.1\`) désignent le réseau du collège, et le **dernier** désigne l’appareil.

Donne maintenant une adresse **et** un masque à chaque appareil de la **salle 1**, en suivant le plan d’adressage (dans la consigne, en haut) :

- les postes : de \`192.168.1.11\` à \`192.168.1.18\`, une adresse **différente** pour chacun ;
- l’imprimante : \`192.168.1.19\` ;
- le masque : \`255.255.255.0\`, **le même pour tous**. Rien ne le remplit à ta place : sans masque, un appareil ne sait pas à quel réseau il appartient, et il ne peut joindre personne.`,
          notions: ['adresse-ip', 'masque', 'guide-configurer'],
          hints: [
            'Clique sur un poste : dans le panneau du bas, rubrique « Configuration IP », tape son adresse, puis son masque dans la case d’à côté : 255.255.255.0.',
            'Par exemple : 192.168.1.11 pour Poste 1A, 192.168.1.12 pour Poste 1B, 192.168.1.13 pour Poste 1C.',
            'Deux appareils ne doivent jamais avoir la même adresse : le réseau ne saurait plus à qui remettre les messages.',
            'Une adresse est acceptée mais l’objectif du masque reste à faire ? Un des quatre appareils a encore sa case « Masque » vide, ou un masque différent de celui du Serveur.',
          ],
          solution: `Par exemple **Poste 1A** \`192.168.1.11\`, **Poste 1B** \`192.168.1.12\`, **Poste 1C** \`192.168.1.13\` (toute adresse libre de \`.11\` à \`.18\` est acceptée), **Imprimante 1** \`192.168.1.19\`. Masque \`255.255.255.0\` partout.`,
          teacherNote:
            'Une adresse hors de la plage de la salle, ou déjà prise, n’est pas acceptée. Dans cette activité, le masque n’est pas proposé avec l’adresse : l’élève le tape sur chaque appareil, et l’objectif « masque du Serveur » le vérifie. Un masque oublié est aussi signalé par « Vérifier le réseau ».',
          objectives: addressed(room1, 'salle1', 1),
        },
        {
          id: 'adresses-salle-2',
          title: 'Les adresses de la salle 2',
          body: `Même travail pour la **salle 2** : postes de \`192.168.1.21\` à \`192.168.1.28\`, imprimante \`192.168.1.29\`, et toujours le masque \`255.255.255.0\`.

Le dernier nombre commence par le numéro de la salle : en lisant une adresse, le technicien du collège sait tout de suite où se trouve l’appareil. C’est à cela que sert un **plan d’adressage**.

Un doute ? Clique sur [[ecran:verifier]] : la vérification montre ce qui manque encore, appareil par appareil.`,
          notions: ['adresse-ip', 'masque', 'guide-verifier'],
          hints: [
            'Par exemple : 192.168.1.21, 192.168.1.22 et 192.168.1.23 pour les postes, 192.168.1.29 pour l’imprimante.',
            '« Vérifier le réseau » montre l’appareil concerné par chaque problème : une adresse en double, un masque oublié, un appareil non relié.',
          ],
          solution: `Par exemple **Poste 2A** \`192.168.1.21\`, **Poste 2B** \`192.168.1.22\`, **Poste 2C** \`192.168.1.23\`, **Imprimante 2** \`192.168.1.29\`, masque \`255.255.255.0\`. « Vérifier le réseau » ne signale alors plus rien.`,
          // No « Vérifier le réseau ne signale plus rien » here: a laptop just put on the plan, or a
          // DHCP server not started yet, would undo this step while the pupil works on the next part.
          objectives: addressed(room2, 'salle2', 2),
        },
        {
          id: 'tester',
          title: 'Tester d’une salle à l’autre',
          body: `Passe en mode [[ecran:simulation]]. Double-clique sur **Poste 1A**, ouvre la **Ligne de commande** et tape \`ping\` suivi de l’adresse de **Poste 2A**, dans l’autre salle.

Regarde le message voyager sur le plan : par combien de switchs passe-t-il ? Quatre lignes « Réponse de… » : les deux salles communiquent. Essaie aussi un \`ping\` vers le Serveur, \`192.168.1.1\`.`,
          notions: ['ping', 'guide-observer'],
          hints: [
            'Exemple, si Poste 2A a l’adresse 192.168.1.21 : ping 192.168.1.21',
            'Pas de réponse ? Reviens en Conception et clique sur « Vérifier le réseau » : un câble ou une adresse a peut-être été oublié.',
          ],
          solution: `\`ping 192.168.1.21\` depuis **Poste 1A** : quatre réponses. Le message passe par le switch de la salle 1, le Switch salle info, puis le switch de la salle 2.`,
          teacherNote:
            'Aucune communication n’est testée ici par « Vérifier mon travail » : un test deviendrait « à refaire » dès que l’élève modifie le réseau dans la partie 3. Câblage et adresses sont déjà vérifiés par les étapes précédentes ; les communications le sont à la dernière étape de la partie 3.',
          objectives: [
            { id: 'simulation', label: 'La simulation a été lancée', check: { type: 'simulationStarted' } },
            {
              id: 'commande-ping',
              label: 'La commande ping a été utilisée sur Poste 1A',
              check: { type: 'commandRan', command: 'ping', device: ref('Poste 1A') },
            },
          ],
        },

        /* ---------- Partie 3 ---------- */
        {
          id: 'serveur-dhcp',
          title: 'Un serveur qui distribue les adresses',
          part: PART_3,
          partNote:
            'Le collège achète des **ordinateurs portables**. Ils passent d’une salle à l’autre, on en ajoute, on en prête… Régler chaque adresse à la main prendrait un temps fou, et une seule erreur créerait une adresse en double.',
          body: `La solution : un serveur [[dhcp|DHCP]]. Quand un appareil se connecte, il demande une adresse, et le serveur lui en **prête** une qui est libre, avec le bon masque. Plus rien à régler à la main.

En [[ecran:simulation]], double-clique sur le **Serveur** :

- clique sur **Installer des logiciels** et installe le **Serveur DHCP** ;
- ouvre-le : dans « Adresses distribuées », tape la première adresse \`192.168.1.100\` et la dernière \`192.168.1.150\` (la plage prévue par le plan d’adressage) ;
- clique sur **Démarrer**.`,
          notions: ['dhcp', 'client-serveur'],
          hints: [
            'Le bureau du Serveur ne s’ouvre qu’en mode Simulation : double-clique sur le Serveur.',
            'La plage distribuée ne doit contenir aucune adresse déjà réglée à la main : c’est pour cela que le plan réserve .100 à .150 aux portables.',
          ],
          solution: `En simulation, sur le **Serveur** : « Installer des logiciels » → **Serveur DHCP** ; première adresse \`192.168.1.100\`, dernière adresse \`192.168.1.150\` ; **Démarrer**.`,
          teacherNote:
            'La plage saisie n’est pas vérifiée par un objectif. Une plage qui recouvre les adresses fixes (.11 à .29) peut donner à un portable l’adresse d’un poste : à contrôler d’un coup d’œil dans la fenêtre du Serveur DHCP.',
          objectives: [
            {
              id: 'dhcp-installe',
              label: 'Le Serveur DHCP est installé sur le Serveur',
              check: { type: 'installed', device: server, app: 'dhcpserver' },
            },
            {
              id: 'dhcp-demarre',
              label: 'Le Serveur DHCP est démarré',
              check: { type: 'serviceRunning', device: server, app: 'dhcpserver' },
            },
          ],
        },
        {
          id: 'portables',
          title: 'Connecter les portables',
          body: `Reviens en [[ecran:conception]]. Un portable n’a pas de câble : il se connecte en [[wifi|Wi-Fi]]. Ici, chaque switch de salle est aussi une borne Wi-Fi : clique sur le switch de la salle 1 pour lire le **nom de son Wi-Fi** dans le [[ecran:panneau]].

- Ajoute un **Portable** et place-le dans la salle 1.
- Dans son panneau, rubrique « Connexion réseau », choisis **Sans fil (Wi-Fi)** puis, dans « Réseau sans fil (SSID) », le Wi-Fi du switch de la salle 1.
- Rubrique « Configuration IP », coche **Configuration automatique (DHCP)** : tu ne tapes **aucune adresse**.

Recommence avec un second portable dans la **salle 2**, sur le Wi-Fi de la salle 2.`,
          notions: ['wifi', 'dhcp'],
          hints: [
            'Le premier portable ajouté s’appelle Portable 1 (salle 1), le second Portable 2 (salle 2). Garde ces noms.',
            'Le nom du Wi-Fi d’un switch se lit dans son panneau, rubrique « Point d’accès Wi-Fi ». Tu peux le changer : par exemple Salle-1 et Salle-2.',
            'Le Switch salle info n’a plus de port libre : un portable ne peut pas s’y connecter, même en Wi-Fi.',
          ],
          solution: `**Portable 1** dans la salle 1 : « Sans fil (Wi-Fi) », Wi-Fi du switch de la salle 1 (\`Wifi-1\` s’il n’a pas été renommé), « Configuration automatique (DHCP) » cochée. **Portable 2** dans la salle 2, sur le Wi-Fi du switch de la salle 2.`,
          teacherNote:
            'Les portables sont reconnus par leur nom par défaut, « Portable 1 » et « Portable 2 ». Un portable renommé, ou relié par câble au switch de sa salle, doit garder ce nom pour être reconnu ; le câble, lui, est accepté.',
          objectives: [
            {
              id: 'deux-portables',
              label: 'Il y a deux portables sur le plan',
              check: { type: 'deviceCount', kind: 'laptop', min: 2 },
            },
            {
              id: 'portable-1-wifi',
              label: 'Portable 1 est connecté au switch de la salle 1',
              check: {
                type: 'sameSwitch',
                devices: [ref('Poste 1A'), named('Portable 1')],
                apart: [ref('Poste 2A')],
              },
            },
            {
              id: 'portable-2-wifi',
              label: 'Portable 2 est connecté au switch de la salle 2',
              check: {
                type: 'sameSwitch',
                devices: [ref('Poste 2A'), named('Portable 2')],
                apart: [ref('Poste 1A')],
              },
            },
            {
              id: 'portables-auto',
              label: 'Les portables sont en configuration automatique (DHCP)',
              check: { type: 'config', device: { by: 'kind', kind: 'laptop' }, field: 'dhcp', isSet: true },
            },
            {
              id: 'reseau-sain',
              label: '« Vérifier le réseau » ne signale plus rien',
              check: { type: 'lintClean' },
            },
          ],
        },
        {
          id: 'observer-dhcp',
          title: 'Observer le DHCP',
          body: `Passe en [[ecran:simulation]] : dès le démarrage, des messages **DHCP** circulent entre les portables et le Serveur.

Pour revoir l’échange à ton rythme, double-clique sur **Portable 1** :

- ouvre la **Ligne de commande** et tape \`ipconfig /renew\` : le portable redemande une adresse, puis affiche celle qu’il a reçue. Est-elle bien dans la plage prévue ?
- ouvre **Échanges de données** : chaque ligne est un message envoyé ou reçu par le portable. Agrandis la fenêtre pour lire la colonne « Information », ou clique sur une ligne : les quatre derniers messages sont ceux de ta demande. Lis-les dans l’ordre.

Les lignes « ignorée » sont les demandes de l’autre portable : une demande DHCP est envoyée **à tout le réseau**, mais seul le serveur DHCP y répond.

Sur le **Serveur**, la fenêtre du Serveur DHCP tient la liste des « Baux attribués » : les adresses qu’il a prêtées.

Termine par **Vérifier mon travail**, dans ce panneau : RéseauLab teste que postes, imprimantes, serveur et portables communiquent tous.`,
          notions: ['dhcp', 'guide-observer'],
          hints: [
            'Les quatre messages : le portable demande « Qui peut me donner une adresse ? », le serveur en propose une, le portable la demande, le serveur l’accorde.',
            'Si ipconfig n’affiche pas d’adresse : le Serveur DHCP est-il bien démarré ? Le portable est-il connecté au Wi-Fi de sa salle ?',
            'Tu as modifié le réseau après un test ? Clique de nouveau sur « Vérifier mon travail ».',
          ],
          solution: `\`ipconfig /renew\` sur **Portable 1** affiche une adresse de \`192.168.1.100\` à \`192.168.1.150\` (\`.100\` ou \`.101\` avec deux portables) et le masque \`255.255.255.0\`. Dans « Échanges de données », les quatre derniers messages : « Qui peut me donner une adresse ? (DISCOVER) », « Je propose 192.168.1.100 (OFFER) », « Je demande 192.168.1.100 (REQUEST) », « Adresse 192.168.1.100 accordée (ACK) ». « Vérifier mon travail » teste ensuite quatre communications.`,
          objectives: [
            {
              id: 'commande-ipconfig',
              label: 'La commande ipconfig a été utilisée sur Portable 1',
              check: { type: 'commandRan', command: 'ipconfig', device: named('Portable 1') },
            },
            {
              id: 'ping-salles',
              label: 'Poste 1A communique avec Poste 2A, dans l’autre salle',
              check: { type: 'ping', from: ref('Poste 1A'), to: ref('Poste 2A') },
            },
            {
              id: 'ping-portables',
              label: 'Portable 1 communique avec Portable 2',
              check: { type: 'ping', from: named('Portable 1'), to: named('Portable 2') },
            },
            {
              id: 'ping-imprimante',
              label: 'Portable 2 communique avec Imprimante 1',
              check: { type: 'ping', from: named('Portable 2'), to: ref('Imprimante 1') },
            },
            {
              id: 'ping-serveur',
              label: 'Portable 1 communique avec le Serveur',
              check: { type: 'ping', from: named('Portable 1'), to: server },
            },
          ],
        },

        /* ---------- Partie 4 ---------- */
        {
          id: 'bilan-cablage',
          title: 'Le câblage',
          part: PART_4,
          partNote:
            'Le réseau du collège fonctionne. Réponds maintenant à ces questions : c’est ta **première réponse** qui compte, réfléchis avant de valider.',
          body: 'Reviens sur ce que tu as construit dans la partie 1. Tu peux regarder ton plan pour répondre.',
          notions: ['switch', 'topologie'],
          hints: [
            'Repense au message affiché quand tu as voulu brancher toute la salle 1 sur le Switch salle info.',
          ],
          objectives: [
            {
              id: 'q-ports',
              label: 'Les ports du Switch salle info',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Pourquoi n’as-tu pas pu brancher tous les appareils de la salle 1 directement sur le Switch salle info ?',
                  choices: [
                    'Il ne lui restait que 2 ports libres : un pour chaque salle',
                    'Les câbles étaient trop courts',
                    'Un switch ne peut relier que des serveurs',
                    'Les postes n’avaient pas encore d’adresse IP',
                  ],
                  correct: [0],
                  explanation:
                    'Le Switch salle info a 4 ports : le routeur et le serveur en occupent deux. Il en reste un par salle, pas un par appareil.',
                  notion: 'switch',
                },
              },
            },
            {
              id: 'q-switch-salle',
              label: 'Le rôle du switch de chaque salle',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'À quoi sert le switch que tu as ajouté dans chaque salle ?',
                  choices: [
                    'Relier entre eux les appareils de la salle, et les relier au reste du collège par un seul câble',
                    'Donner une adresse IP aux appareils de la salle',
                    'Relier la salle directement à Internet',
                    'Garder les fichiers des élèves de la salle',
                  ],
                  correct: [0],
                  explanation:
                    'Le switch relie les appareils d’un même lieu. Un seul câble part ensuite vers la salle informatique : c’est plus simple à poser et à dépanner que quatre câbles par salle.',
                  notion: 'switch',
                },
              },
            },
            {
              id: 'q-trajet',
              label: 'Le trajet d’un message',
              check: {
                type: 'question',
                question: {
                  type: 'order',
                  prompt:
                    'Poste 1A envoie un message à Poste 2A. Remets dans l’ordre les étapes de son trajet.',
                  items: [
                    'Poste 1A',
                    'Le switch de la salle 1',
                    'Le Switch salle info',
                    'Le switch de la salle 2',
                    'Poste 2A',
                  ],
                  explanation:
                    'Le message monte du poste au switch de sa salle, traverse le switch de la salle informatique, puis redescend par le switch de l’autre salle.',
                  notion: 'topologie',
                },
              },
            },
            {
              id: 'q-cable-coupe',
              label: 'Un câble débranché',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Le câble entre le switch de la salle 2 et le Switch salle info est débranché. Que se passe-t-il ?',
                  choices: [
                    'Les appareils de la salle 2 communiquent encore entre eux, mais plus avec le reste du collège',
                    'Plus rien ne fonctionne dans tout le collège',
                    'Rien ne change : les messages passent par le Wi-Fi',
                    'Seule l’Imprimante 2 est coupée du réseau',
                  ],
                  correct: [0],
                  explanation:
                    'Le switch de la salle 2 relie toujours ses propres appareils. Mais son seul chemin vers le reste du collège était ce câble.',
                  notion: 'topologie',
                },
              },
            },
          ],
        },
        {
          id: 'bilan-adresses',
          title: 'Les adresses',
          body: 'Reviens sur la partie 2 : adresse IP, masque et plan d’adressage.',
          notions: ['adresse-ip', 'masque'],
          hints: [
            'Avec le masque 255.255.255.0, deux adresses sont dans le même réseau si leurs trois premiers nombres sont identiques.',
          ],
          objectives: [
            {
              id: 'q-reglages',
              label: 'Ce qu’il faut régler',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Qu’as-tu réglé sur chaque poste pour qu’il puisse communiquer sur le réseau du collège ? (plusieurs réponses)',
                  choices: ['Une adresse IP', 'Un masque', 'Un mot de passe', 'Le nom de sa salle'],
                  correct: [0, 1],
                  explanation:
                    'Une adresse IP, différente pour chaque appareil, et un masque, le même pour tous : il dit quelle partie de l’adresse désigne le réseau.',
                  notion: 'adresse-ip',
                },
              },
            },
            {
              id: 'q-doublon',
              label: 'Deux fois la même adresse',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Par erreur, deux postes reçoivent la même adresse IP. Que se passe-t-il ?',
                  choices: [
                    'Le réseau ne sait plus auquel remettre les messages : la communication ne fonctionne plus correctement',
                    'Rien de gênant : ils se partagent les messages',
                    'Les deux postes vont deux fois plus vite',
                    'Le switch change tout seul une des deux adresses',
                  ],
                  correct: [0],
                  explanation:
                    'Une adresse désigne un seul appareil, comme un numéro dans une rue. En double, les messages peuvent arriver au mauvais poste.',
                  notion: 'adresse-ip',
                },
              },
            },
            {
              id: 'q-meme-reseau',
              label: 'Même réseau ?',
              check: {
                type: 'question',
                question: {
                  type: 'same-network',
                  prompt: 'Ces deux adresses sont-elles dans le même réseau ?',
                  notion: 'masque',
                },
              },
            },
            {
              id: 'q-nouveau-poste',
              label: 'Un nouveau poste',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'On installe un quatrième poste dans la salle 2. D’après le plan d’adressage, quelle adresse peut-il recevoir ?',
                  choices: [
                    'Une adresse encore libre entre 192.168.1.21 et 192.168.1.28',
                    '192.168.1.29',
                    'Une adresse entre 192.168.1.11 et 192.168.1.18',
                    '192.168.2.21',
                  ],
                  correct: [0],
                  explanation:
                    'Les postes de la salle 2 vont de .21 à .28. L’adresse .29 est celle de l’imprimante, .11 à .18 sont pour la salle 1, et 192.168.2.21 est dans un autre réseau.',
                  notion: 'adresse-ip',
                },
              },
            },
          ],
        },
        {
          id: 'bilan-dhcp',
          title: 'Le DHCP',
          body: 'Reviens sur la partie 3 : les portables et le serveur DHCP.',
          notions: ['dhcp'],
          hints: ['Relis la fenêtre « Échanges de données » de Portable 1, ou la fiche sur le DHCP.'],
          objectives: [
            {
              id: 'q-dhcp-ordre',
              label: 'L’échange DHCP',
              check: {
                type: 'question',
                question: {
                  type: 'order',
                  prompt: 'Remets dans l’ordre l’échange entre un portable et le serveur DHCP.',
                  items: [
                    'Le portable demande à tout le réseau : « Qui peut me donner une adresse ? »',
                    'Le serveur DHCP propose une adresse libre',
                    'Le portable demande cette adresse',
                    'Le serveur DHCP accorde l’adresse',
                  ],
                  explanation:
                    'Demande, proposition, choix, accord : quatre messages, et le portable est configuré sans que personne ne tape son adresse.',
                  notion: 'dhcp',
                },
              },
            },
            {
              id: 'q-dhcp-adresse',
              label: 'L’adresse reçue',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Laquelle de ces adresses un portable a-t-il pu recevoir du serveur DHCP ?',
                  choices: ['192.168.1.100', '192.168.1.11', '192.168.1.254', '192.168.2.100'],
                  correct: [0],
                  explanation:
                    'Le serveur ne distribue que les adresses de sa plage, de 192.168.1.100 à 192.168.1.150. Les autres sont réglées à la main, ou dans un autre réseau.',
                  notion: 'dhcp',
                },
              },
            },
            {
              id: 'q-adresse-fixe',
              label: 'Fixe ou automatique',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Pourquoi le Serveur et les imprimantes gardent-ils une adresse fixe, réglée à la main ?',
                  choices: [
                    'Les autres appareils doivent toujours les retrouver à la même adresse',
                    'Ils sont trop anciens pour utiliser le DHCP',
                    'Une adresse fixe rend le réseau plus rapide',
                    'Parce qu’ils sont reliés par un câble',
                  ],
                  correct: [0],
                  explanation:
                    'Pour imprimer ou joindre le serveur, il faut connaître son adresse : elle ne doit pas changer. Un portable, lui, n’est joint par personne : une adresse prêtée lui suffit.',
                  notion: 'dhcp',
                },
              },
            },
            {
              id: 'q-dhcp-arrete',
              label: 'Sans serveur DHCP',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Le serveur DHCP est arrêté. Un nouveau portable se connecte au Wi-Fi : que se passe-t-il ?',
                  choices: [
                    'Personne ne répond à sa demande : sans adresse, il ne peut pas communiquer',
                    'Il choisit lui-même une adresse libre',
                    'Le switch de la salle lui donne une adresse',
                    'Il prend l’adresse du portable voisin',
                  ],
                  correct: [0],
                  explanation:
                    'En configuration automatique, un appareil ne choisit jamais son adresse : il la demande. Sans serveur DHCP pour répondre, il reste sans adresse.',
                  notion: 'dhcp',
                },
              },
            },
            {
              id: 'q-bilan',
              label: 'Bilan',
              check: {
                type: 'question',
                question: {
                  type: 'open',
                  prompt:
                    'Explique avec tes mots comment tu as reconstruit le réseau du collège : le câblage, les adresses, puis les portables.',
                  explanation:
                    'Un switch par salle, relié par un seul câble au switch de la salle informatique ; une adresse IP unique et le même masque pour chaque appareil fixe, selon le plan d’adressage ; un serveur DHCP qui prête une adresse aux portables.',
                },
              },
            },
          ],
        },
      ],
    });
  },
};
