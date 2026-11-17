import { Network } from '../../engine/network';
import type { BuiltinActivity } from './builtin';
import { MASK_24, define, existing, ip } from './define';
import { protectionOf } from './protect';

/* « Du collège au musée » : an activity of two lessons of 1 h 30 for a class
 * of 3e. The first part checks what was learnt in 5e and 4e on the network
 * of the school library (components, links, files, good practice, IP
 * address and mask, troubleshooting, a connected object and its data). The
 * second one teaches the 3e programme: Internet as a network of networks,
 * the gateway, routing tables read and completed, DNS, HTTP, packets and
 * protocols, data representation, bit rate, two communicating objects, and
 * what is at stake. Up to its last steps the pupil keeps observing or
 * handling the simulator: sizes read in the file explorer, the file exported
 * by the sensor, a message sent from the sensor to a display. Two bonus
 * steps are for those who finish early. Like
 * the other activities, wording and questions are a proposal for the
 * teacher to adjust. */

/** The measures of the day of the CO2 sensor: hour, CO2 (ppm), temperature (°C). */
const MEASURES: readonly (readonly [string, string, string])[] = [
  ['08:00', '450', '18,2'],
  ['09:00', '780', '19,4'],
  ['10:00', '1150', '20,6'],
  ['11:00', '620', '19,8'],
  ['12:00', '910', '20,9'],
  ['13:00', '480', '20,1'],
  ['14:00', '870', '21,3'],
  ['15:00', '1240', '22,0'],
  ['16:00', '1320', '22,4'],
];

/** What the CO2 sensor of the library serves: its measures of the day. */
const SENSOR_PAGE = `<h1>Capteur de CO2 du CDI</h1>
<p>État : en marche. Une mesure par heure. Au-delà de 1000 ppm, il faut aérer.</p>
<table border="1">
<tr><th>Heure</th><th>CO2 (ppm)</th><th>Température (°C)</th></tr>
${MEASURES.map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join('')}</tr>`).join('\n')}
</table>
`;

/** The same measures as the sensor exports them for a spreadsheet: one line each, « ; » between the values. */
const SENSOR_CSV = `heure;co2_ppm;temperature_c
${MEASURES.map((row) => row.join(';')).join('\n')}
`;

/** What the display at the door of the library shows of itself. */
const DISPLAY_PAGE = `<h1>Afficheur du CDI</h1>
<p>État : en marche.</p>
<p>Affiche le dernier message reçu du capteur de CO2.</p>
`;

/** Port agreed by the sensor and the display: their « channel ». */
const DISPLAY_PORT = 7;

/** The home page of the museum, hosted in a data center. */
const MUSEUM_PAGE = `<h1>Musée des réseaux</h1>
<h2>Exposition : le voyage d’une information</h2>
<p>Votre demande vient de traverser plusieurs réseaux, de routeur en routeur, pour arriver jusqu’à ce serveur.</p>
<ul>
<li>Les câbles : presque toutes les communications entre continents (plus de 95 %) passent par des câbles sous-marins en fibre optique. Il en existe plusieurs centaines.</li>
<li>Les centres de données : ce serveur est rangé avec des milliers d’autres dans un data center, allumé jour et nuit et refroidi en permanence.</li>
<li>L’énergie : les centres de données consomment de l’ordre de 1 à 2 % de l’électricité mondiale. Mais c’est la fabrication de nos appareils qui pèse le plus dans l’empreinte du numérique.</li>
<li>La souveraineté : un pays qui dépend de câbles, de serveurs ou de logiciels contrôlés ailleurs dépend aussi des décisions d’autres pays.</li>
<li>Les métiers : technicien réseau, installateur de fibre, spécialiste en cybersécurité, technicien de data center, développeur…</li>
</ul>
`;

/** Files kept on the school's server, as in the network drive of a school. */
const SERVER_FILES: readonly (readonly [string, string])[] = [
  ['/Documents/Commun/charte-informatique.pdf', 'Charte d’usage du numérique.'],
  ['/Documents/Commun/calendrier-brevet.pdf', 'Calendrier du brevet.'],
  ['/Documents/3A/Nora/expose-internet.odt', 'Exposé : le chemin d’une information sur Internet.'],
  ['/Documents/3A/Nora/carte-cables.png', 'Carte des câbles sous-marins.'],
  // Five characters, five bytes: read in the file explorer (step « Représenter des données »).
  ['/Documents/3A/Nora/titre.txt', 'MUSEE'],
  ['/Documents/3A/Hugo/sources.txt', 'Sources de l’exposé.'],
  ['/Documents/3B/Yanis/notes.txt', 'Notes sur les data centers.'],
];

/**
 * What the pupil must not break: the switch of the library and everything
 * between the school and the museum. They only add to it: cables on the
 * switch, a route on the Routeur Internet, the link of the médiathèque.
 */
const INFRASTRUCTURE = [
  'Switch CDI',
  'Routeur du collège',
  'Routeur du FAI',
  'Switch FAI',
  'Serveur DNS du FAI',
  'Routeur Internet',
  'Routeur du data center',
  'Switch data center',
  'Serveur du musée',
  'Routeur de la médiathèque',
  'Switch médiathèque',
  'Portable médiathèque',
] as const;

/* Three parts, two lessons: the titles say which lesson, and a note under
 * the third one when to save and how to come back. */
const PART_1 = 'Séance 1 — Partie 1 : ce que je sais depuis la 5e et la 4e';
const PART_2 = 'Séance 1 — Partie 2 : Internet, un réseau de réseaux';
const PART_3 = 'Séance 2 — Partie 3 : trouver la panne, atteindre le musée';

const route = (destination: string, mask: string, gateway: string, iface: number) => ({
  destination: ip(destination),
  mask: ip(mask),
  gateway: ip(gateway),
  iface,
});

/** The library of the school, its way to Internet, and the museum's data center. */
function startingNetwork(): Network {
  const network = new Network();
  const note = (x: number, y: number, width: number, text: string) =>
    network.addNote({
      kind: 'text',
      x,
      y,
      width,
      height: 40,
      text,
      color: '#555555',
      fontSize: 12,
      bold: false,
      italic: true,
    });

  /* --- Le CDI du collège : 192.168.10.0/24 --- */
  note(60, 20, 260, 'CDI du collège — réseau 192.168.10.0');
  const sw = network.addSwitch({ name: 'Switch CDI', position: { x: 300, y: 330 }, ssid: 'CDI-College' });
  // Poste 2 has a typing mistake (192.168.1 instead of 192.168.10); Poste 3 is not plugged in.
  const postes = [
    ['Poste 1', '192.168.10.1', 100, 120, true],
    ['Poste 2', '192.168.1.2', 100, 240, true],
    ['Poste 3', '192.168.10.3', 100, 400, false],
  ] as const;
  for (const [name, address, x, y, plugged] of postes) {
    const host = network.addHost('computer', {
      name,
      position: { x, y },
      config: { ip: ip(address), mask: MASK_24 },
    });
    if (plugged) network.connect(host.id, sw.id);
    if (name === 'Poste 1') host.install('browser');
  }
  // The tablet has not joined the Wi-Fi of the library.
  network.addHost('tablet', {
    name: 'Tablette',
    position: { x: 160, y: 530 },
    config: { ip: ip('192.168.10.21'), mask: MASK_24 },
  });
  const server = network.addHost('server', {
    name: 'Serveur',
    position: { x: 420, y: 520 },
    config: { ip: ip('192.168.10.10'), mask: MASK_24 },
  });
  network.connect(server.id, sw.id);
  for (const [path, content] of SERVER_FILES) {
    server.fs.mkdir(path.slice(0, path.lastIndexOf('/')), true);
    server.fs.writeFile(path, content);
  }
  // As on the network drive of a school: pupils read the shared folder, they do not write in it.
  server.fs.setReadOnly('/Documents/Commun');
  // The CO2 sensor has just been unpacked: no link, no address.
  const sensor = network.addHost('object', { name: 'Capteur CO2', position: { x: 300, y: 600 } });
  sensor.fs.writeFile('/webserver/index.html', SENSOR_PAGE);
  sensor.fs.writeFile('/webserver/mesures.csv', SENSOR_CSV);
  sensor.install('echoclient');
  // The display is installed already. Its echo server, stopped, waits for the messages of the sensor.
  const display = network.addHost('object', {
    name: 'Afficheur',
    position: { x: 540, y: 600 },
    config: { ip: ip('192.168.10.51'), mask: MASK_24 },
  });
  network.connect(display.id, sw.id);
  display.fs.writeFile('/webserver/index.html', DISPLAY_PAGE);
  display.install('echoserver');
  display.echoServer.setPort(DISPLAY_PORT);

  /* --- Le routeur du collège --- */
  const college = network.addRouter({ name: 'Routeur du collège', position: { x: 520, y: 330 } });
  college.setInterface(0, { ip: ip('192.168.10.254'), mask: MASK_24 });
  college.setInterface(1, { ip: ip('82.64.12.34'), mask: MASK_24 });
  college.setStaticRoutes([route('0.0.0.0', '0.0.0.0', '82.64.12.1', 1)]);
  network.connect(college.id, sw.id, { portA: 0 });

  /* --- Le fournisseur d'accès (FAI) --- */
  note(640, 20, 240, 'Fournisseur d’accès à Internet');
  const fai = network.addRouter({ name: 'Routeur du FAI', position: { x: 760, y: 330 }, interfaces: 3 });
  fai.setInterface(0, { ip: ip('82.64.12.1'), mask: MASK_24 });
  fai.setInterface(1, { ip: ip('80.10.0.1'), mask: MASK_24 });
  fai.setInterface(2, { ip: ip('198.51.100.1'), mask: MASK_24 });
  fai.setStaticRoutes([
    route('192.168.10.0', '255.255.255.0', '82.64.12.34', 0),
    route('192.0.2.0', '255.255.255.0', '198.51.100.2', 2),
    route('203.0.113.0', '255.255.255.0', '198.51.100.2', 2),
  ]);
  network.connect(college.id, fai.id, { portA: 1, portB: 0 });
  const faiSwitch = network.addSwitch({ name: 'Switch FAI', position: { x: 760, y: 150 } });
  network.connect(fai.id, faiSwitch.id, { portA: 1 });
  const dns = network.addHost('server', {
    name: 'Serveur DNS du FAI',
    position: { x: 940, y: 90 },
    config: { ip: ip('80.10.0.53'), mask: MASK_24, gateway: ip('80.10.0.1') },
  });
  network.connect(dns.id, faiSwitch.id);
  dns.install('dnsserver');
  dns.dnsServer.updateConfig({
    records: [{ name: 'www.musee-des-reseaux.fr', type: 'A', value: '203.0.113.80' }],
  });
  dns.dnsServer.setActive(true);

  /* --- Le cœur d'Internet : il manque la route vers le data center --- */
  note(930, 390, 200, 'Cœur d’Internet');
  const core = network.addRouter({ name: 'Routeur Internet', position: { x: 1000, y: 330 } });
  core.setInterface(0, { ip: ip('192.0.2.1'), mask: MASK_24 });
  core.setInterface(1, { ip: ip('198.51.100.2'), mask: MASK_24 });
  core.setStaticRoutes([
    route('192.168.10.0', '255.255.255.0', '198.51.100.1', 1),
    route('82.64.12.0', '255.255.255.0', '198.51.100.1', 1),
    route('80.10.0.0', '255.255.255.0', '198.51.100.1', 1),
  ]);
  network.connect(fai.id, core.id, { portA: 2, portB: 1 });

  /* --- Le data center qui héberge le site du musée --- */
  note(1150, 20, 260, 'Data center — réseau 203.0.113.0');
  const datacenter = network.addRouter({ name: 'Routeur du data center', position: { x: 1240, y: 330 } });
  datacenter.setInterface(0, { ip: ip('192.0.2.2'), mask: MASK_24 });
  datacenter.setInterface(1, { ip: ip('203.0.113.1'), mask: MASK_24 });
  datacenter.setStaticRoutes([route('0.0.0.0', '0.0.0.0', '192.0.2.1', 0)]);
  network.connect(core.id, datacenter.id, { portA: 0, portB: 0 });
  const dcSwitch = network.addSwitch({ name: 'Switch data center', position: { x: 1240, y: 150 } });
  network.connect(datacenter.id, dcSwitch.id, { portA: 1 });
  const museum = network.addHost('server', {
    name: 'Serveur du musée',
    position: { x: 1420, y: 90 },
    config: { ip: ip('203.0.113.80'), mask: MASK_24, gateway: ip('203.0.113.1') },
  });
  network.connect(museum.id, dcSwitch.id);
  museum.install('webserver');
  museum.fs.writeFile('/webserver/index.html', MUSEUM_PAGE);
  museum.webServer.setActive(true);

  /* --- Bonus : la médiathèque, prête mais pas encore reliée au FAI --- */
  note(620, 650, 260, 'Médiathèque — réseau 192.168.20.0');
  const library = network.addRouter({ name: 'Routeur de la médiathèque', position: { x: 760, y: 560 } });
  library.setInterface(0, { ip: ip('82.64.13.34'), mask: MASK_24 });
  library.setInterface(1, { ip: ip('192.168.20.254'), mask: MASK_24 });
  library.setStaticRoutes([route('0.0.0.0', '0.0.0.0', '82.64.13.1', 0)]);
  const librarySwitch = network.addSwitch({ name: 'Switch médiathèque', position: { x: 980, y: 600 } });
  network.connect(library.id, librarySwitch.id, { portA: 1 });
  const laptop = network.addHost('laptop', {
    name: 'Portable médiathèque',
    position: { x: 1220, y: 600 },
    config: { ip: ip('192.168.20.5'), mask: MASK_24, gateway: ip('192.168.20.254') },
  });
  network.connect(laptop.id, librarySwitch.id);
  return network;
}

export const collegeMuseum: BuiltinActivity = {
  id: 'college-musee',
  title: 'Du collège au musée',
  level: '3e',
  summary:
    'Deux séances et un bonus : vérifier les acquis de 5e et de 4e au CDI, puis suivre et réparer le chemin d’une demande à travers Internet, jusqu’au site d’un musée.',
  build: () => {
    const network = startingNetwork();
    const ref = (name: string) => existing(network, name);
    const poste1 = ref('Poste 1');
    const sw = ref('Switch CDI');
    const sensor = ref('Capteur CO2');
    const display = ref('Afficheur');
    const museum = ref('Serveur du musée');
    return define(network, {
      id: 'college-musee',
      title: 'Du collège au musée',
      level: '3e',
      duration: 180,
      intro: `Ta classe prépare un exposé et doit consulter le site du **Musée des réseaux**, \`www.musee-des-reseaux.fr\`, hébergé dans un data center. Mais au **CDI**, des équipements ne fonctionnent pas, un **capteur de CO2** vient d’arriver… et le site ne s’affiche pas. À toi de tout remettre en marche, en deux séances.

**Plan d’adressage du CDI** (réseau \`192.168.10.0\`, masque \`255.255.255.0\`) : postes de \`.1\` à \`.9\`, serveur \`.10\`, tablettes de \`.20\` à \`.29\`, objets connectés de \`.50\` à \`.59\`, routeur du collège \`.254\`.

Les questions se corrigent tout de suite et c’est ta **première réponse** qui est notée : réfléchis avant de valider ! À la fin de chaque séance, clique sur [[ecran:enregistrer]] ; à la séance suivante, rouvre ton fichier avec [[ecran:ouvrir]].`,
      profile: { base: '3e' },
      protect: protectionOf(network, INFRASTRUCTURE),
      steps: [
        /* ---------- Partie 1 ---------- */
        {
          id: 'reseau-cdi',
          title: 'Le réseau du CDI',
          part: PART_1,
          body: 'Observe la partie gauche du plan : le réseau du **CDI**. Clique sur un équipement pour voir son nom et son type dans le [[ecran:panneau]].',
          notions: ['reseau-local-internet', 'terminal', 'switch', 'topologie'],
          hints: [
            'Le switch relie les équipements d’un même réseau ; le routeur relie des réseaux différents.',
          ],
          objectives: [
            {
              id: 'q-lan',
              label: 'Réseau local ou Internet',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Le réseau du CDI est…',
                  choices: ['un réseau local (LAN)', 'Internet', 'un réseau mondial qui relie tous les pays'],
                  correct: [0],
                  explanation:
                    'Il relie les équipements d’un même lieu : c’est un réseau local. Le routeur du collège le relie à Internet, le réseau des réseaux.',
                  notion: 'reseau-local-internet',
                },
              },
            },
            {
              id: 'q-terminaux',
              label: 'Les terminaux du CDI',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Lesquels de ces équipements sont des terminaux ? (plusieurs réponses)',
                  choices: [
                    'Poste 1',
                    'Tablette',
                    'Serveur',
                    'Capteur CO2',
                    'Switch CDI',
                    'Routeur du collège',
                  ],
                  correct: [0, 1, 2, 3],
                  explanation:
                    'Postes, tablettes, serveurs et objets connectés sont des terminaux : ils envoient ou reçoivent les données. Le switch et le routeur ne font que les relier.',
                  notion: 'terminal',
                },
              },
            },
            {
              id: 'q-roles',
              label: 'Switch, serveur, routeur',
              check: {
                type: 'question',
                question: {
                  type: 'match',
                  prompt: 'Associe chaque équipement du CDI à son rôle.',
                  pairs: [
                    ['Switch CDI', 'Relier les équipements du CDI entre eux'],
                    ['Serveur', 'Stocker et fournir les fichiers et les services'],
                    ['Routeur du collège', 'Relier le réseau du collège aux autres réseaux'],
                  ],
                  explanation:
                    'Le switch relie les équipements d’un même réseau, le serveur fournit des ressources aux clients, le routeur relie des réseaux différents.',
                  notion: 'switch',
                },
              },
            },
            {
              id: 'q-topologie',
              label: 'La topologie du CDI',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Les équipements du CDI sont tous reliés au même switch, placé au centre. Comment s’appelle cette topologie ?',
                  choices: ['En étoile', 'En anneau', 'En bus', 'En maille'],
                  correct: [0],
                  explanation:
                    'Un équipement central auquel chacun est relié : c’est une topologie en étoile.',
                  notion: 'topologie',
                },
              },
            },
          ],
        },
        {
          id: 'brancher',
          title: 'Brancher et connecter',
          solution: `Un câble de **Poste 3** au **Switch CDI** (outil Câble, deux clics). La **Tablette** : sélectionnée, puis « Connexion réseau » → \`CDI-College\` dans le panneau du bas.`,
          body: `**Poste 3** n’est pas branché : avec l’outil [[ecran:cable]], relie-le au **Switch CDI**.

La **Tablette** n’a pas de prise : sélectionne-la et, dans le [[ecran:panneau]], choisis le réseau Wi-Fi **CDI-College**.`,
          notions: ['liaison', 'wifi'],
          hints: [
            'Un câble se pose en deux clics : sur Poste 3, puis sur le switch.',
            'Le réseau sans fil se choisit dans « Connexion réseau », dans le panneau de la tablette.',
          ],
          objectives: [
            {
              id: 'poste3-relie',
              label: 'Poste 3 est relié au switch',
              check: { type: 'linked', a: ref('Poste 3'), b: sw },
            },
            {
              id: 'tablette-wifi',
              label: 'La tablette est connectée au Wi-Fi CDI-College',
              check: { type: 'linked', a: ref('Tablette'), b: sw },
            },
            {
              id: 'q-cable-wifi',
              label: 'Câble ou Wi-Fi',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Quels sont les avantages du câble par rapport au Wi-Fi ? (plusieurs réponses)',
                  choices: [
                    'Un débit souvent plus élevé et plus stable',
                    'Il est plus difficile à intercepter',
                    'On peut se déplacer librement avec son appareil',
                    'Il n’y a rien à installer',
                  ],
                  correct: [0, 1],
                  explanation:
                    'Le câble est plus rapide, plus stable et plus sûr ; le Wi-Fi permet de se déplacer sans fil, mais il est plus lent et doit être protégé.',
                  notion: 'liaison',
                },
              },
            },
          ],
        },
        {
          id: 'fichiers',
          title: 'Fichiers et bons usages',
          solution: `Explorateur de fichiers du **Serveur** : \`Documents\` › \`3A\` › \`Nora\` › \`carte-cables.png\`. Dans \`Commun\`, « Créer » un dossier ou « Supprimer » un fichier affiche *Dossier en lecture seule : /Documents/Commun* ; rien n’est modifié. Le simulateur n’a pas de comptes : le dossier est en lecture seule pour tout le monde.`,
          body: `Passe en mode [[ecran:simulation]], double-clique sur le **Serveur** et ouvre son **Explorateur de fichiers** : les dossiers des classes sont rangés dans \`Documents\`.

Ouvre le dossier \`Commun\` : comme sur le réseau du collège, il est en **lecture seule**. Essaie d’y créer un dossier, puis de supprimer un de ses fichiers, et lis le message.`,
          notions: ['fichiers-arborescence', 'securite-numerique'],
          hints: [
            'Ouvre Documents, puis 3A, puis Nora.',
            'Un chemin commence par / et sépare les dossiers par des / : /Dossier/Sous-dossier/fichier.ext',
          ],
          objectives: [
            {
              id: 'q-chemin',
              label: 'Le chemin d’un fichier',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'Nora (3A) a enregistré une carte des câbles sous-marins. Quel est le chemin complet de ce fichier sur le serveur ?',
                  accepted: [
                    '/Documents/3A/Nora/carte-cables.png',
                    'Documents/3A/Nora/carte-cables.png',
                    '\\Documents\\3A\\Nora\\carte-cables.png',
                  ],
                  explanation:
                    'Le chemin liste les dossiers à ouvrir, du plus grand au plus petit, puis le nom du fichier : /Documents/3A/Nora/carte-cables.png.',
                  notion: 'fichiers-arborescence',
                },
              },
            },
            {
              id: 'q-droits',
              label: 'Lecture seule',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Tu as essayé de créer un dossier dans Commun, qui est en lecture seule. Que peut-on y faire ?',
                  choices: [
                    'Consulter ses fichiers, mais ni les modifier, ni en ajouter, ni en supprimer',
                    'Modifier et supprimer ses fichiers',
                    'Y enregistrer mes propres fichiers',
                    'Rien, pas même ouvrir ses fichiers',
                  ],
                  correct: [0],
                  explanation:
                    'Lecture seule : on consulte, on peut copier chez soi, mais le serveur refuse tout changement (« Dossier en lecture seule »). Modifier, ajouter ou supprimer demande le droit d’écriture ; au collège, ce droit dépend du compte : les professeurs l’ont sur Commun, pas les élèves.',
                  notion: 'fichiers-arborescence',
                },
              },
            },
            {
              id: 'q-usurpation',
              label: 'Le compte d’un autre',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Un camarade a laissé sa session ouverte. Quelqu’un envoie un message moqueur depuis son compte. Comment cela s’appelle-t-il ?',
                  choices: [
                    'Une usurpation d’identité : c’est interdit',
                    'Une blague sans conséquence',
                    'Un partage de compte autorisé',
                    'Un piratage du serveur',
                  ],
                  correct: [0],
                  explanation:
                    'Agir avec le compte d’un autre, c’est usurper son identité. Pour s’en protéger : verrouiller sa session (Windows + L) et ne jamais prêter son mot de passe.',
                  notion: 'securite-numerique',
                },
              },
            },
          ],
        },
        {
          id: 'adresse-masque',
          title: 'Adresse IP et masque',
          solution: `\`ipconfig\` sur **Poste 1** affiche l’adresse \`192.168.10.1\` et le masque \`255.255.255.0\` ; la passerelle n’est pas encore réglée, c’est normal.`,
          body: 'Toujours en simulation, ouvre la **Ligne de commande** de **Poste 1** et tape `ipconfig` : la commande affiche les réglages réseau du poste.',
          notions: ['adresse-ip', 'masque', 'ip-privee-publique'],
          hints: [
            'Double-clique sur Poste 1, puis sur « Ligne de commande ».',
            'Avec le masque 255.255.255.0, les trois premiers nombres désignent le réseau.',
          ],
          objectives: [
            {
              id: 'ipconfig',
              label: 'La commande ipconfig a été utilisée sur Poste 1',
              check: { type: 'commandRan', command: 'ipconfig', device: poste1 },
            },
            {
              id: 'q-octet',
              label: 'Les nombres d’une adresse',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Pourquoi chaque nombre d’une adresse IPv4 va-t-il de 0 à 255 ?',
                  choices: [
                    'Il est codé sur un octet (8 bits), qui peut prendre 256 valeurs',
                    'Un réseau ne peut pas avoir plus de 255 équipements',
                    'C’est le nombre de pays reliés à Internet',
                    'C’est un choix au hasard',
                  ],
                  correct: [0],
                  explanation:
                    'Chaque nombre occupe un octet, soit 8 bits : 256 valeurs, de 0 à 255. Une adresse IPv4 fait 4 octets.',
                  notion: 'adresse-ip',
                },
              },
            },
            {
              id: 'q-partie-reseau',
              label: 'La partie réseau',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'Avec le masque 255.255.255.0, quelle est la partie « réseau » de l’adresse de Poste 1 ? (les trois premiers nombres, avec leurs points)',
                  accepted: ['192.168.10', '192.168.10.', '192.168.10.0'],
                  explanation:
                    '255.255.255.0 : les trois premiers nombres (192.168.10) désignent le réseau, le dernier (1) désigne le poste.',
                  notion: 'masque',
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
              id: 'q-privee',
              label: 'Privée ou publique',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Le routeur du collège a deux adresses : 192.168.10.254 du côté du CDI et 82.64.12.34 du côté du FAI. Laquelle est l’adresse publique du collège ?',
                  choices: ['82.64.12.34', '192.168.10.254', 'Les deux', 'Aucune'],
                  correct: [0],
                  explanation:
                    'Les adresses en 192.168. sont privées, valables seulement dans le réseau local. 82.64.12.34, fournie par le FAI, est l’adresse publique, visible sur Internet.',
                  notion: 'ip-privee-publique',
                },
              },
            },
          ],
        },
        {
          id: 'depanner',
          title: 'Dépanner le CDI',
          solution: `**Poste 2** a l’adresse \`192.168.1.2\` : une faute de frappe, elle n’est pas dans le réseau \`192.168.10.0\`. Adresse attendue : une adresse **libre** réservée aux postes, de \`192.168.10.1\` à \`192.168.10.9\` — par exemple \`192.168.10.2\` (\`.1\` est à Poste 1, \`.3\` à Poste 3). Une adresse hors de cette plage est refusée (« Hors du plan d’adressage »). Ensuite \`ping 192.168.10.2\` depuis Poste 1, puis **Vérifier mon travail**.

Le bouton « Vérifier le réseau » de la barre garde des alertes (passerelles manquantes, capteur non installé) : elles ne comptent pas à cette étape.`,
          body: `**Poste 2** ne communique avec personne. Trouve la panne et répare-la en respectant le plan d’adressage (dans la consigne, en haut).

Pour tester, lance un \`ping\` depuis Poste 1. Pour corriger, reviens en [[ecran:conception]], clique sur l’équipement et change son réglage. Le bouton [[ecran:verifier]] t’aide à repérer ce qui ne va pas. Il signale aussi des **passerelles** manquantes et le capteur pas encore installé : c’est normal, on s’en occupe plus tard.`,
          notions: ['depannage', 'adresse-ip', 'ping'],
          hints: [
            'Compare l’adresse de Poste 2 au plan d’adressage : réseau 192.168.10.0, postes de .1 à .9.',
            'Une adresse en 192.168.1. n’est pas dans le réseau 192.168.10.0 : il manque un chiffre.',
          ],
          objectives: [
            {
              id: 'q-demarche',
              label: 'La démarche de dépannage',
              check: {
                type: 'question',
                question: {
                  type: 'order',
                  prompt: 'Avant de commencer : remets dans l’ordre la démarche de dépannage.',
                  items: [
                    'Vérifier le câblage',
                    'Vérifier l’adresse IP (doublon, réseau, faute de frappe)',
                    'Vérifier le masque',
                    'Tester de nouveau avec ping',
                  ],
                  explanation:
                    'Du plus simple au plus subtil : câblage, adresse, masque, puis un nouveau test.',
                  notion: 'depannage',
                },
              },
            },
            {
              id: 'poste2-repare',
              label: 'Poste 2 a une adresse libre réservée aux postes : de 192.168.10.1 à 192.168.10.9',
              check: {
                type: 'config',
                device: ref('Poste 2'),
                field: 'ip',
                inNetwork: '192.168.10.0/24',
                // The addressing plan: without it, .50 would be accepted here and clash with the sensor later.
                range: { from: '192.168.10.1', to: '192.168.10.9' },
                unique: true,
              },
            },
            {
              id: 'ping-poste2',
              label: 'Poste 1 communique avec Poste 2',
              check: { type: 'ping', from: poste1, to: ref('Poste 2') },
            },
            {
              id: 'cdi-sain',
              label: 'Plus aucune erreur d’adresse au CDI : ni doublon, ni mauvais réseau',
              check: {
                type: 'lintClean',
                // L'Afficheur attend l'étape « Deux objets qui communiquent » pour démarrer son service.
                ignore: [
                  'gateway-missing',
                  'dns-missing',
                  'not-cabled',
                  'ip-missing',
                  'mask-missing',
                  'server-not-started',
                ],
              },
            },
          ],
        },
        {
          id: 'capteur',
          title: 'Le capteur de CO2',
          solution: `Câble du **Capteur CO2** au **Switch CDI** ; adresse \`192.168.10.50\`, masque \`255.255.255.0\` ; \`ping 192.168.10.50\` depuis Poste 1 ; navigateur de Poste 1 à \`http://192.168.10.50\`, puis **Vérifier mon travail**. Dans le tableau, le seuil de 1000 ppm est dépassé à 10:00 (1150 ppm), puis à 15:00 et 16:00.`,
          body: `Le **Capteur CO2** est un [[objet-connecte|objet connecté]] : il mesure le dioxyde de carbone de l’air, signe qu’il faut aérer. Ajoute-le au réseau :

- relie-le au **Switch CDI** ;
- donne-lui une **adresse fixe** : le plan d’adressage lui réserve \`192.168.10.50\`, avec le masque \`255.255.255.0\` ;
- teste-le avec un \`ping\` depuis Poste 1 ;
- en simulation, ouvre le **navigateur** de Poste 1 à l’adresse \`http://192.168.10.50\` pour lire sa table de mesures, puis **Vérifier mon travail**.`,
          notions: ['objet-connecte', 'donnees-objet', 'usage-raisonne'],
          hints: [
            'L’adresse et le masque se règlent dans le panneau du bas, en mode Conception.',
            'Une ligne du tableau = une mesure ; une colonne = un descripteur.',
          ],
          objectives: [
            {
              id: 'capteur-relie',
              label: 'Le capteur est relié au switch',
              check: { type: 'linked', a: sensor, b: sw },
            },
            {
              id: 'capteur-adresse',
              label: 'Le capteur a l’adresse 192.168.10.50',
              check: { type: 'config', device: sensor, field: 'ip', equals: '192.168.10.50' },
            },
            {
              id: 'capteur-masque',
              label: 'Le capteur a le masque 255.255.255.0',
              check: { type: 'config', device: sensor, field: 'mask', equals: '255.255.255.0' },
            },
            {
              id: 'capteur-joignable',
              label: 'Poste 1 communique avec le capteur',
              check: { type: 'ping', from: poste1, to: sensor },
            },
            {
              id: 'mesures-lues',
              label: 'Les mesures du capteur s’affichent sur Poste 1',
              check: { type: 'httpGet', from: poste1, url: 'http://192.168.10.50/', contains: 'CO2' },
            },
            {
              id: 'q-aerer',
              label: 'Quand aérer',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'À quelle heure le seuil de 1000 ppm est-il dépassé pour la première fois ? (écris-la comme dans le tableau)',
                  accepted: ['10:00', '10h00', '10h', '10'],
                  explanation:
                    'À 10:00, le capteur mesure 1150 ppm : il faut aérer. À 11:00, après la récréation, on retombe à 620 ppm.',
                  notion: 'donnees-objet',
                },
              },
            },
            {
              id: 'q-type-co2',
              label: 'Le type d’une donnée',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Quel est le type des valeurs de la colonne « CO2 (ppm) » ?',
                  choices: ['Nombre entier', 'Nombre décimal', 'Texte', 'Date et heure'],
                  correct: [0],
                  explanation:
                    '450, 780, 1150… n’ont pas de partie après la virgule : ce sont des nombres entiers, en ppm.',
                  notion: 'donnees-objet',
                },
              },
            },
            {
              id: 'q-donnees-collectees',
              label: 'Ce que révèle un objet connecté',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Le taux de CO2 monte quand il y a du monde dans une pièce. Si ces mesures partaient vers le serveur d’une entreprise, que pourrait-elle en déduire ?',
                  choices: [
                    'Les heures où la pièce est occupée',
                    'Rien d’autre que la qualité de l’air',
                    'Le nom des personnes présentes',
                    'Le contenu de leurs conversations',
                  ],
                  correct: [0],
                  explanation:
                    'Des mesures anodines, mises bout à bout, révèlent des habitudes. Avant d’installer un objet connecté, on se demande quelles données il envoie, et à qui.',
                  notion: 'usage-raisonne',
                },
              },
            },
          ],
        },

        /* ---------- Partie 2 : la fin de la 1re séance ---------- */
        {
          id: 'reseau-de-reseaux',
          title: 'Internet, un réseau de réseaux',
          part: PART_2,
          body: `Regarde maintenant tout le plan, de gauche à droite : le **CDI**, le **fournisseur d’accès** (FAI) et son serveur DNS, le **cœur d’Internet**, puis le **data center** où est hébergé le site du musée.

Chaque réseau a son adresse (192.168.10.0, 80.10.0.0, 203.0.113.0…). Des [[routeur|routeurs]] les relient entre eux.`,
          notions: ['routeur', 'chemin-internet', 'reseau-local-internet'],
          hints: ['Compte les icônes de routeur entre Poste 1 et le Serveur du musée.'],
          objectives: [
            {
              id: 'q-internet',
              label: 'Ce qu’est Internet',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Qu’est-ce qu’Internet ?',
                  choices: [
                    'Un réseau de réseaux, reliés entre eux par des routeurs',
                    'Un énorme ordinateur central qui contient tous les sites',
                    'Le Wi-Fi de la maison',
                    'Un logiciel pour naviguer sur le web',
                  ],
                  correct: [0],
                  explanation:
                    'Internet relie des millions de réseaux (collèges, maisons, entreprises, data centers) grâce à des routeurs.',
                  notion: 'chemin-internet',
                },
              },
            },
            {
              id: 'q-nb-routeurs',
              label: 'Les routeurs sur le chemin',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt: 'Combien de routeurs y a-t-il sur le chemin entre Poste 1 et le Serveur du musée ?',
                  accepted: ['4', 'quatre'],
                  explanation:
                    'Routeur du collège, routeur du FAI, Routeur Internet et routeur du data center : 4 routeurs. (Le routeur de la médiathèque n’est pas sur ce chemin.)',
                  notion: 'routeur',
                },
              },
            },
            {
              id: 'q-role-routeur',
              label: 'Le rôle d’un routeur',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Que fait un routeur quand il reçoit un paquet ?',
                  choices: [
                    'Il choisit vers quel voisin l’envoyer pour le rapprocher de sa destination',
                    'Il l’envoie à tous les équipements du monde',
                    'Il le garde jusqu’à ce que le destinataire vienne le chercher',
                    'Il traduit le nom du site en adresse',
                  ],
                  correct: [0],
                  explanation:
                    'Un routeur relie plusieurs réseaux ; pour chaque paquet, il choisit l’étape suivante d’après l’adresse de destination.',
                  notion: 'routeur',
                },
              },
            },
          ],
        },
        {
          id: 'passerelle',
          title: 'La passerelle',
          solution: `Passerelle \`192.168.10.254\` sur **Poste 1, Poste 2 et Poste 3**. En simulation, \`ping 82.64.12.1\` depuis Poste 1 répond ; puis **Vérifier mon travail**.`,
          teacherNote: 'La passerelle des **trois** postes est vérifiée, pas seulement celle de Poste 1.',
          body: `Pour envoyer un message hors de son réseau, un poste le confie à sa [[passerelle]] : le routeur de son réseau. Les postes du CDI n’en ont pas encore.

En [[ecran:conception]], règle la passerelle \`192.168.10.254\` (le Routeur du collège) sur **Poste 1, Poste 2 et Poste 3**. Puis, en simulation, teste depuis Poste 1 : \`ping 82.64.12.1\` (le routeur du FAI) et **Vérifier mon travail**.`,
          notions: ['passerelle'],
          hints: [
            'La passerelle se règle dans le panneau du bas, sous le masque.',
            'La passerelle est toujours une adresse du réseau du poste : 192.168.10.…',
          ],
          objectives: [
            {
              id: 'passerelles',
              label: 'Chaque ordinateur du CDI a la passerelle 192.168.10.254',
              check: {
                type: 'config',
                device: { by: 'kind', kind: 'computer' },
                field: 'gateway',
                equals: '192.168.10.254',
              },
            },
            {
              id: 'ping-fai',
              label: 'Poste 1 communique avec le routeur du FAI',
              check: { type: 'ping', from: poste1, to: { by: 'address', address: '82.64.12.1' } },
            },
            {
              id: 'q-passerelle',
              label: 'Pourquoi une passerelle',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Sans passerelle, que peut faire Poste 1 ?',
                  choices: [
                    'Communiquer seulement avec les équipements de son réseau, le CDI',
                    'Communiquer avec tout Internet, mais plus lentement',
                    'Plus rien du tout',
                    'Seulement afficher des sites web',
                  ],
                  correct: [0],
                  explanation:
                    'Sans passerelle, un poste ne sait pas à qui confier un message destiné à un autre réseau : il reste limité à son réseau local.',
                  notion: 'passerelle',
                },
              },
            },
          ],
        },
        {
          id: 'lire-table',
          title: 'Lire une table de routage',
          solution: `Rien à modifier, les tables se lisent en Conception. **Routeur du collège** : une seule route, \`0.0.0.0 / 0.0.0.0\` → \`82.64.12.1\`. **Routeur du FAI** : \`192.168.10.0\` → \`82.64.12.34\` ; \`192.0.2.0\` → \`198.51.100.2\` ; \`203.0.113.0\` → \`198.51.100.2\`.`,
          body: `Chaque routeur a une [[table-de-routage|table de routage]] : pour chaque **réseau de destination**, elle indique le **prochain routeur** (la passerelle) à qui envoyer le paquet.

Poste 1 veut envoyer un paquet au Serveur du musée, \`203.0.113.80\`. Suis-le pas à pas : en [[ecran:conception]], clique sur le **Routeur du collège**, puis sur le **Routeur du FAI**, et ouvre l’onglet **Routage** de chacun.

*Une route « 0.0.0.0 / 0.0.0.0 » est la route par défaut : elle sert pour toutes les destinations qui ne sont pas dans la table.*

*Tu vas voir que la table du FAI a une ligne pour le réseau privé du CDI, \`192.168.10.0\`. Dans la réalité, elle n’existerait pas : le routeur du collège remplace l’adresse privée des postes par son [[ip-privee-publique|adresse publique]] avant d’envoyer vers Internet, et le FAI ne connaît que celle-ci. Le simulateur ne fait pas ce remplacement.*`,
          notions: ['table-de-routage', 'passerelle', 'chemin-internet', 'ip-privee-publique'],
          hints: [
            'Le réseau du Serveur du musée est 203.0.113.0 : cherche cette ligne dans la table.',
            'La colonne « Passerelle » donne l’adresse du prochain routeur.',
          ],
          objectives: [
            {
              id: 'q-premier-saut',
              label: 'Le premier routeur',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    '203.0.113.80 n’est pas dans le réseau du CDI. À quelle adresse Poste 1 confie-t-il le paquet ?',
                  accepted: ['192.168.10.254'],
                  explanation:
                    'Poste 1 confie à sa passerelle tout paquet destiné à un autre réseau : 192.168.10.254.',
                  notion: 'passerelle',
                },
              },
            },
            {
              id: 'q-route-defaut',
              label: 'La route par défaut',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Le Routeur du collège n’a qu’une route : 0.0.0.0 / 0.0.0.0 → 82.64.12.1. Que veut-elle dire ?',
                  choices: [
                    'Tout paquet qui ne va pas au CDI part vers le routeur du FAI (82.64.12.1)',
                    'Les paquets sont détruits',
                    'Le routeur ne connaît aucun réseau',
                    'Les paquets reviennent à Poste 1',
                  ],
                  correct: [0],
                  explanation:
                    'La route par défaut s’applique à toutes les destinations qui ne sont pas dans la table : le collège confie tout le reste à son FAI.',
                  notion: 'table-de-routage',
                },
              },
            },
            {
              id: 'q-saut-fai',
              label: 'La table du FAI, à l’aller',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'D’après la table du Routeur du FAI, à quelle adresse envoie-t-il un paquet destiné à 203.0.113.80 ?',
                  accepted: ['198.51.100.2'],
                  explanation:
                    'La ligne « 203.0.113.0 / 255.255.255.0 → 198.51.100.2 » : le paquet part vers le Routeur Internet.',
                  notion: 'table-de-routage',
                },
              },
            },
            {
              id: 'q-saut-retour',
              label: 'La table du FAI, au retour',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'La réponse du musée revient vers Poste 1 (192.168.10.1). À quelle adresse le Routeur du FAI l’envoie-t-il ?',
                  accepted: ['82.64.12.34'],
                  explanation:
                    'La ligne « 192.168.10.0 → 82.64.12.34 » : la réponse est confiée au Routeur du collège, qui la remet à Poste 1.',
                  notion: 'table-de-routage',
                },
              },
            },
            {
              id: 'q-chemin-complet',
              label: 'Qui connaît le chemin',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Qui connaît le chemin complet de Poste 1 jusqu’au Serveur du musée ?',
                  choices: [
                    'Personne : chaque routeur ne connaît que l’étape suivante',
                    'Poste 1',
                    'Le Routeur du collège',
                    'Le serveur DNS',
                  ],
                  correct: [0],
                  explanation:
                    'Chaque routeur décide seulement de l’étape suivante, d’après sa table. C’est ce qui permet à Internet de contourner une panne.',
                  notion: 'chemin-internet',
                },
              },
            },
          ],
        },
        /* ---------- Partie 3 : la 2e séance ---------- */
        {
          id: 'trouver-panne',
          title: 'Trouver où le chemin s’arrête',
          solution: `\`ping 203.0.113.80\` échoue. \`traceroute 203.0.113.80\` affiche \`192.168.10.254\`, \`82.64.12.1\`, puis \`198.51.100.2\` qui répond *destination inaccessible*. Cette adresse est celle de l’interface eth1 du **Routeur Internet**. Sa table connaît \`192.168.10.0\`, \`82.64.12.0\` et \`80.10.0.0\` (toutes vers \`198.51.100.1\`) : aucune ligne pour \`203.0.113.0\`, et pas de route par défaut.`,
          teacherNote:
            'La consigne ne nomme pas le routeur : c’est à l’élève de le trouver. Le bouton « Pourquoi ça ne marche pas ? » n’est donné qu’au deuxième indice.',
          part: PART_3,
          partNote:
            '**La 1re séance s’arrête ici** : clique sur [[ecran:enregistrer]] et garde ton fichier. **À la 2e séance**, rouvre-le avec [[ecran:ouvrir]] : tu reprends à cette étape.',
          body: `En simulation, depuis Poste 1, lance \`ping 203.0.113.80\` : pas de réponse ! La passerelle est pourtant réglée. Quelque part entre le collège et le musée, un routeur ne sait pas continuer. À toi de trouver lequel.

- Lance \`traceroute 203.0.113.80\` : la commande affiche une ligne par routeur traversé, avec l’adresse de celui qui répond. Regarde où la liste s’arrête.
- En [[ecran:conception]], retrouve sur le plan le routeur qui porte cette adresse : clique sur les routeurs, le panneau du bas donne les adresses de leurs interfaces.
- Ouvre l’onglet **Routage** de ce routeur et lis sa table, comme à l’étape précédente.`,
          notions: ['ttl', 'table-de-routage', 'depannage'],
          hints: [
            'Dans traceroute, la dernière adresse affichée est celle du dernier routeur qui a reçu le paquet.',
            'Après un ping raté, le bouton « Pourquoi ça ne marche pas ? » montre sur le plan où le paquet s’arrête.',
            'Le routeur cherché est au milieu du plan, entre le FAI et le data center. Dans sa table, cherche une ligne pour le réseau du musée, 203.0.113.0.',
          ],
          objectives: [
            {
              id: 'traceroute',
              label: 'La commande traceroute a été utilisée sur Poste 1',
              check: { type: 'commandRan', command: 'traceroute', device: poste1 },
            },
            {
              id: 'q-dernier-routeur',
              label: 'Là où le paquet s’arrête',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'Avant toute réparation, quelle est l’adresse du dernier routeur qui répond dans traceroute ?',
                  accepted: ['198.51.100.2'],
                  explanation:
                    'traceroute affiche 192.168.10.254, 82.64.12.1, puis 198.51.100.2, qui répond « destination inaccessible » : le paquet arrive jusqu’à ce routeur, qui ne sait pas où l’envoyer ensuite.',
                  notion: 'ttl',
                },
              },
            },
            {
              id: 'q-routeur-en-cause',
              label: 'Le routeur en cause',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Quel routeur du plan porte cette adresse ?',
                  choices: [
                    'Le Routeur Internet',
                    'Le Routeur du collège',
                    'Le Routeur du FAI',
                    'Le Routeur du data center',
                  ],
                  correct: [0],
                  explanation:
                    '198.51.100.2 est l’adresse de l’interface eth1 du Routeur Internet, du côté du FAI. Les routeurs du collège et du FAI ont fait leur travail ; c’est lui qui s’arrête.',
                  notion: 'chemin-internet',
                },
              },
            },
            {
              id: 'q-table-incomplete',
              label: 'Ce que dit sa table',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Que montre la table de routage de ce routeur ?',
                  choices: [
                    'Aucune ligne pour le réseau du musée, et pas de route par défaut',
                    'Une ligne envoie le réseau du musée vers le Routeur du FAI',
                    'Une route par défaut vers le Routeur du data center',
                    'Sa table est vide',
                  ],
                  correct: [0],
                  explanation:
                    'Sa table connaît 192.168.10.0, 82.64.12.0 et 80.10.0.0, mais pas 203.0.113.0, et il n’a pas de route par défaut : il ne sait pas où envoyer le paquet, le détruit et prévient Poste 1 (« destination inaccessible »).',
                  notion: 'table-de-routage',
                },
              },
            },
          ],
        },
        {
          id: 'reparer-chemin',
          title: 'Réparer le chemin',
          solution: `Sur le **Routeur Internet**, onglet Routage, ajouter : réseau \`203.0.113.0\`, masque \`255.255.255.0\`, passerelle \`192.0.2.2\` (le Routeur du data center), interface eth0. \`traceroute 203.0.113.80\` affiche alors \`192.168.10.254\`, \`82.64.12.1\`, \`198.51.100.2\`, \`192.0.2.2\`, puis \`203.0.113.80\`.`,
          teacherNote:
            'Seul le résultat est vérifié : toute route qui fait aboutir le ping est acceptée, même écrite autrement.',
          body: `Le **Routeur Internet** ne sait pas où se trouve le réseau du data center : il lui manque une route. En [[ecran:conception]], ouvre son onglet **Routage** et ajoute-la : réseau \`203.0.113.0\`, masque \`255.255.255.0\`, passerelle = l’adresse du **Routeur du data center** qui est en face de lui. Choisis l’interface reliée à ce routeur.

En simulation, teste de nouveau avec \`ping 203.0.113.80\`, puis relance \`traceroute 203.0.113.80\` : la liste va maintenant jusqu’au musée.`,
          notions: ['table-de-routage', 'ttl', 'ping'],
          hints: [
            'Clique sur le câble entre le Routeur Internet et le Routeur du data center : quelles adresses ont leurs interfaces ?',
            'La passerelle à indiquer est 192.0.2.2 ; l’interface est eth0, celle qui est dans le réseau 192.0.2.0.',
            'traceroute affiche une ligne par routeur traversé, puis la destination.',
          ],
          objectives: [
            {
              id: 'ping-musee',
              label: 'Poste 1 communique avec le Serveur du musée',
              check: { type: 'ping', from: poste1, to: museum },
            },
            {
              id: 'q-traceroute',
              label: 'Lire un traceroute',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'Le chemin est réparé. D’après traceroute, quelle est maintenant l’adresse du dernier routeur traversé avant le Serveur du musée ?',
                  accepted: ['192.0.2.2'],
                  explanation:
                    'traceroute affiche 192.168.10.254, 82.64.12.1, 198.51.100.2, 192.0.2.2, puis 203.0.113.80 : le dernier routeur est celui du data center.',
                  notion: 'ttl',
                },
              },
            },
            {
              id: 'q-aller-retour',
              label: 'L’aller et le retour',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Pour qu’un ping réussisse à travers plusieurs réseaux, il faut…',
                  choices: [
                    'que chaque routeur connaisse le chemin à l’aller ET au retour',
                    'seulement que le premier routeur connaisse la destination',
                    'que tous les équipements soient dans le même réseau',
                    'que le serveur soit branché en Wi-Fi',
                  ],
                  correct: [0],
                  explanation:
                    'Le ping est un aller et un retour : la demande doit trouver son chemin jusqu’au serveur, et la réponse le sien jusqu’au poste.',
                  notion: 'chemin-internet',
                },
              },
            },
            {
              id: 'q-protocole-routage',
              label: 'Pourquoi un protocole de routage',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Tu as ajouté une route à la main. Pourquoi les routeurs d’Internet utilisent-ils plutôt un protocole de routage ?',
                  choices: [
                    'Ils s’échangent automatiquement les chemins connus, et s’adaptent aux pannes et aux nouveaux réseaux',
                    'Pour aller plus vite que la lumière',
                    'Parce qu’une route ajoutée à la main ne fonctionne jamais',
                    'Pour traduire les noms de sites en adresses',
                  ],
                  correct: [0],
                  explanation:
                    'Internet compte des millions de réseaux qui changent sans cesse : impossible de tout régler à la main. Un protocole de routage met les tables à jour automatiquement.',
                  notion: 'table-de-routage',
                },
              },
            },
          ],
        },
        {
          id: 'dns',
          title: 'Du nom à l’adresse : le DNS',
          solution: `Serveur DNS \`80.10.0.53\` sur **Poste 1**. En simulation, \`nslookup www.musee-des-reseaux.fr\` répond \`203.0.113.80\` ; puis **Vérifier mon travail**.`,
          teacherNote:
            'Seul Poste 1 est vérifié. La commande `nslookup` tapée sans nom de site ne valide pas l’objectif.',
          body: `Personne ne retient \`203.0.113.80\` : on tape \`www.musee-des-reseaux.fr\`. Le [[dns|serveur DNS]] traduit ce nom en adresse IP.

En [[ecran:conception]], indique à **Poste 1** le serveur DNS de son FAI : \`80.10.0.53\`. Puis, en simulation, tape dans sa ligne de commande \`nslookup www.musee-des-reseaux.fr\` et **Vérifier mon travail**.`,
          notions: ['dns'],
          hints: [
            'Le champ « Serveur DNS » est dans le panneau du bas, sous la passerelle.',
            'nslookup affiche le nom demandé et l’adresse trouvée.',
          ],
          objectives: [
            {
              id: 'dns-regle',
              label: 'Poste 1 a le serveur DNS 80.10.0.53',
              check: { type: 'config', device: poste1, field: 'dns', equals: '80.10.0.53' },
            },
            {
              id: 'nslookup',
              label: 'La commande nslookup a été utilisée sur Poste 1',
              check: { type: 'commandRan', command: 'nslookup', device: poste1 },
            },
            {
              id: 'nom-traduit',
              label: 'Le nom www.musee-des-reseaux.fr est traduit en adresse',
              check: { type: 'resolves', from: poste1, name: 'www.musee-des-reseaux.fr' },
            },
            {
              id: 'q-adresse-musee',
              label: 'L’adresse du site',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt: 'Quelle adresse IP le serveur DNS donne-t-il pour www.musee-des-reseaux.fr ?',
                  accepted: ['203.0.113.80'],
                  explanation: 'nslookup répond 203.0.113.80 : l’adresse du Serveur du musée.',
                  notion: 'dns',
                },
              },
            },
            {
              id: 'q-role-dns',
              label: 'Le rôle du DNS',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Sans serveur DNS, que se passe-t-il quand on tape www.musee-des-reseaux.fr ?',
                  choices: [
                    'Le poste ne trouve pas l’adresse IP du site : la page ne s’affiche pas',
                    'La page s’affiche plus lentement',
                    'La page s’affiche normalement',
                    'Le site change d’adresse',
                  ],
                  correct: [0],
                  explanation:
                    'Les paquets ne voyagent qu’avec des adresses IP : sans traduction du nom, le poste ne sait pas où envoyer sa demande. Taper directement l’adresse IP fonctionnerait encore.',
                  notion: 'dns',
                },
              },
            },
          ],
        },
        {
          id: 'site-musee',
          title: 'Afficher le site du musée',
          solution: `Navigateur web de **Poste 1** : \`www.musee-des-reseaux.fr\` affiche la page « Musée des réseaux », puis **Vérifier mon travail**. Si la page ne vient pas : passerelle de Poste 1, serveur DNS, route ajoutée au Routeur Internet.`,
          body: 'En simulation, ouvre le **Navigateur web** de Poste 1 et tape `www.musee-des-reseaux.fr`. Lis la page, puis **Vérifier mon travail**.',
          notions: ['web-http', 'client-serveur', 'chemin-internet'],
          hints: ['Si la page ne s’affiche pas, vérifie la passerelle, le DNS et la route ajoutée.'],
          objectives: [
            {
              id: 'site-affiche',
              label: 'Le site du musée s’affiche sur Poste 1',
              check: {
                type: 'httpGet',
                from: poste1,
                url: 'http://www.musee-des-reseaux.fr/',
                contains: 'Musée des réseaux',
              },
            },
            {
              id: 'q-client-serveur',
              label: 'Client et serveur',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Dans cet échange, quel est le rôle de Poste 1 ?',
                  choices: [
                    'Le client : il demande la page',
                    'Le serveur : il fournit la page',
                    'Le routeur : il relaie la page',
                    'Le serveur DNS : il traduit le nom',
                  ],
                  correct: [0],
                  explanation:
                    'Le navigateur de Poste 1 est le client : il envoie une requête HTTP ; le Serveur du musée lui répond avec la page.',
                  notion: 'client-serveur',
                },
              },
            },
            {
              id: 'q-etapes-requete',
              label: 'Les étapes d’une requête',
              check: {
                type: 'question',
                question: {
                  type: 'order',
                  prompt: 'Remets dans l’ordre ce qui se passe quand tu tapes www.musee-des-reseaux.fr.',
                  items: [
                    'Le serveur DNS traduit le nom en adresse IP',
                    'Poste 1 envoie la requête HTTP à sa passerelle',
                    'Les routeurs relaient les paquets de réseau en réseau',
                    'Le Serveur du musée répond en envoyant la page',
                    'Le navigateur affiche la page',
                  ],
                  explanation:
                    'Nom → adresse (DNS), puis la requête part de routeur en routeur jusqu’au serveur, qui renvoie la page par le même procédé.',
                  notion: 'chemin-internet',
                },
              },
            },
          ],
        },
        {
          id: 'paquets-protocoles',
          title: 'Paquets et protocoles',
          solution: `Bureau de **Poste 1** › **Échanges de données**, puis recharger la page du musée. Dans le détail d’une ligne de la requête, la couche Réseau (IP) donne la source \`192.168.10.1\` et la destination \`203.0.113.80\`.`,
          body: `En simulation, sur le bureau de **Poste 1**, ouvre **Échanges de données**, puis recharge la page du musée. Clique sur une ligne : le détail montre, couche par couche, ce que contient chaque [[trame-paquet|paquet]].

Pour communiquer, les équipements suivent des règles communes : des [[protocole|protocoles]].`,
          notions: ['trame-paquet', 'protocole', 'couches'],
          hints: [
            'La couche Réseau (IP) d’un paquet montre l’adresse de l’expéditeur et celle du destinataire.',
          ],
          objectives: [
            {
              id: 'q-adresse-destination',
              label: 'L’adresse de destination',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'Dans un paquet de la requête envoyée par Poste 1 au musée, quelle est l’adresse IP de destination ?',
                  accepted: ['203.0.113.80'],
                  explanation:
                    'Chaque paquet porte l’adresse du destinataire (203.0.113.80) et celle de l’expéditeur : les routeurs lisent la destination pour choisir l’étape suivante.',
                  notion: 'trame-paquet',
                },
              },
            },
            {
              id: 'q-paquets',
              label: 'Un message en paquets',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Qu’est-ce qui est vrai pour les paquets sur Internet ? (plusieurs réponses)',
                  choices: [
                    'Un gros message est découpé en plusieurs paquets',
                    'Chaque paquet porte l’adresse de l’expéditeur et celle du destinataire',
                    'Des paquets d’un même message peuvent prendre des chemins différents',
                    'Tous les paquets passent forcément par le même serveur central',
                  ],
                  correct: [0, 1, 2],
                  explanation:
                    'Le message est découpé en paquets adressés ; chacun est routé séparément et le destinataire les remet dans l’ordre.',
                  notion: 'trame-paquet',
                },
              },
            },
            {
              id: 'q-protocole',
              label: 'Ce qu’est un protocole',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Qu’est-ce qu’un protocole ?',
                  choices: [
                    'Un ensemble de règles communes pour que deux équipements se comprennent',
                    'Un câble spécial pour Internet',
                    'Un logiciel antivirus',
                    'Le nom d’un routeur',
                  ],
                  correct: [0],
                  explanation:
                    'Un protocole fixe la forme des messages et l’ordre des échanges : sans règles communes, pas de communication.',
                  notion: 'protocole',
                },
              },
            },
            {
              id: 'q-protocoles-roles',
              label: 'À chaque protocole son rôle',
              check: {
                type: 'question',
                question: {
                  type: 'match',
                  prompt: 'Associe chaque protocole à son rôle.',
                  pairs: [
                    ['IP', 'Donner une adresse à chaque équipement et acheminer les paquets'],
                    ['HTTP', 'Demander une page web et la recevoir'],
                    ['DNS', 'Traduire le nom d’un site en adresse IP'],
                    ['TCP', 'Vérifier que tous les paquets sont bien arrivés'],
                  ],
                  explanation:
                    'IP adresse et achemine les paquets de routeur en routeur ; HTTP règle le dialogue entre le navigateur et le serveur web ; DNS traduit les noms ; TCP vérifie que rien ne s’est perdu. Ils travaillent ensemble, chacun dans sa couche.',
                  notion: 'protocole',
                },
              },
            },
          ],
        },
        {
          id: 'donnees',
          title: 'Représenter des données',
          solution: `Explorateur du **Serveur**, \`Documents/3A/Nora\` : \`titre.txt\` fait 5 octets (le mot MUSEE). Navigateur de Poste 1, \`http://192.168.10.50/mesures.csv\` : une ligne de titres, puis une mesure par ligne, les valeurs séparées par des points-virgules.`,
          body: `Texte, image, nombre : pour être stockée ou transmise, toute information est transformée en **bits**, regroupés en **octets**. Vérifie-le sur de vrais fichiers, en simulation :

- sur le bureau du **Serveur**, ouvre l’**Explorateur de fichiers**, puis le dossier \`Documents/3A/Nora\` : la colonne « Taille » donne la taille de chaque fichier ;
- dans le **Navigateur web** de Poste 1, ouvre \`http://192.168.10.50/mesures.csv\` : c’est le fichier que le capteur de CO2 exporte pour un tableur.

Lis la fiche [[donnees-numeriques]] si besoin.`,
          notions: ['donnees-numeriques', 'donnees-objet'],
          hints: [
            'Dans l’explorateur du Serveur, ouvre Documents, puis 3A, puis Nora.',
            'Un caractère courant = 1 octet. Un pixel en couleurs = 3 octets (rouge, vert, bleu).',
            'En binaire, chaque chiffre vaut le double du suivant : …, 8, 4, 2, 1.',
          ],
          objectives: [
            {
              id: 'q-texte',
              label: 'La taille d’un texte',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'Le fichier titre.txt de Nora contient seulement le mot MUSEE. Quelle taille l’explorateur affiche-t-il, en octets ? (un nombre)',
                  accepted: ['5', 'cinq'],
                  explanation:
                    '5 octets : un octet par caractère (M, U, S, E, E). Un texte de 1 000 caractères pèse environ 1 000 octets, soit 1 Ko.',
                  notion: 'donnees-numeriques',
                },
              },
            },
            {
              id: 'q-format',
              label: 'Le format d’un fichier',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Dans mesures.csv, quel caractère sépare les valeurs d’une même ligne ?',
                  choices: [
                    'Le point-virgule ( ; )',
                    'La virgule ( , )',
                    'L’espace',
                    'Les deux-points ( : )',
                  ],
                  correct: [0],
                  explanation:
                    'Une ligne par mesure, un point-virgule entre les colonnes (heure ; CO2 ; température). La virgule, ici, est celle des nombres décimaux. L’extension .csv indique ce tableau écrit en texte, qu’un tableur ouvre pour tracer un graphique.',
                  notion: 'donnees-numeriques',
                },
              },
            },
            {
              id: 'q-image',
              label: 'La taille d’une image',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'Combien d’octets pour une image en couleurs de 100 × 100 pixels, à 3 octets par pixel, sans compression ? (un nombre)',
                  accepted: ['30000', '30 Ko', '30 kilooctets'],
                  explanation: '100 × 100 = 10 000 pixels ; 10 000 × 3 = 30 000 octets (30 Ko).',
                  notion: 'donnees-numeriques',
                },
              },
            },
            {
              id: 'q-binaire',
              label: 'Un nombre en binaire',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Quel nombre s’écrit 1010 en binaire ?',
                  choices: ['10', '1010', '5', '12'],
                  correct: [0],
                  explanation: '1010 = 1 × 8 + 0 × 4 + 1 × 2 + 0 × 1 = 10.',
                  notion: 'donnees-numeriques',
                },
              },
            },
          ],
        },
        {
          id: 'debit',
          title: 'Débit et ordres de grandeur',
          body: `Le [[debit|débit]] d’une liaison est le nombre de bits qu’elle transmet par seconde (bit/s, Mbit/s, Gbit/s).

Rappel : **1 octet = 8 bits**, et **temps = taille (en bits) ÷ débit (en bit/s)**.`,
          notions: ['debit'],
          hints: [
            'Une taille en Mo se multiplie par 8 pour l’avoir en Mbit.',
            '1 Go = 1 000 Mo ; 1 Gbit/s = 1 000 Mbit/s.',
          ],
          objectives: [
            {
              id: 'q-classer-debits',
              label: 'Classer les connexions',
              check: {
                type: 'question',
                question: {
                  type: 'order',
                  prompt:
                    'Range ces connexions de la plus lente à la plus rapide (ordres de grandeur habituels).',
                  items: ['ADSL', '4G', 'Fibre optique'],
                  explanation:
                    'ADSL : quelques Mbit/s ; 4G : quelques dizaines de Mbit/s ; fibre : plusieurs centaines de Mbit/s, voire des Gbit/s.',
                  notion: 'debit',
                },
              },
            },
            {
              id: 'q-temps-photo',
              label: 'Envoyer une photo',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'Combien de secondes faut-il pour envoyer une photo de 4 Mo avec un débit de 8 Mbit/s ? (un nombre)',
                  accepted: ['4'],
                  explanation: '4 Mo = 4 × 8 = 32 Mbit ; 32 ÷ 8 = 4 secondes.',
                  notion: 'debit',
                },
              },
            },
            {
              id: 'q-temps-video',
              label: 'Télécharger une vidéo',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'Combien de secondes faut-il pour télécharger une vidéo de 1,5 Go avec un débit de 100 Mbit/s ? (un nombre)',
                  accepted: ['120', '2 min', '2 minutes'],
                  explanation:
                    '1,5 Go = 1 500 Mo = 12 000 Mbit ; 12 000 ÷ 100 = 120 secondes, soit 2 minutes.',
                  notion: 'debit',
                },
              },
            },
            {
              id: 'q-debit-unite',
              label: 'Mbit/s ou Mo/s',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Une box annonce 1 Gbit/s. Combien de mégaoctets peut-elle recevoir par seconde, au mieux ?',
                  choices: ['125 Mo', '1 000 Mo', '8 000 Mo', '1 Mo'],
                  correct: [0],
                  explanation: '1 Gbit/s = 1 000 Mbit/s ; divisé par 8 : 125 Mo par seconde.',
                  notion: 'debit',
                },
              },
            },
          ],
        },
        {
          id: 'objets-communicants',
          title: 'Deux objets qui communiquent',
          solution: `Bureau de l’**Afficheur** › **Serveur écho** › Démarrer (port \`7\`). Bureau du **Capteur CO2** › **Client écho** vers \`192.168.10.51\` : le port \`8\` est refusé, le port \`7\` connecte. Le message \`CO2:1150\` revient en écho, et le journal de l’Afficheur note \`192.168.10.50 : CO2:1150\`.`,
          body: `Quand il faut aérer le CDI, le **Capteur CO2** prévient l’**Afficheur** placé à l’entrée (en bas du plan, adresse \`192.168.10.51\`). Les deux objets ont été programmés pour s’entendre : le même **port**, \`7\` — leur « canal », comme le canal radio de deux cartes programmables — et des messages de la forme \`CO2:1150\`.

En simulation :

- sur le bureau de l’**Afficheur**, ouvre le **Serveur écho** et clique sur **Démarrer** : il écoute sur le port 7 et renvoie chaque message reçu, en accusé de réception ;
- sur le bureau du **Capteur CO2**, ouvre le **Client écho**. Essaie d’abord de te connecter à \`192.168.10.51\` avec le port \`8\`, puis avec le port \`7\` ;
- une fois connecté, envoie \`CO2:1150\`, puis regarde le **journal** de l’Afficheur.

Lis la fiche [[objets-communicants]] si besoin.`,
          notions: ['objets-communicants', 'protocole'],
          hints: [
            'Dans le Client écho : l’adresse 192.168.10.51, le port, puis « Connecter ». Le message s’écrit en bas de la fenêtre.',
            'Celui qui envoie est l’émetteur ; celui qui reçoit est le récepteur.',
            'Le journal du Serveur écho écrit, pour chaque message reçu, l’adresse de celui qui l’a envoyé.',
          ],
          objectives: [
            {
              id: 'afficheur-ecoute',
              label: 'Le Serveur écho de l’Afficheur est démarré',
              check: { type: 'serviceRunning', device: display, app: 'echoserver' },
            },
            {
              id: 'q-mauvais-canal',
              label: 'Le mauvais port',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Avec le port 8, qu’affiche le Client écho du capteur ?',
                  choices: [
                    'Connexion refusée',
                    'Connexion fermée',
                    'Le serveur ne répond pas',
                    'Connecté à 192.168.10.51:8',
                  ],
                  correct: [0],
                  explanation:
                    'L’Afficheur n’écoute que sur le port 7 : sur le port 8, la connexion est refusée. Émetteur et récepteur doivent utiliser le même port, comme deux cartes radio le même canal.',
                  notion: 'objets-communicants',
                },
              },
            },
            {
              id: 'q-expediteur',
              label: 'L’émetteur du message',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'Dans le journal de l’Afficheur, quelle adresse IP est écrite devant le message CO2:1150 ?',
                  accepted: ['192.168.10.50'],
                  explanation:
                    '192.168.10.50 : l’adresse du capteur, qui a envoyé le message. Le capteur est l’émetteur, l’Afficheur le récepteur ; en renvoyant le message, l’Afficheur accuse réception.',
                  notion: 'objets-communicants',
                },
              },
            },
            {
              id: 'q-format-message',
              label: 'Un format différent',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Un élève modifie le programme du capteur, qui envoie maintenant « 1150 » au lieu de « CO2:1150 ». Que se passe-t-il ?',
                  choices: [
                    'Le message arrive, mais l’Afficheur ne le comprend pas',
                    'Le message n’est plus envoyé',
                    'L’Afficheur corrige le message tout seul',
                    'Tout fonctionne comme avant',
                  ],
                  correct: [0],
                  explanation:
                    'Le format du message fait partie des règles convenues : si l’émetteur ne le respecte plus, le récepteur ne sait plus lire la valeur.',
                  notion: 'objets-communicants',
                },
              },
            },
            {
              id: 'q-convenir',
              label: 'Ce qu’il faut décider',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Que faut-il décider ensemble avant de programmer deux objets qui communiquent ? (plusieurs réponses)',
                  choices: [
                    'Le port, ou le canal radio, utilisé',
                    'Le format des messages',
                    'Ce que fait le récepteur pour chaque message',
                    'La couleur des boîtiers',
                  ],
                  correct: [0, 1, 2],
                  explanation:
                    'Canal, format des messages et réaction du récepteur : c’est le petit protocole des deux objets.',
                  notion: 'objets-communicants',
                },
              },
            },
          ],
        },
        {
          id: 'enjeux',
          title: 'Les enjeux du numérique',
          solution: `Les réponses sont dans la page du musée, affichée à l’étape « Afficher le site du musée ».`,
          body: 'Relis la page du **Musée des réseaux** dans le navigateur de Poste 1 : elle présente ce qui se cache derrière Internet. Aide-toi aussi de la fiche [[enjeux-numerique]].',
          notions: ['enjeux-numerique'],
          hints: ['Toutes les réponses sont dans la page du musée.'],
          objectives: [
            {
              id: 'q-cables',
              label: 'Les câbles sous-marins',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Par où passent presque toutes les communications entre continents ?',
                  choices: ['Des câbles sous-marins', 'Des satellites', 'Les antennes 4G', 'Le Wi-Fi'],
                  correct: [0],
                  explanation:
                    'Plus de 95 % des communications entre continents passent par des câbles en fibre optique posés au fond des océans.',
                  notion: 'enjeux-numerique',
                },
              },
            },
            {
              id: 'q-data-center',
              label: 'Un data center',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Qu’est-ce qu’un data center ?',
                  choices: [
                    'Un bâtiment rempli de serveurs qui hébergent sites, vidéos et données',
                    'Un nuage où les données flottent sans matériel',
                    'Le routeur de la maison',
                    'Un logiciel de stockage',
                  ],
                  correct: [0],
                  explanation:
                    'Le « cloud », ce sont des serveurs bien réels, rangés dans des centres de données allumés jour et nuit.',
                  notion: 'enjeux-numerique',
                },
              },
            },
            {
              id: 'q-empreinte',
              label: 'L’empreinte du numérique',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Quel geste réduit le plus l’empreinte environnementale de ton numérique ?',
                  choices: [
                    'Garder son smartphone plus longtemps et le faire réparer',
                    'Changer de smartphone chaque année',
                    'Laisser ses appareils en veille la nuit',
                    'Regarder les vidéos en meilleure qualité',
                  ],
                  correct: [0],
                  explanation:
                    'La fabrication des appareils pèse plus que leur utilisation : les garder longtemps est le geste le plus efficace.',
                  notion: 'enjeux-numerique',
                },
              },
            },
            {
              id: 'q-metiers',
              label: 'Les métiers du réseau',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Lesquels sont des métiers du réseau et de la cybersécurité ? (plusieurs réponses)',
                  choices: [
                    'Technicien ou administrateur réseau',
                    'Installateur de fibre optique',
                    'Analyste en cybersécurité',
                    'Boulanger',
                  ],
                  correct: [0, 1, 2],
                  explanation:
                    'Installer, faire fonctionner et protéger les réseaux : des métiers qui recrutent, du CAP au diplôme d’ingénieur.',
                  notion: 'enjeux-numerique',
                },
              },
            },
            {
              id: 'q-strategique',
              label: 'Un enjeu stratégique',
              check: {
                type: 'question',
                question: {
                  type: 'open',
                  prompt:
                    'En deux ou trois phrases : pourquoi les réseaux et les centres de données sont-ils stratégiques pour un pays ? Donne au moins deux arguments.',
                  explanation:
                    'Pistes : toute la société en dépend (santé, banques, écoles, entreprises) ; dépendre de câbles ou de serveurs contrôlés ailleurs, c’est dépendre des décisions d’autres pays (souveraineté) ; ils consomment de l’énergie ; ils créent des emplois.',
                },
              },
            },
          ],
        },
        {
          id: 'bilan',
          title: 'Bilan',
          body: 'Réponds à la dernière question. Ouvre ensuite le [[ecran:compte-rendu]] : écris ton nom, ta classe et ce que tu as appris. Enfin, clique sur [[ecran:enregistrer]] pour garder ton travail et le rendre.',
          notions: ['chemin-internet', 'table-de-routage', 'dns'],
          hints: [
            'Reprends les étapes « Lire une table de routage », « Réparer le chemin » et « Du nom à l’adresse ».',
          ],
          objectives: [
            {
              id: 'q-bilan',
              label: 'Le chemin d’une demande',
              check: {
                type: 'question',
                question: {
                  type: 'open',
                  prompt:
                    'Décris le chemin de ta demande, de Poste 1 jusqu’au Serveur du musée : par quels équipements passe-t-elle, et pourquoi le routage est-il nécessaire ?',
                  explanation:
                    'Le DNS traduit le nom en 203.0.113.80 ; Poste 1 confie la requête à sa passerelle (Routeur du collège) ; chaque routeur (collège, FAI, Internet, data center) lit sa table pour choisir le suivant ; le serveur répond par le chemin inverse. Sans routage, un paquet ne pourrait pas sortir de son réseau.',
                },
              },
            },
          ],
        },

        /* ---------- Bonus ---------- */
        {
          id: 'bonus-mediatheque',
          title: 'Relier la médiathèque',
          solution: `**Routeur du FAI** : « Ajouter une interface » (elle s’appelle eth3), puis un câble vers le **Routeur de la médiathèque**. Adresse de eth3 : \`82.64.13.1\`, masque \`255.255.255.0\`. Onglet Routage du Routeur du FAI : réseau \`192.168.20.0\`, masque \`255.255.255.0\`, passerelle \`82.64.13.34\`, interface eth3. \`ping 192.168.20.5\` depuis Poste 1, puis **Vérifier mon travail**. Le Routeur Internet n’a pas besoin de cette route.`,
          bonus: true,
          body: `La **médiathèque** de la ville (réseau \`192.168.20.0\`, en bas du plan) s’abonne chez le même FAI. Son routeur est réglé, mais il n’est pas relié.

- En [[ecran:conception]], ajoute une **interface** au **Routeur du FAI** (bouton « Ajouter une interface »), puis relie-le au **Routeur de la médiathèque** avec un câble.
- Donne à cette nouvelle interface l’adresse \`82.64.13.1\`, masque \`255.255.255.0\` (le routeur de la médiathèque a \`82.64.13.34\`).
- Dans l’onglet **Routage** du Routeur du FAI, ajoute la route vers \`192.168.20.0\` / \`255.255.255.0\` par \`82.64.13.34\`, sur la nouvelle interface.
- Teste depuis Poste 1 : \`ping 192.168.20.5\`, puis **Vérifier mon travail**.`,
          notions: ['routeur', 'table-de-routage'],
          hints: [
            'La nouvelle interface s’appelle eth3 : le câble posé ensuite l’utilise.',
            'Le Routeur Internet n’a pas besoin de cette route : le chemin du collège à la médiathèque ne passe que par le FAI.',
          ],
          objectives: [
            {
              id: 'interface-mediatheque',
              label: 'Le Routeur du FAI a une interface dans le réseau 82.64.13.0',
              check: {
                type: 'routerInterface',
                device: ref('Routeur du FAI'),
                inNetwork: '82.64.13.0/24',
              },
            },
            {
              id: 'fai-mediatheque-relies',
              label: 'Le Routeur du FAI est relié au routeur de la médiathèque',
              check: { type: 'linked', a: ref('Routeur du FAI'), b: ref('Routeur de la médiathèque') },
            },
            {
              id: 'ping-mediatheque',
              label: 'Poste 1 communique avec le Portable de la médiathèque',
              check: { type: 'ping', from: poste1, to: ref('Portable médiathèque') },
            },
          ],
        },
        {
          id: 'bonus-defi',
          title: 'Défi : routage sans ordinateur',
          bonus: true,
          body: `Trois routeurs R1, R2 et R3 relient quatre réseaux. Voici leurs tables :

- **R1** : 10.1.0.0 → directe ; 10.2.0.0 → R2 ; 0.0.0.0 (par défaut) → R2.
- **R2** : 10.2.0.0 → directe ; 10.1.0.0 → R1 ; 10.3.0.0 → R3 ; 10.4.0.0 → R3.
- **R3** : 10.3.0.0 → directe ; 10.4.0.0 → directe ; 0.0.0.0 (par défaut) → R2.

Un ordinateur du réseau 10.1.0.0 envoie un paquet à une imprimante du réseau 10.4.0.0.`,
          notions: ['table-de-routage', 'routeur', 'ip-privee-publique'],
          hints: [
            'Le paquet part de R1 : cherche 10.4.0.0 dans sa table ; s’il n’y est pas, prends la route par défaut.',
          ],
          objectives: [
            {
              id: 'q-defi-trajet',
              label: 'Le trajet du paquet',
              check: {
                type: 'question',
                question: {
                  type: 'order',
                  prompt: 'Remets dans l’ordre les routeurs traversés par le paquet.',
                  items: ['R1', 'R2', 'R3'],
                  explanation:
                    'R1 ne connaît pas 10.4.0.0 : route par défaut vers R2. R2 envoie 10.4.0.0 vers R3, qui le remet directement à l’imprimante.',
                  notion: 'table-de-routage',
                },
              },
            },
            {
              id: 'q-defi-retour',
              label: 'La réponse',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'L’imprimante répond. Par quel routeur R3 fait-il passer la réponse destinée au réseau 10.1.0.0 ?',
                  choices: [
                    'R2, par sa route par défaut',
                    'R1 directement',
                    'Aucun : la réponse est perdue',
                    'R3 la garde',
                  ],
                  correct: [0],
                  explanation:
                    'R3 ne connaît pas 10.1.0.0 : sa route par défaut l’envoie à R2, qui connaît R1.',
                  notion: 'table-de-routage',
                },
              },
            },
            {
              id: 'q-defi-panne',
              label: 'Une liaison coupée',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'La liaison entre R2 et R3 est coupée, mais il existe un autre chemin par un routeur R4. Avec des routes ajoutées à la main, que se passe-t-il ?',
                  choices: [
                    'Les paquets sont perdus tant qu’un technicien n’a pas modifié les tables',
                    'Les routeurs trouvent seuls le nouveau chemin',
                    'Rien ne change',
                    'Les paquets passent par le Wi-Fi',
                  ],
                  correct: [0],
                  explanation:
                    'Des routes à la main ne s’adaptent pas. Avec un protocole de routage (comme RIP), les routeurs s’échangent leurs chemins et contournent la panne d’eux-mêmes.',
                  notion: 'table-de-routage',
                },
              },
            },
            {
              id: 'q-defi-nat',
              label: 'Adresses privées sur Internet',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Dans la réalité, des milliers de collèges utilisent les mêmes adresses privées 192.168.10.… Comment leurs demandes peuvent-elles revenir au bon endroit ?',
                  choices: [
                    'Le routeur de chaque collège remplace l’adresse privée par son adresse publique, unique sur Internet',
                    'Les routeurs d’Internet devinent quel collège a envoyé la demande',
                    'Chaque collège choisit un jour différent pour aller sur Internet',
                    'Elles ne reviennent jamais',
                  ],
                  correct: [0],
                  explanation:
                    'C’est la traduction d’adresses (NAT) : vu d’Internet, toutes les demandes du collège viennent de son adresse publique, et son routeur redistribue les réponses. RéseauLab ne la simule pas.',
                  notion: 'ip-privee-publique',
                },
              },
            },
            {
              id: 'q-defi-justifier',
              label: 'Justifier le routage',
              check: {
                type: 'question',
                question: {
                  type: 'open',
                  prompt:
                    'Justifie en quelques phrases la nécessité d’un protocole de routage pour relier les réseaux d’Internet.',
                  explanation:
                    'Des millions de réseaux, qui apparaissent, changent ou tombent en panne : aucune personne ne peut tenir toutes les tables à jour. Un protocole de routage permet aux routeurs de s’échanger les chemins et de s’adapter automatiquement.',
                },
              },
            },
          ],
        },
      ],
    });
  },
};
