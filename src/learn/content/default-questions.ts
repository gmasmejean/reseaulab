import type { Question } from '../quiz/types';

/* Default questions of the quiz: one or two per knowledge card. As for the
 * cards, wording and school year are a proposal that a teacher adjusts with
 * a pack file. The first choice of a multiple-choice question is the right
 * one here; choices are shuffled when the quiz is drawn. */

const one = [0] as const;

export const DEFAULT_QUESTIONS: readonly Question[] = [
  /* ---------- 5e ---------- */
  {
    id: 'reseau-definition',
    notion: 'reseau',
    level: '5e',
    type: 'mcq',
    prompt: 'Qu’est-ce qu’un réseau informatique ?',
    choices: [
      'Des équipements reliés entre eux pour échanger des données',
      'Un ordinateur très puissant',
      'Un logiciel pour aller sur Internet',
      'Un câble qui relie deux ordinateurs',
    ],
    correct: one,
    explanation:
      'Un réseau, ce sont des équipements reliés pour échanger des données et partager des ressources.',
  },
  {
    id: 'terminal-intrus',
    notion: 'terminal',
    level: '5e',
    type: 'mcq',
    prompt: 'Lequel de ces équipements n’est PAS un terminal ?',
    choices: ['Un switch', 'Une imprimante', 'Un smartphone', 'Un ordinateur'],
    correct: one,
    explanation:
      'Un terminal est au bout du réseau : il émet ou reçoit les données. Le switch, lui, relie les terminaux entre eux.',
  },
  {
    id: 'switch-role',
    notion: 'switch',
    level: '5e',
    type: 'mcq',
    prompt: 'À quoi sert un switch (commutateur) ?',
    choices: [
      'À relier les équipements d’un même réseau local',
      'À relier deux réseaux différents',
      'À donner une adresse IP aux ordinateurs',
      'À stocker des pages web',
    ],
    correct: one,
    explanation:
      'Le switch relie les équipements d’un même réseau. Relier deux réseaux différents est le rôle du routeur.',
  },
  {
    id: 'client-serveur-navigateur',
    notion: 'client-serveur',
    level: '5e',
    type: 'mcq',
    prompt: 'Quand tu affiches une page web, quel est le rôle de ton navigateur ?',
    choices: [
      'Client : il demande la page',
      'Serveur : il fournit la page',
      'Routeur : il choisit le chemin',
      'Switch : il relie les équipements',
    ],
    correct: one,
    explanation:
      'Le client demande, le serveur répond. Le navigateur est le client ; le serveur web possède la page.',
  },
  {
    id: 'liaisons-sans-fil',
    notion: 'liaison',
    level: '5e',
    type: 'mcq',
    prompt: 'Lesquelles de ces liaisons sont sans fil ? (plusieurs réponses)',
    choices: ['Le Wi-Fi', 'Le Bluetooth', 'La fibre optique', 'Le câble Ethernet'],
    correct: [0, 1],
    explanation:
      'Wi-Fi et Bluetooth utilisent des ondes radio. La fibre optique et le câble Ethernet sont des liaisons filaires.',
  },
  {
    id: 'wifi-ssid',
    notion: 'wifi',
    level: '5e',
    type: 'mcq',
    prompt: 'Qu’est-ce que le SSID ?',
    choices: [
      'Le nom d’un réseau Wi-Fi',
      'Le mot de passe du Wi-Fi',
      'L’adresse d’un site web',
      'La vitesse de la connexion',
    ],
    correct: one,
    explanation:
      'Le SSID est le nom que diffuse le point d’accès : celui que l’on choisit dans la liste des réseaux.',
  },
  {
    id: 'box-contenu',
    notion: 'box',
    level: '5e',
    type: 'mcq',
    prompt: 'Que réunit une box Internet ?',
    choices: [
      'Un routeur, un switch, un point d’accès Wi-Fi et un serveur DHCP',
      'Seulement un point d’accès Wi-Fi',
      'Un ordinateur et une imprimante',
      'Un serveur web et un serveur de messagerie',
    ],
    correct: one,
    explanation:
      'La box fait tout à la fois : elle relie la maison à Internet et configure les appareils qu’on y branche.',
  },
  {
    id: 'internet-reseau-de-reseaux',
    notion: 'reseau-local-internet',
    level: '5e',
    type: 'mcq',
    prompt: 'Internet, c’est…',
    choices: [
      'Des réseaux du monde entier reliés entre eux',
      'Un seul très grand ordinateur',
      'Le réseau Wi-Fi de la maison',
      'Un logiciel installé sur chaque ordinateur',
    ],
    correct: one,
    explanation:
      'Internet est un réseau de réseaux : des millions de réseaux locaux reliés par des routeurs.',
  },
  {
    id: 'topologie-etoile',
    notion: 'topologie',
    level: '5e',
    type: 'mcq',
    prompt: 'Dans un réseau en étoile, tous les terminaux sont reliés…',
    choices: [
      'à un même équipement central',
      'les uns à la suite des autres',
      'chacun à tous les autres',
      'à Internet directement',
    ],
    correct: one,
    explanation: 'En étoile, chaque terminal est relié à un équipement central, le plus souvent un switch.',
  },

  /* ---------- 4e ---------- */
  {
    id: 'adresse-ip-valide',
    notion: 'adresse-ip',
    level: '4e',
    type: 'mcq',
    prompt: 'Laquelle de ces écritures est une adresse IP valide ?',
    choices: ['192.168.1.25', '192.168.1.300', '192.168.1', '192,168,1,25'],
    correct: one,
    explanation: 'Une adresse IP : 4 nombres de 0 à 255, séparés par des points.',
  },
  {
    id: 'adresse-ip-nombres',
    notion: 'adresse-ip',
    level: '4e',
    type: 'short',
    prompt: 'De combien de nombres une adresse IP est-elle composée ?',
    accepted: ['4', 'quatre'],
    explanation: 'Quatre nombres, chacun entre 0 et 255.',
  },
  {
    id: 'adresse-ip-unique',
    notion: 'adresse-ip',
    level: '4e',
    type: 'mcq',
    prompt: 'Deux équipements d’un même réseau peuvent-ils avoir la même adresse IP ?',
    choices: [
      'Non : une adresse doit être unique dans son réseau',
      'Oui, s’ils sont de la même marque',
      'Oui, s’ils sont reliés au même switch',
    ],
    correct: one,
    explanation:
      'Comme deux maisons d’une rue n’ont pas le même numéro, deux équipements d’un réseau n’ont pas la même adresse.',
  },
  {
    id: 'masque-meme-reseau',
    notion: 'masque',
    level: '4e',
    type: 'same-network',
    prompt: 'Ces deux adresses sont-elles dans le même réseau ?',
    explanation: '',
  },
  {
    id: 'masque-partie-reseau',
    notion: 'masque',
    level: '4e',
    type: 'mcq',
    prompt: 'Avec le masque 255.255.255.0, quelle partie de l’adresse 192.168.5.12 désigne le réseau ?',
    choices: ['192.168.5', '192.168', '12', '192'],
    correct: one,
    explanation:
      'Avec ce masque, les trois premiers nombres désignent le réseau ; le dernier désigne l’équipement.',
  },
  {
    id: 'adresse-mac-fixe',
    notion: 'adresse-mac',
    level: '4e',
    type: 'mcq',
    prompt: 'L’adresse MAC d’une carte réseau…',
    choices: [
      'est fixée à la fabrication de la carte',
      'change selon le réseau où l’on se connecte',
      'est donnée par le serveur DHCP',
      'est choisie par l’utilisateur à chaque démarrage',
    ],
    correct: one,
    explanation: 'L’adresse MAC est comme un numéro de série. C’est l’adresse IP qui dépend du réseau.',
  },
  {
    id: 'dhcp-role',
    notion: 'dhcp',
    level: '4e',
    type: 'mcq',
    prompt: 'Que fait un serveur DHCP ?',
    choices: [
      'Il distribue automatiquement des adresses IP',
      'Il traduit les noms en adresses',
      'Il bloque les messages interdits',
      'Il relie deux réseaux',
    ],
    correct: one,
    explanation:
      'Le serveur DHCP donne à chaque équipement qui le demande une adresse, un masque, une passerelle et un DNS.',
  },
  {
    id: 'ping-role',
    notion: 'ping',
    level: '4e',
    type: 'mcq',
    prompt: 'Que vérifie la commande ping ?',
    choices: [
      'Qu’un équipement est joignable',
      'Qu’un ordinateur n’a pas de virus',
      'La vitesse de l’écran',
      'Le nom du propriétaire d’un site',
    ],
    correct: one,
    explanation:
      'ping envoie une demande et attend la réponse : si elle revient, l’aller et le retour fonctionnent.',
  },
  {
    id: 'objet-connecte-etapes',
    notion: 'objet-connecte',
    level: '4e',
    type: 'order',
    prompt: 'Remets dans l’ordre les étapes pour ajouter un objet connecté à un réseau.',
    items: [
      'Le relier au réseau (câble ou Wi-Fi)',
      'Lui donner une adresse IP libre de ce réseau',
      'Tester la communication avec un ping',
    ],
    explanation:
      'D’abord la liaison, puis l’adresse, enfin le test : sans liaison ou sans adresse, le ping ne peut pas réussir.',
  },

  /* ---------- 3e ---------- */
  {
    id: 'routeur-role',
    notion: 'routeur',
    level: '3e',
    type: 'mcq',
    prompt: 'Quel équipement fait passer les messages d’un réseau à un autre ?',
    choices: ['Le routeur', 'Le switch', 'Le câble Ethernet', 'Le serveur DNS'],
    correct: one,
    explanation:
      'Le routeur relie des réseaux différents. Le switch ne relie que les équipements d’un même réseau.',
  },
  {
    id: 'passerelle-definition',
    notion: 'passerelle',
    level: '3e',
    type: 'mcq',
    prompt: 'La passerelle d’un poste est…',
    choices: [
      'l’adresse du routeur qui se trouve dans son réseau',
      'l’adresse du serveur DNS',
      'l’adresse MAC du switch',
      'l’adresse du poste voisin',
    ],
    correct: one,
    explanation:
      'Le poste confie à sa passerelle les messages destinés aux autres réseaux : c’est l’interface du routeur de son réseau.',
  },
  {
    id: 'passerelle-absente',
    notion: 'passerelle',
    level: '3e',
    type: 'mcq',
    prompt: 'Un poste sans passerelle peut communiquer…',
    choices: [
      'seulement avec les équipements de son propre réseau',
      'avec tous les réseaux, mais plus lentement',
      'avec personne',
      'seulement avec le routeur',
    ],
    correct: one,
    explanation:
      'Sans passerelle, il ne connaît aucun chemin pour sortir de son réseau ; à l’intérieur, tout fonctionne.',
  },
  {
    id: 'table-de-routage-contenu',
    notion: 'table-de-routage',
    level: '3e',
    type: 'mcq',
    prompt: 'Que contient la table de routage d’un routeur ?',
    choices: [
      'Pour chaque réseau de destination, par où envoyer les messages',
      'Les mots de passe des utilisateurs',
      'Les adresses MAC de tous les postes',
      'Les pages web déjà consultées',
    ],
    correct: one,
    explanation:
      'Chaque ligne dit : « pour aller vers tel réseau, passer par telle interface ou tel routeur ».',
  },
  {
    id: 'dns-role',
    notion: 'dns',
    level: '3e',
    type: 'mcq',
    prompt: 'À quoi sert le DNS ?',
    choices: [
      'À traduire un nom, comme www.college.fr, en adresse IP',
      'À distribuer des adresses IP aux équipements',
      'À bloquer les sites dangereux',
      'À accélérer la connexion',
    ],
    correct: one,
    explanation:
      'Le DNS est l’annuaire d’Internet : on lui donne un nom, il répond l’adresse IP correspondante.',
  },
  {
    id: 'paquet-adresses',
    notion: 'trame-paquet',
    level: '3e',
    type: 'mcq',
    prompt: 'Quelles adresses un paquet garde-t-il pendant tout son voyage ?',
    choices: [
      'Les adresses IP de l’émetteur et du destinataire final',
      'Les adresses MAC de l’émetteur et du destinataire final',
      'Aucune : elles changent à chaque routeur',
      'Le nom des routeurs traversés',
    ],
    correct: one,
    explanation:
      'Les adresses IP ne changent pas ; ce sont les adresses MAC de la trame qui changent à chaque étape.',
  },
  {
    id: 'couches-ordre',
    notion: 'couches',
    level: '3e',
    type: 'order',
    prompt: 'Range les couches, de celle du logiciel à celle du câble.',
    items: ['Application', 'Transport', 'Réseau', 'Liaison'],
    explanation:
      'Application (le logiciel), Transport (les ports), Réseau (les adresses IP), Liaison (les adresses MAC).',
  },
  {
    id: 'arp-role',
    notion: 'arp',
    level: '3e',
    type: 'mcq',
    prompt: 'Le protocole ARP sert à trouver…',
    choices: [
      'l’adresse MAC qui correspond à une adresse IP',
      'l’adresse IP qui correspond à un nom',
      'le chemin le plus court vers un réseau',
      'le mot de passe d’un réseau Wi-Fi',
    ],
    correct: one,
    explanation:
      'ARP demande à tout le réseau : « qui a cette adresse IP ? ». Celui qui la porte répond avec son adresse MAC.',
  },
  {
    id: 'ttl-routeur',
    notion: 'ttl',
    level: '3e',
    type: 'mcq',
    prompt: 'Que fait chaque routeur avec le TTL d’un paquet qu’il transmet ?',
    choices: ['Il lui retire 1', 'Il lui ajoute 1', 'Il le remet à 64', 'Il n’y touche pas'],
    correct: one,
    explanation:
      'Chaque routeur retire 1 ; à 0, le paquet est détruit. Il ne peut donc pas tourner sans fin.',
  },
  {
    id: 'pare-feu-sans-regle',
    notion: 'pare-feu',
    level: '3e',
    type: 'mcq',
    prompt: 'Un pare-feu activé, sans aucune règle…',
    choices: [
      'bloque toutes les nouvelles demandes venues de l’extérieur',
      'laisse tout passer',
      'coupe aussi les réponses à ce que l’on a demandé',
      'efface les fichiers suspects',
    ],
    correct: one,
    explanation:
      'Tout ce qui n’est pas autorisé est bloqué ; les réponses à nos propres demandes passent toujours.',
  },
  {
    id: 'web-etapes',
    notion: 'web-http',
    level: '3e',
    type: 'order',
    prompt: 'Remets dans l’ordre ce qui se passe quand on ouvre www.college.fr.',
    items: [
      'Le navigateur demande au DNS l’adresse du serveur',
      'Il ouvre une connexion avec le serveur',
      'Il envoie sa demande de page (HTTP)',
      'Le serveur renvoie la page, qui s’affiche',
    ],
    explanation: 'Le nom d’abord (DNS), puis la connexion (TCP), puis la demande et la réponse (HTTP).',
  },
  {
    id: 'messagerie-protocoles',
    notion: 'messagerie',
    level: '3e',
    type: 'mcq',
    prompt: 'Quand un courriel t’est envoyé, où attend-il que tu le lises ?',
    choices: [
      'Sur le serveur de messagerie de ton domaine',
      'Dans l’ordinateur de l’expéditeur',
      'Dans le routeur le plus proche',
      'Nulle part : il faut être connecté au même moment',
    ],
    correct: one,
    explanation:
      'Le message est déposé dans ta boîte, sur ton serveur de messagerie ; tu le relèves quand tu veux.',
  },
  {
    id: 'chemin-internet-etapes',
    notion: 'chemin-internet',
    level: '3e',
    type: 'mcq',
    prompt: 'Sur Internet, qui connaît le chemin complet que va suivre un message ?',
    choices: [
      'Personne : chaque routeur ne choisit que l’étape suivante',
      'Le premier routeur traversé',
      'L’ordinateur qui envoie le message',
      'Le serveur DNS',
    ],
    correct: one,
    explanation: 'Chaque routeur décide seulement de l’étape suivante, d’après sa table de routage.',
  },
  {
    id: 'protocole-definition',
    notion: 'protocole',
    level: '3e',
    type: 'mcq',
    prompt: 'Qu’est-ce qu’un protocole ?',
    choices: [
      'Des règles que deux équipements suivent pour se comprendre',
      'Un câble spécial pour les serveurs',
      'Un logiciel antivirus',
      'Le nom d’une marque de routeurs',
    ],
    correct: one,
    explanation:
      'Un protocole fixe la forme des messages et leur ordre, pour que les deux équipements se comprennent.',
  },
];
