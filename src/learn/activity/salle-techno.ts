import { Network } from '../../engine/network';
import type { BuiltinActivity } from './builtin';
import { MASK_24, define, existing, ip, named } from './define';

/* « La salle de techno » : an activity of two lessons for a class of 4e. The
 * first part revises what was seen in 5e (components, links, topology, why an
 * address, files, good practice), the second one teaches the 4e programme
 * (IP address, mask, ipconfig and ping, troubleshooting, a connected object
 * and its data, private and public addresses, DHCP, reasoned use). Two bonus
 * steps are for those who finish early. Like the other activities, wording
 * and questions are a proposal for the teacher to adjust. */

/** What the weather station serves: its measures of the day. */
const STATION_PAGE = `<h1>Station météo de la salle</h1>
<p>État : en marche. Mesures du jour, une par heure.</p>
<table border="1">
<tr><th>Heure</th><th>Température (°C)</th><th>Humidité (%)</th></tr>
<tr><td>08:00</td><td>16,8</td><td>71</td></tr>
<tr><td>09:00</td><td>17,9</td><td>68</td></tr>
<tr><td>10:00</td><td>19,6</td><td>63</td></tr>
<tr><td>11:00</td><td>21,2</td><td>58</td></tr>
<tr><td>12:00</td><td>22,4</td><td>55</td></tr>
<tr><td>13:00</td><td>21,7</td><td>57</td></tr>
<tr><td>14:00</td><td>23,1</td><td>52</td></tr>
<tr><td>15:00</td><td>22,6</td><td>54</td></tr>
<tr><td>16:00</td><td>20,9</td><td>59</td></tr>
</table>
`;

/** The home page of the school's server. */
const ENT_PAGE = `<h1>ENT du collège</h1>
<p>Bienvenue sur l’espace numérique de travail de la salle de techno.</p>
<ul>
<li>Cahier de textes</li>
<li>Documents de la classe</li>
<li>Messagerie</li>
</ul>
`;

/** Files kept on the server, as in the network drive of a school. */
const SERVER_FILES: readonly (readonly [string, string])[] = [
  ['/Documents/Commun/reglement-interieur.pdf', 'Règlement intérieur du collège.'],
  ['/Documents/Commun/charte-informatique.pdf', 'Charte d’usage du numérique.'],
  ['/Documents/Commun/emploi-du-temps.ods', 'Emploi du temps des classes de 4e.'],
  ['/Documents/4A/Lea/expose-reseaux.odt', 'Exposé : les réseaux informatiques.'],
  ['/Documents/4A/Lea/plan-salle.png', 'Plan de la salle de techno.'],
  ['/Documents/4A/Tom/compte-rendu.txt', 'Compte rendu de la séance 1.'],
  ['/Documents/4A/Tom/mesures.csv', 'Heure;Température\n08:00;16,8\n09:00;17,9\n'],
  ['/Documents/4B/Ines/diaporama.odp', 'Diaporama sur les objets connectés.'],
];

const PART_1 = 'Partie 1 — Ce que je sais depuis la 5e';
const PART_2 = 'Partie 2 — Adresser, configurer, dépanner';

/** The network of the classroom, with its faults and the devices to install. */
function startingNetwork(): Network {
  const network = new Network();
  const sw = network.addSwitch({ name: 'Switch salle', position: { x: 520, y: 300 }, ssid: 'Salle-Techno' });

  const router = network.addRouter({ name: 'Routeur du collège', position: { x: 520, y: 90 } });
  router.setInterface(0, { ip: ip('192.168.10.254'), mask: MASK_24 });
  router.setInterface(1, { ip: ip('82.64.12.34'), mask: MASK_24 });
  network.connect(router.id, sw.id);
  network.addNote({
    kind: 'text',
    x: 640,
    y: 40,
    width: 220,
    height: 40,
    text: '→ vers Internet (fournisseur d’accès)',
    color: '#555555',
    fontSize: 12,
    bold: false,
    italic: true,
  });

  // Poste 3 has the address of Poste 2: a duplicate.
  const postes = [
    ['Poste 1', '192.168.10.1', 200, 110],
    ['Poste 2', '192.168.10.2', 200, 220],
    ['Poste 3', '192.168.10.2', 200, 330],
  ] as const;
  for (const [name, address, x, y] of postes) {
    const host = network.addHost('computer', {
      name,
      position: { x, y },
      config: { ip: ip(address), mask: MASK_24 },
    });
    network.connect(host.id, sw.id);
    if (name === 'Poste 1') host.install('browser');
  }
  // Poste 4 has just been set up on its table, but nobody plugged it in.
  network.addHost('computer', {
    name: 'Poste 4',
    position: { x: 120, y: 470 },
    config: { ip: ip('192.168.10.4'), mask: MASK_24 },
  });

  const server = network.addHost('server', {
    name: 'Serveur',
    position: { x: 840, y: 170 },
    config: { ip: ip('192.168.10.10'), mask: MASK_24 },
  });
  network.connect(server.id, sw.id);
  server.install('webserver');
  server.fs.writeFile('/webserver/index.html', ENT_PAGE);
  server.webServer.setActive(true);
  for (const [path, content] of SERVER_FILES) {
    server.fs.mkdir(path.slice(0, path.lastIndexOf('/')), true);
    server.fs.writeFile(path, content);
  }

  // The printer is in another network: 192.168.1 instead of 192.168.10.
  const printer = network.addHost('printer', {
    name: 'Imprimante',
    position: { x: 840, y: 330 },
    config: { ip: ip('192.168.1.30'), mask: MASK_24 },
  });
  network.connect(printer.id, sw.id);

  // The tablet has a typing mistake (11 instead of 10) and has not joined the Wi-Fi.
  network.addHost('tablet', {
    name: 'Tablette',
    position: { x: 420, y: 480 },
    config: { ip: ip('192.168.11.21'), mask: MASK_24 },
  });

  // The weather station has just been unpacked: no link, no address.
  const station = network.addHost('object', { name: 'Station météo', position: { x: 760, y: 480 } });
  station.fs.writeFile('/webserver/index.html', STATION_PAGE);
  return network;
}

export const classroom: BuiltinActivity = {
  id: 'salle-techno',
  title: 'La salle de techno',
  level: '4e',
  summary:
    'Deux séances et un bonus : réviser la 5e (composants, liaisons, adresses, fichiers, bons usages), puis adresser, tester, dépanner et ajouter une station météo.',
  build: () => {
    const network = startingNetwork();
    const ref = (name: string) => existing(network, name);
    const poste1 = ref('Poste 1');
    const sw = ref('Switch salle');
    return define(network, {
      id: 'salle-techno',
      title: 'La salle de techno',
      level: '4e',
      duration: 120,
      intro: `Voici le réseau de la **salle de techno**. Le technicien du collège a besoin de toi : un poste n’est pas branché, certains équipements ne communiquent plus, et une **station météo connectée** vient d’arriver.

- **Partie 1** (1re séance) : ce que tu sais depuis la 5e.
- **Partie 2** (2e séance) : adresser, tester, dépanner, ajouter la station.
- **Bonus** : pour ceux qui ont fini.

**Plan d’adressage de la salle** (réseau \`192.168.10.0\`, masque \`255.255.255.0\`) : postes de \`.1\` à \`.9\`, serveur \`.10\`, tablettes de \`.20\` à \`.29\`, imprimante \`.30\`, objets connectés de \`.50\` à \`.59\`, routeur \`.254\`.

Les questions se corrigent tout de suite, **une seule réponse** par question : réfléchis avant de valider ! À la fin de chaque séance, clique sur [[ecran:enregistrer]] ; à la séance suivante, rouvre ton fichier avec [[ecran:ouvrir]].`,
      profile: { base: '4e' },
      steps: [
        /* ---------- Partie 1 ---------- */
        {
          id: 'reseau-salle',
          title: 'Le réseau de la salle',
          part: PART_1,
          body: 'Observe le plan : chaque icône est un équipement du réseau de la salle. Clique sur un équipement pour voir son nom et son type dans le panneau du bas.',
          notions: ['reseau', 'reseau-local-internet', 'terminal'],
          hints: ['Un terminal est au bout du réseau : c’est lui qui envoie ou reçoit les données.'],
          objectives: [
            {
              id: 'q-usages',
              label: 'À quoi sert le réseau',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'À quoi sert le réseau de la salle ? (plusieurs réponses)',
                  choices: [
                    'Partager des fichiers',
                    'Imprimer depuis tous les postes',
                    'Accéder à Internet',
                    'Communiquer (ENT, messagerie)',
                    'Recharger la batterie des tablettes',
                  ],
                  correct: [0, 1, 2, 3],
                  explanation:
                    'Un réseau sert à partager des fichiers, des périphériques comme l’imprimante, une connexion à Internet, et à communiquer. Il ne transporte pas d’énergie.',
                  notion: 'reseau',
                },
              },
            },
            {
              id: 'q-lan',
              label: 'Réseau local ou Internet',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Le réseau de la salle de techno est…',
                  choices: ['un réseau local (LAN)', 'Internet', 'un réseau mondial qui relie tous les pays'],
                  correct: [0],
                  explanation:
                    'Il relie les équipements d’un même lieu : c’est un réseau local (LAN). Il est relié à Internet, le réseau des réseaux, par le routeur du collège.',
                  notion: 'reseau-local-internet',
                },
              },
            },
            {
              id: 'q-terminaux',
              label: 'Les terminaux du plan',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Lesquels de ces équipements sont des terminaux ? (plusieurs réponses)',
                  choices: [
                    'Poste 1',
                    'Serveur',
                    'Imprimante',
                    'Station météo',
                    'Switch salle',
                    'Routeur du collège',
                  ],
                  correct: [0, 1, 2, 3],
                  explanation:
                    'Postes, serveur, imprimante et objets connectés sont des terminaux. Le switch et le routeur ne font que relier : ce sont des équipements d’interconnexion.',
                  notion: 'terminal',
                },
              },
            },
          ],
        },
        {
          id: 'composants',
          title: 'Les composants et leur rôle',
          body: 'Chaque équipement a un rôle précis dans le réseau. Aide-toi des fiches si besoin.',
          notions: ['switch', 'client-serveur', 'box', 'adresse-mac'],
          hints: [
            'Le routeur relie des réseaux différents ; le switch relie les équipements d’un même réseau.',
          ],
          objectives: [
            {
              id: 'q-switch',
              label: 'Rôle du switch',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Quel est le rôle du « Switch salle » ?',
                  choices: [
                    'Relier entre eux les équipements de la salle',
                    'Relier le réseau du collège à Internet',
                    'Stocker les fichiers des élèves',
                    'Donner une adresse à chaque poste',
                  ],
                  correct: [0],
                  explanation:
                    'Le switch (commutateur) relie les équipements d’un même réseau local et transmet chaque message au bon destinataire.',
                  notion: 'switch',
                },
              },
            },
            {
              id: 'q-serveur',
              label: 'Où sont les fichiers des élèves',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Où sont enregistrés les fichiers que tu sauvegardes dans ton dossier, au collège ?',
                  choices: [
                    'Sur le serveur',
                    'Sur le poste où je travaille',
                    'Dans le switch',
                    'Dans le routeur',
                  ],
                  correct: [0],
                  explanation:
                    'Le serveur stocke les fichiers et les fournit aux postes clients : c’est pour cela que tu les retrouves sur n’importe quel poste.',
                  notion: 'client-serveur',
                },
              },
            },
            {
              id: 'q-routeur',
              label: 'Ce qui relie le collège à Internet',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Quel équipement relie le réseau du collège à l’extérieur (Internet) ?',
                  choices: ['Le routeur du collège', 'Le switch', 'Le serveur', 'L’imprimante'],
                  correct: [0],
                  explanation:
                    'Le routeur (à la maison, la box) relie le réseau local à l’extérieur. Tu l’étudieras en détail en 3e.',
                  notion: 'box',
                },
              },
            },
            {
              id: 'q-carte',
              label: 'La carte réseau',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Quel composant permet à un terminal de se relier au réseau, par câble ou en Wi-Fi ?',
                  choices: ['La carte réseau', 'Le processeur', 'L’écran', 'La souris'],
                  correct: [0],
                  explanation:
                    'La carte réseau relie le terminal au réseau ; elle porte une adresse MAC unique.',
                  notion: 'adresse-mac',
                },
              },
            },
          ],
        },
        {
          id: 'cabler',
          title: 'Câbler et connecter',
          body: `**Poste 4** vient d’être installé, mais personne ne l’a branché : avec l’outil [[ecran:cable]], relie-le au **Switch salle**.

La **Tablette** n’a pas de prise : sélectionne-la et, dans le [[ecran:panneau]], choisis le réseau Wi-Fi **Salle-Techno**.`,
          notions: ['liaison', 'wifi', 'topologie'],
          hints: [
            'Un câble se pose en deux clics : sur Poste 4, puis sur le switch.',
            'Le réseau sans fil se choisit dans « Connexion réseau », dans le panneau de la tablette.',
          ],
          objectives: [
            {
              id: 'poste4-relie',
              label: 'Poste 4 est relié au switch',
              check: { type: 'linked', a: ref('Poste 4'), b: sw },
            },
            {
              id: 'tablette-wifi',
              label: 'La tablette est connectée au Wi-Fi Salle-Techno',
              check: { type: 'linked', a: ref('Tablette'), b: sw },
            },
            {
              id: 'q-wifi',
              label: 'Câble ou Wi-Fi',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Quelles sont les limites du Wi-Fi par rapport au câble ? (plusieurs réponses)',
                  choices: [
                    'Le débit est souvent plus faible',
                    'La portée est limitée, les murs gênent le signal',
                    'Les ondes peuvent être captées : il faut protéger le réseau',
                    'Il faut tirer des câbles jusqu’à chaque appareil',
                    'On ne peut pas se déplacer avec son appareil',
                  ],
                  correct: [0, 1, 2],
                  explanation:
                    'Le Wi-Fi permet de se déplacer sans câble, mais il est plus lent, de portée limitée et doit être protégé (mot de passe, chiffrement). Le câble est plus rapide et plus sûr, mais il faut le tirer.',
                  notion: 'liaison',
                },
              },
            },
            {
              id: 'q-topologie',
              label: 'La topologie de la salle',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Tous les terminaux de la salle sont reliés au même switch, placé au centre. Comment s’appelle cette topologie ?',
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
          id: 'adresse',
          title: 'Pourquoi une adresse ?',
          body: `Souviens-toi du jeu des messages, en 5e : sans adresse sur l’enveloppe, impossible de savoir à qui la remettre.

Passe en mode [[ecran:simulation]]. Double-clique sur **Poste 1** pour ouvrir son bureau, lance le **Navigateur web** et tape l’adresse du serveur : \`http://192.168.10.10\`. Clique ensuite sur **Vérifier mon travail**.`,
          notions: ['adresse-ip', 'client-serveur', 'web-http'],
          hints: [
            'Le mode Simulation se choisit en haut de l’écran.',
            'L’adresse se tape dans la barre du navigateur, puis on appuie sur Entrée.',
          ],
          objectives: [
            { id: 'simulation', label: 'La simulation a été lancée', check: { type: 'simulationStarted' } },
            {
              id: 'ent-affiche',
              label: 'La page de l’ENT s’affiche sur Poste 1',
              check: { type: 'httpGet', from: poste1, url: 'http://192.168.10.10/', contains: 'ENT' },
            },
            {
              id: 'q-sans-adresse',
              label: 'Un message sans adresse',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Dans un réseau, que se passe-t-il pour un message dont le destinataire n’a pas d’adresse ?',
                  choices: [
                    'Il ne peut pas être remis au bon destinataire',
                    'Il arrive plus vite',
                    'Le switch devine à qui il est destiné',
                    'Il est remis à tous les terminaux, qui le gardent tous',
                  ],
                  correct: [0],
                  explanation:
                    'Sans adresse, aucun équipement ne sait à qui remettre le message : chaque terminal doit avoir une adresse pour communiquer.',
                  notion: 'adresse-ip',
                },
              },
            },
            {
              id: 'q-unique',
              label: 'Pourquoi une adresse unique',
              check: {
                type: 'question',
                question: {
                  type: 'open',
                  prompt:
                    'Explique avec tes mots pourquoi deux terminaux d’un même réseau ne doivent pas avoir la même adresse.',
                  explanation:
                    'Un message envoyé à une adresse doit arriver à un seul destinataire : si deux terminaux la partagent, on ne sait pas lequel le recevra.',
                },
              },
            },
          ],
        },
        {
          id: 'fichiers',
          title: 'Où sont mes fichiers ?',
          body: `Toujours en simulation, double-clique sur le **Serveur** et ouvre son **Explorateur de fichiers**. Les dossiers des classes sont rangés dans \`Documents\`.

Le dossier \`Commun\` est en **lecture seule** pour les élèves ; chaque élève peut écrire dans **son** dossier.`,
          notions: ['fichiers-arborescence', 'client-serveur'],
          hints: [
            'Ouvre Documents, puis 4A, puis Lea.',
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
                    'Léa (4A) a enregistré un exposé sur les réseaux. Quel est le chemin complet de ce fichier sur le serveur ?',
                  accepted: [
                    '/Documents/4A/Lea/expose-reseaux.odt',
                    'Documents/4A/Lea/expose-reseaux.odt',
                    '\\Documents\\4A\\Lea\\expose-reseaux.odt',
                  ],
                  explanation:
                    'Le chemin liste les dossiers à ouvrir, du plus grand au plus petit, puis le nom du fichier : /Documents/4A/Lea/expose-reseaux.odt.',
                  notion: 'fichiers-arborescence',
                },
              },
            },
            {
              id: 'q-extension',
              label: 'L’extension d’un fichier',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'Dans le dossier de Léa, quelle est l’extension du fichier qui contient le plan de la salle ?',
                  accepted: ['png', '.png'],
                  explanation: 'plan-salle.png : l’extension png indique une image.',
                  notion: 'fichiers-arborescence',
                },
              },
            },
            {
              id: 'q-droits',
              label: 'Les droits du dossier Commun',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Le dossier Commun est en lecture seule pour les élèves. Que peux-tu y faire ?',
                  choices: [
                    'Ouvrir et copier ses fichiers, mais ni les modifier ni en ajouter',
                    'Modifier et supprimer ses fichiers',
                    'Y enregistrer mes propres fichiers',
                    'Rien, pas même ouvrir ses fichiers',
                  ],
                  correct: [0],
                  explanation:
                    'Lecture seule : on consulte, on copie chez soi, mais on ne modifie rien. Écrire (modifier, ajouter, supprimer) demande le droit d’écriture.',
                  notion: 'fichiers-arborescence',
                },
              },
            },
          ],
        },
        {
          id: 'bons-usages',
          title: 'Les bons usages',
          body: 'Le réseau du collège est partagé par tous : chacun est responsable de son compte et de ce qu’il en fait.',
          notions: ['securite-numerique'],
          hints: [
            'Demande-toi à chaque fois : et si quelqu’un faisait cela avec mon compte, ou avec ma photo ?',
          ],
          objectives: [
            {
              id: 'q-mot-de-passe',
              label: 'Un mot de passe solide',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Lequel de ces mots de passe est le plus solide ?',
                  choices: ['Lune-Velo7-Parapluie!', '123456', 'Lea2012', 'motdepasse'],
                  correct: [0],
                  explanation:
                    'Un mot de passe solide est long et mélange mots, chiffres et symboles ; il ne contient ni ton prénom ni ta date de naissance.',
                  notion: 'securite-numerique',
                },
              },
            },
            {
              id: 'q-session',
              label: 'Quitter son poste',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Tu quittes ton poste quelques minutes pendant le cours. Que fais-tu ?',
                  choices: [
                    'Je verrouille ma session (touches Windows + L)',
                    'Je laisse ma session ouverte, je reviens vite',
                    'J’éteins seulement l’écran',
                    'Je demande à mon voisin de surveiller',
                  ],
                  correct: [0],
                  explanation:
                    'Une session ouverte permet à n’importe qui d’agir en ton nom. On la verrouille, et on se déconnecte à la fin du cours.',
                  notion: 'securite-numerique',
                },
              },
            },
            {
              id: 'q-compte',
              label: 'Prêter son compte',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Ton ami a oublié son mot de passe et te demande d’utiliser ton compte. Que réponds-tu ?',
                  choices: [
                    'Non : tout ce qu’il fera sera fait en mon nom ; il doit demander un nouveau mot de passe',
                    'Oui, c’est mon ami',
                    'Oui, mais seulement pour cette séance',
                    'Je lui donne le mot de passe d’un autre élève',
                  ],
                  correct: [0],
                  explanation:
                    'Ton compte est ton identité numérique au collège. Utiliser le compte d’un autre est une usurpation d’identité.',
                  notion: 'securite-numerique',
                },
              },
            },
            {
              id: 'q-droit-auteur',
              label: 'Le droit d’auteur',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Pour ton exposé, tu trouves une belle photo sur Internet. Que dois-tu faire ?',
                  choices: [
                    'Vérifier que son auteur autorise sa réutilisation et citer la source',
                    'La copier : tout ce qui est sur Internet est gratuit',
                    'La recadrer pour qu’on ne la reconnaisse pas',
                    'La copier si elle n’a pas le symbole ©',
                  ],
                  correct: [0],
                  explanation:
                    'Une photo appartient à son auteur (propriété intellectuelle). On utilise une image sous licence libre, ou on demande l’autorisation, et on cite la source.',
                  notion: 'securite-numerique',
                },
              },
            },
            {
              id: 'q-cyberviolence',
              label: 'Face à la cyberviolence',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Une photo moqueuse d’un camarade circule dans un groupe de la classe. Que fais-tu ?',
                  choices: [
                    'Je ne la partage pas et j’en parle à un adulte',
                    'Je la partage, ce n’est qu’une blague',
                    'Je la commente pour faire rire',
                    'Je ne dis rien, ce n’est pas mon problème',
                  ],
                  correct: [0],
                  explanation:
                    'Relayer, c’est participer au harcèlement. On ne partage pas, on soutient la victime et on prévient un adulte (au collège, ou le 3018).',
                  notion: 'securite-numerique',
                },
              },
            },
          ],
        },

        /* ---------- Partie 2 ---------- */
        {
          id: 'lire-ip',
          title: 'Lire une adresse IP',
          part: PART_2,
          body: 'En mode [[ecran:simulation]], ouvre la **Ligne de commande** de **Poste 1** et tape `ipconfig` : la commande affiche les réglages réseau du poste.',
          notions: ['adresse-ip', 'masque'],
          hints: [
            'Double-clique sur Poste 1, puis sur « Ligne de commande ».',
            'Une adresse IPv4 : 4 nombres de 0 à 255, séparés par des points.',
          ],
          objectives: [
            {
              id: 'ipconfig',
              label: 'La commande ipconfig a été utilisée sur Poste 1',
              check: { type: 'commandRan', command: 'ipconfig', device: poste1 },
            },
            {
              id: 'q-ip-poste1',
              label: 'L’adresse de Poste 1',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt: 'Quelle est l’adresse IP de Poste 1 ?',
                  accepted: ['192.168.10.1'],
                  explanation: 'ipconfig affiche « Adresse IPv4 : 192.168.10.1 ».',
                  notion: 'adresse-ip',
                },
              },
            },
            {
              id: 'q-ip-valides',
              label: 'Des adresses valides',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Lesquelles sont des adresses IPv4 valides ? (plusieurs réponses)',
                  choices: ['192.168.10.25', '10.0.0.1', '192.168.10.256', '192.168.10', '172.16.300.1'],
                  correct: [0, 1],
                  explanation:
                    'Une adresse IPv4 a exactement 4 nombres, chacun de 0 à 255 : 256 et 300 sont trop grands, et 192.168.10 n’a que 3 nombres.',
                  notion: 'adresse-ip',
                },
              },
            },
            {
              id: 'q-octet',
              label: 'Pourquoi 255',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Pourquoi chaque nombre d’une adresse IPv4 va-t-il de 0 à 255 ?',
                  choices: [
                    'Il est codé sur un octet (8 bits), qui peut prendre 256 valeurs',
                    'Parce qu’un réseau ne peut pas avoir plus de 255 équipements dans le monde',
                    'C’est le nombre de pays reliés à Internet',
                    'C’est un choix au hasard',
                  ],
                  correct: [0],
                  explanation:
                    'Chaque nombre occupe un octet, soit 8 bits : 2 × 2 × … × 2 (8 fois) = 256 valeurs, de 0 à 255. Une adresse IPv4 fait donc 4 octets, 32 bits.',
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
          ],
        },
        {
          id: 'masque',
          title: 'Le masque',
          body: 'Le [[masque]] dit quelle partie de l’adresse désigne le réseau. Deux terminaux communiquent directement s’ils sont **dans le même réseau**.',
          notions: ['masque'],
          hints: ['Avec 255.255.255.0, compare les trois premiers nombres des deux adresses.'],
          objectives: [
            {
              id: 'q-masque-poste1',
              label: 'Le masque de Poste 1',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt: 'Quel masque de sous-réseau la commande ipconfig affiche-t-elle pour Poste 1 ?',
                  accepted: ['255.255.255.0'],
                  explanation:
                    'Le masque de la salle est 255.255.255.0, le plus courant dans un réseau local.',
                  notion: 'masque',
                },
              },
            },
            {
              id: 'q-masque-role',
              label: 'Le rôle du masque',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'À quoi sert le masque de sous-réseau ?',
                  choices: [
                    'À savoir quelle partie de l’adresse désigne le réseau',
                    'À cacher l’adresse du poste sur Internet',
                    'À donner une adresse automatiquement',
                    'À protéger le poste contre les virus',
                  ],
                  correct: [0],
                  explanation: 'Le masque sépare l’adresse en deux : la partie réseau et la partie machine.',
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
          ],
        },
        {
          id: 'ping',
          title: 'Tester avec ping',
          body: 'Dans la ligne de commande de **Poste 1**, teste la communication avec le serveur : `ping 192.168.10.10`. Observe les messages sur les câbles, puis clique sur **Vérifier mon travail**.',
          notions: ['ping'],
          hints: ['Une ligne « Réponse de 192.168.10.10 » veut dire que l’aller et le retour fonctionnent.'],
          objectives: [
            {
              id: 'ping-commande',
              label: 'La commande ping a été utilisée sur Poste 1',
              check: { type: 'commandRan', command: 'ping', device: poste1 },
            },
            {
              id: 'ping-serveur',
              label: 'Poste 1 communique avec le serveur',
              check: { type: 'ping', from: poste1, to: ref('Serveur') },
            },
            {
              id: 'q-ping-echec',
              label: 'Un ping sans réponse',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Un ping ne reçoit aucune réponse. Qu’en conclus-tu ?',
                  choices: [
                    'Le message ou sa réponse s’est perdu : il faut chercher où (câble, adresse, masque…)',
                    'La destination est forcément éteinte',
                    'Le ping a réussi',
                    'Il faut changer le switch',
                  ],
                  correct: [0],
                  explanation:
                    'Un échec dit seulement que l’aller ou le retour n’a pas abouti. La cause peut être n’importe où : il faut chercher méthodiquement.',
                  notion: 'ping',
                },
              },
            },
          ],
        },
        {
          id: 'depanner',
          title: 'Dépanner la salle',
          body: `Le technicien signale : « **Poste 3**, l’**imprimante** et la **tablette** ne communiquent pas avec les autres. » Trouve les trois pannes et répare-les.

Pour tester, lance des \`ping\` depuis Poste 1. Pour corriger, reviens en [[ecran:conception]], clique sur l’équipement et change son réglage. Le bouton [[ecran:verifier]] t’aide à repérer ce qui ne va pas. Respecte le plan d’adressage de la salle (dans la consigne, en haut).`,
          notions: ['depannage', 'adresse-ip', 'ping'],
          hints: [
            'Compare l’adresse de chaque équipement au plan d’adressage : réseau 192.168.10.0.',
            'Deux équipements ont la même adresse : lequel doit en changer ?',
            'Une adresse en 192.168.1. ou 192.168.11. n’est pas dans le réseau 192.168.10.0.',
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
              id: 'poste3-repare',
              label: 'Poste 3 a une adresse que personne d’autre n’utilise',
              check: {
                type: 'config',
                device: ref('Poste 3'),
                field: 'ip',
                inNetwork: '192.168.10.0/24',
                unique: true,
              },
            },
            {
              id: 'imprimante-reparee',
              label: 'Poste 1 communique avec l’imprimante',
              check: { type: 'ping', from: poste1, to: ref('Imprimante') },
            },
            {
              id: 'tablette-reparee',
              label: 'Poste 1 communique avec la tablette',
              check: { type: 'ping', from: poste1, to: ref('Tablette') },
            },
            {
              id: 'salle-saine',
              label: 'Plus aucune adresse en double ni hors du réseau',
              check: {
                type: 'lintClean',
                ignore: ['not-cabled', 'ip-missing', 'mask-missing', 'gateway-missing'],
              },
            },
            {
              id: 'q-pannes',
              label: 'Les pannes trouvées',
              check: {
                type: 'question',
                question: {
                  type: 'open',
                  prompt: 'Note les trois pannes que tu as trouvées et comment tu les as réparées.',
                  explanation:
                    'Poste 3 avait l’adresse de Poste 2 (doublon) ; l’imprimante était dans le réseau 192.168.1 ; la tablette avait une faute de frappe (192.168.11.21).',
                },
              },
            },
          ],
        },
        {
          id: 'station',
          title: 'Ajouter la station météo',
          body: `La **station météo** est un [[objet-connecte|objet connecté]] : une carte programmable avec des capteurs et une carte réseau. Pour l’ajouter au réseau :

- relie-la au **Switch salle** ;
- donne-lui une **adresse fixe** : le plan d’adressage lui réserve \`192.168.10.50\`, avec le masque \`255.255.255.0\` ;
- teste-la avec un \`ping\` depuis Poste 1, puis **Vérifier mon travail**.`,
          notions: ['objet-connecte', 'dhcp', 'adresse-ip'],
          hints: [
            'L’adresse et le masque se règlent dans le panneau du bas, en mode Conception.',
            'Exemple de test : ping 192.168.10.50',
          ],
          objectives: [
            {
              id: 'station-reliee',
              label: 'La station météo est reliée au switch',
              check: { type: 'linked', a: ref('Station météo'), b: sw },
            },
            {
              id: 'station-adresse',
              label: 'La station météo a l’adresse 192.168.10.50',
              check: { type: 'config', device: ref('Station météo'), field: 'ip', equals: '192.168.10.50' },
            },
            {
              id: 'station-masque',
              label: 'La station météo a le masque 255.255.255.0',
              check: { type: 'config', device: ref('Station météo'), field: 'mask', equals: '255.255.255.0' },
            },
            {
              id: 'reseau-sain',
              label: 'Le bouton Vérifier ne signale plus rien',
              check: { type: 'lintClean', ignore: ['gateway-missing'] },
            },
            {
              id: 'station-joignable',
              label: 'Poste 1 communique avec la station météo',
              check: { type: 'ping', from: poste1, to: ref('Station météo') },
            },
            {
              id: 'q-adresse-fixe',
              label: 'Pourquoi une adresse fixe',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Pourquoi donne-t-on à la station une adresse fixe, plutôt qu’une adresse automatique (DHCP) ?',
                  choices: [
                    'Pour la retrouver toujours à la même adresse quand on veut lire ses mesures',
                    'Parce qu’un objet connecté ne peut pas recevoir d’adresse automatique',
                    'Parce qu’une adresse fixe va plus vite',
                    'Pour qu’elle soit joignable depuis Internet',
                  ],
                  correct: [0],
                  explanation:
                    'Une adresse automatique peut changer. Les équipements que l’on doit retrouver (serveur, imprimante, objet que l’on consulte) reçoivent une adresse fixe.',
                  notion: 'dhcp',
                },
              },
            },
            {
              id: 'q-pas-deux',
              label: 'Une adresse libre',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Pourquoi ne pas donner à la station l’adresse 192.168.10.2 ?',
                  choices: [
                    'Elle est déjà utilisée par Poste 2 : il y aurait un doublon',
                    'Elle n’est pas dans le réseau de la salle',
                    'Une adresse ne peut pas finir par 2',
                    'Elle est réservée au routeur',
                  ],
                  correct: [0],
                  explanation:
                    'Une adresse doit être unique dans son réseau : 192.168.10.2 est celle de Poste 2.',
                  notion: 'depannage',
                },
              },
            },
          ],
        },
        {
          id: 'mesures',
          title: 'Lire les mesures',
          body: 'En simulation, dans le **navigateur** de Poste 1, va à l’adresse de la station : `http://192.168.10.50`. Elle affiche sa **table de données** : une ligne par mesure, une colonne par descripteur. Clique ensuite sur **Vérifier mon travail**.',
          notions: ['donnees-objet', 'objet-connecte'],
          hints: ['La page s’affiche seulement si la station est reliée et a la bonne adresse.'],
          objectives: [
            {
              id: 'mesures-lues',
              label: 'Les mesures de la station s’affichent sur Poste 1',
              check: { type: 'httpGet', from: poste1, url: 'http://192.168.10.50/', contains: 'Température' },
            },
            {
              id: 'q-maximum',
              label: 'L’heure la plus chaude',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt:
                    'À quelle heure la température a-t-elle été la plus élevée ? (écris-la comme dans le tableau)',
                  accepted: ['14:00', '14h00', '14h', '14 h', '14'],
                  explanation:
                    'La valeur la plus élevée de la colonne Température est 23,1 °C, mesurée à 14:00.',
                  notion: 'donnees-objet',
                },
              },
            },
            {
              id: 'q-type',
              label: 'Le type d’une donnée',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Quel est le type des valeurs de la colonne « Température (°C) » ?',
                  choices: ['Nombre décimal', 'Nombre entier', 'Texte', 'Date et heure'],
                  correct: [0],
                  explanation:
                    '16,8 ; 17,9… ont une partie après la virgule : ce sont des nombres décimaux, en degrés Celsius.',
                  notion: 'donnees-objet',
                },
              },
            },
            {
              id: 'q-unite',
              label: 'L’unité de l’humidité',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt: 'Quelle est l’unité des valeurs de la colonne « Humidité » ?',
                  accepted: ['%', 'pourcent', 'pour cent', 'pourcentage', 'pourcentages'],
                  explanation:
                    'L’humidité est donnée en pourcentage (%) : la part de vapeur d’eau dans l’air par rapport au maximum possible.',
                  notion: 'donnees-objet',
                },
              },
            },
            {
              id: 'q-tendance',
              label: 'Interpréter la table',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'D’après la table, quand la température monte, que fait l’humidité mesurée ?',
                  choices: ['Elle baisse', 'Elle monte aussi', 'Elle ne change pas'],
                  correct: [0],
                  explanation:
                    'De 08:00 à 14:00, la température passe de 16,8 à 23,1 °C pendant que l’humidité passe de 71 à 52 % : elles varient en sens inverse.',
                  notion: 'donnees-objet',
                },
              },
            },
            {
              id: 'q-trajet',
              label: 'Le trajet d’une mesure',
              check: {
                type: 'question',
                question: {
                  type: 'order',
                  prompt: 'Remets dans l’ordre le trajet d’une mesure, du capteur jusqu’à ton écran.',
                  items: [
                    'Le capteur mesure la température',
                    'La carte programmable la convertit en nombre',
                    'La station l’envoie sur le réseau',
                    'Le navigateur de Poste 1 affiche la table',
                  ],
                  explanation:
                    'Grandeur physique → nombre → réseau → affichage : la donnée est transformée à chaque étape.',
                  notion: 'donnees-objet',
                },
              },
            },
          ],
        },
        {
          id: 'internet',
          title: 'Adresse privée, adresse publique',
          body: 'En [[ecran:conception]], clique sur le **Routeur du collège** : il a deux interfaces, l’une dans le réseau de la salle, l’autre du côté d’Internet.',
          notions: ['ip-privee-publique', 'dhcp', 'reseau-local-internet'],
          hints: ['Les adresses privées commencent souvent par 192.168. ou par 10.'],
          objectives: [
            {
              id: 'q-ip-publique',
              label: 'L’adresse publique du collège',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt: 'Quelle est l’adresse IP du routeur du côté d’Internet ?',
                  accepted: ['82.64.12.34'],
                  explanation:
                    '82.64.12.34 : c’est l’adresse publique du collège, celle que voient les sites visités.',
                  notion: 'ip-privee-publique',
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
                  prompt: 'L’adresse 192.168.10.1 de Poste 1 est…',
                  choices: [
                    'une adresse privée, valable seulement dans le réseau local',
                    'une adresse publique, unique sur Internet',
                    'l’adresse MAC de sa carte réseau',
                  ],
                  correct: [0],
                  explanation:
                    'Les adresses en 192.168. sont privées : chaque collège, chaque maison peut utiliser les mêmes. Sur Internet, on voit l’adresse publique du routeur.',
                  notion: 'ip-privee-publique',
                },
              },
            },
            {
              id: 'q-fai',
              label: 'Qui fournit l’adresse publique',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Qui attribue l’adresse publique 82.64.12.34 au collège ?',
                  choices: [
                    'Le fournisseur d’accès à Internet (FAI)',
                    'Le switch de la salle',
                    'Le serveur du collège',
                    'Chaque poste, au hasard',
                  ],
                  correct: [0],
                  explanation:
                    'L’adresse publique est fournie par l’opérateur auquel on paie l’abonnement à Internet : le FAI.',
                  notion: 'ip-privee-publique',
                },
              },
            },
            {
              id: 'q-dhcp',
              label: 'Les adresses automatiques',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'À la maison, ton smartphone reçoit une adresse dès qu’il rejoint le Wi-Fi. Qui la lui donne ?',
                  choices: [
                    'Le serveur DHCP de la box',
                    'Le smartphone la choisit lui-même',
                    'Le fabricant du smartphone',
                    'Le site web visité',
                  ],
                  correct: [0],
                  explanation:
                    'En configuration automatique, l’appareil demande une adresse ; le serveur DHCP (dans la box) la lui attribue, avec le masque et la passerelle.',
                  notion: 'dhcp',
                },
              },
            },
          ],
        },
        {
          id: 'usages',
          title: 'Usage raisonné des objets connectés',
          body: 'La station météo, ton smartphone, les sites que tu visites : tous collectent des données. Savoir lesquelles, c’est garder la maîtrise de son identité numérique.',
          notions: ['usage-raisonne', 'donnees-objet'],
          hints: ['Une donnée seule paraît anodine ; mise bout à bout avec d’autres, elle en dit beaucoup.'],
          objectives: [
            {
              id: 'q-cookie',
              label: 'Les cookies',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Un site affiche « Acceptez-vous les cookies ? ». Qu’est-ce qu’un cookie ?',
                  choices: [
                    'Un petit fichier que le site enregistre dans le navigateur, pour te reconnaître',
                    'Un virus',
                    'Une publicité',
                    'Le mot de passe du Wi-Fi',
                  ],
                  correct: [0],
                  explanation:
                    'Un cookie (témoin de connexion) retient des informations : rester connecté, garder un panier… ou suivre tes visites pour la publicité. On peut refuser ceux qui ne sont pas nécessaires.',
                  notion: 'usage-raisonne',
                },
              },
            },
            {
              id: 'q-geolocalisation',
              label: 'La géolocalisation',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Un jeu demande l’accès à ta position « en permanence ». Que choisis-tu ?',
                  choices: [
                    'Refuser, ou seulement « pendant l’utilisation » si le jeu en a vraiment besoin',
                    'Accepter en permanence, c’est plus simple',
                    'Accepter, la position n’est pas une donnée personnelle',
                    'Désinstaller le navigateur',
                  ],
                  correct: [0],
                  explanation:
                    'Ta position révèle où tu vis, où tu vas, à quelle heure. On ne l’autorise qu’aux applications qui en ont besoin, et seulement quand on s’en sert.',
                  notion: 'usage-raisonne',
                },
              },
            },
            {
              id: 'q-identite',
              label: 'L’identité numérique',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Qu’est-ce qui fait partie de ton identité numérique ? (plusieurs réponses)',
                  choices: [
                    'Les photos publiées où l’on te reconnaît',
                    'Tes comptes et tes pseudos',
                    'Les traces de tes visites sur les sites (cookies)',
                    'Ce que tu as écrit dans ton cahier papier',
                  ],
                  correct: [0, 1, 2],
                  explanation:
                    'Ton identité numérique, c’est l’ensemble des traces que tu laisses en ligne, même sans rien publier. Un cahier papier n’en fait pas partie.',
                  notion: 'usage-raisonne',
                },
              },
            },
            {
              id: 'q-donnees-station',
              label: 'Ce que révèle un objet connecté',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Une station comme celle de la salle, placée dans une chambre, envoie chaque heure la température à un serveur d’une entreprise. Que peut-on en déduire, en plus de la météo ?',
                  choices: [
                    'Les moments où la chambre est occupée ou chauffée',
                    'Rien d’autre que la température',
                    'Le mot de passe de la box',
                    'Le contenu des conversations',
                  ],
                  correct: [0],
                  explanation:
                    'Des mesures anodines, mises bout à bout, révèlent nos habitudes. Avant d’installer un objet connecté, on se demande quelles données il envoie, et à qui.',
                  notion: 'usage-raisonne',
                },
              },
            },
          ],
        },
        {
          id: 'bilan',
          title: 'Bilan',
          body: 'Réponds à la dernière question. Ensuite, ouvre le **Compte rendu** (en haut de l’écran) : écris ton nom, ta classe et ce que tu as appris. Enfin, clique sur [[ecran:enregistrer]] pour garder ton travail et le rendre.',
          notions: ['objet-connecte', 'depannage'],
          hints: ['Reprends les étapes « Ajouter la station météo » et « Lire les mesures ».'],
          objectives: [
            {
              id: 'q-bilan',
              label: 'Ajouter un objet connecté',
              check: {
                type: 'question',
                question: {
                  type: 'open',
                  prompt:
                    'En quelques phrases : que faut-il faire pour ajouter un objet connecté à un réseau local, et comment vérifier qu’il communique ?',
                  explanation:
                    'Le relier (câble ou Wi-Fi), lui donner une adresse IP libre du même réseau et le bon masque, puis le tester avec ping ou en consultant sa page.',
                },
              },
            },
          ],
        },

        /* ---------- Bonus ---------- */
        {
          id: 'bonus-dhcp',
          title: 'Des adresses automatiques',
          bonus: true,
          body: `Les élèves arrivent avec des smartphones : impossible de régler chaque adresse à la main. Un serveur **DHCP** va les distribuer.

- En simulation, sur le bureau du **Serveur**, installe le **Serveur DHCP** (« Installer des logiciels »), ouvre-le, choisis la plage \`192.168.10.100\` à \`192.168.10.150\` et démarre-le.
- En conception, ajoute un **Smartphone**, choisis le Wi-Fi **Salle-Techno** et coche **Configuration automatique (DHCP)**.
- Relance la simulation : le smartphone reçoit son adresse. Teste-le avec \`ping\` depuis Poste 1, puis **Vérifier mon travail**.`,
          notions: ['dhcp', 'wifi'],
          hints: [
            'La plage doit être dans le réseau de la salle, et ne contenir aucune adresse déjà utilisée.',
            'ipconfig, sur le smartphone, montre l’adresse reçue.',
          ],
          objectives: [
            {
              id: 'dhcp-demarre',
              label: 'Le serveur DHCP du Serveur est démarré',
              check: { type: 'serviceRunning', device: ref('Serveur'), app: 'dhcpserver' },
            },
            {
              id: 'smartphone-wifi',
              label: 'Smartphone 1 est connecté au Wi-Fi Salle-Techno',
              check: { type: 'linked', a: named('Smartphone 1'), b: sw },
            },
            {
              id: 'smartphone-auto',
              label: 'Smartphone 1 est en configuration automatique',
              check: { type: 'config', device: named('Smartphone 1'), field: 'dhcp', isSet: true },
            },
            {
              id: 'bonus-sain',
              label: 'Le bouton Vérifier ne signale plus rien',
              check: { type: 'lintClean', ignore: ['gateway-missing'] },
            },
            {
              id: 'smartphone-joignable',
              label: 'Poste 1 communique avec Smartphone 1',
              check: { type: 'ping', from: poste1, to: named('Smartphone 1') },
            },
            {
              id: 'q-dhcp-fixe',
              label: 'L’adresse du serveur DHCP',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt: 'Le Serveur distribue les adresses. Pourquoi garde-t-il, lui, une adresse fixe ?',
                  choices: [
                    'Les autres doivent toujours le trouver à la même adresse',
                    'Un serveur ne peut pas avoir d’adresse',
                    'Parce qu’il est relié par un câble',
                    'Pour aller plus vite sur Internet',
                  ],
                  correct: [0],
                  explanation:
                    'Postes et objets doivent retrouver le serveur (fichiers, ENT, DHCP) toujours au même endroit : on lui donne une adresse fixe, en dehors de la plage distribuée.',
                  notion: 'dhcp',
                },
              },
            },
          ],
        },
        {
          id: 'bonus-masques',
          title: 'Défi : octets et masques',
          bonus: true,
          body: 'Pour les plus rapides : quelques questions pour aller plus loin avec les octets et les masques.',
          notions: ['masque', 'adresse-ip'],
          hints: [
            'Un bit vaut 0 ou 1. Avec 2 bits : 4 valeurs ; avec 3 bits : 8 valeurs…',
            'Avec 255.255.0.0, seuls les deux premiers nombres désignent le réseau.',
          ],
          objectives: [
            {
              id: 'q-bits',
              label: 'Les bits d’un octet',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt: 'Combien de bits y a-t-il dans un octet ?',
                  accepted: ['8', 'huit'],
                  explanation: 'Un octet, c’est 8 bits. Une adresse IPv4 de 4 octets compte donc 32 bits.',
                  notion: 'adresse-ip',
                },
              },
            },
            {
              id: 'q-valeurs',
              label: 'Les valeurs d’un octet',
              check: {
                type: 'question',
                question: {
                  type: 'short',
                  prompt: 'Combien de valeurs différentes peut-on écrire avec un octet ?',
                  accepted: ['256'],
                  explanation: '2 × 2 × 2 × 2 × 2 × 2 × 2 × 2 = 256 valeurs : de 0 à 255.',
                  notion: 'adresse-ip',
                },
              },
            },
            {
              id: 'q-meme-reseau-2',
              label: 'Même réseau ? (1)',
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
              id: 'q-meme-reseau-3',
              label: 'Même réseau ? (2)',
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
              id: 'q-masque-16',
              label: 'Le masque 255.255.0.0',
              check: {
                type: 'question',
                question: {
                  type: 'mcq',
                  prompt:
                    'Avec le masque 255.255.0.0, les adresses 192.168.10.5 et 192.168.20.7 sont-elles dans le même réseau ?',
                  choices: [
                    'Oui : seuls les deux premiers nombres (192.168) désignent le réseau',
                    'Non : leur troisième nombre est différent',
                  ],
                  correct: [0],
                  explanation:
                    'Avec 255.255.0.0, la partie réseau est 192.168 pour les deux : elles sont dans le même réseau, qui peut contenir plus de 65 000 équipements.',
                  notion: 'masque',
                },
              },
            },
          ],
        },
      ],
    });
  },
};
