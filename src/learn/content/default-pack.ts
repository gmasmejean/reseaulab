import { DEFAULT_QUESTIONS } from './default-questions';
import type { Notion, Pack } from './types';

/* Default knowledge cards, written for pupils of 13 to 15 (French collège,
 * Technologie, cycle 4). The split by school year and the wording are a
 * proposal: a teacher adjusts them with a pack file, without touching this
 * module. No card quotes the official curriculum; the `curriculum` field is
 * left for the teacher to fill in. */

const GUIDES: readonly Notion[] = [
  {
    id: 'guide-construire',
    title: 'Construire un réseau',
    aliases: ['palette', 'câbler', 'ajouter un équipement'],
    level: '5e',
    category: 'guide',
    short: 'En mode Conception, on pose des équipements sur le plan puis on les relie.',
    body: `Cliquez sur un équipement de la [[ecran:palette]] (à gauche) pour l’ajouter au plan, ou faites-le glisser à l’endroit voulu. Déplacez-le ensuite à la souris.

Pour relier deux équipements, choisissez l’outil [[ecran:cable]], cliquez sur le premier équipement puis sur le second. L’outil reste actif pour poser d’autres câbles ; la touche [touche:Échap] l’arrête.

Les outils [[ecran:texte]] et [[ecran:zone]] servent à annoter le plan : nommer une salle, entourer un réseau.`,
    remember: [
      'Un équipement sélectionné se supprime avec la touche [touche:Suppr].',
      '[touche:Ctrl+Z] annule la dernière modification, [touche:Ctrl+Y] la rétablit.',
      'La touche [touche:F1] ouvre la fiche de l’équipement sélectionné ; le clic droit sur un équipement propose « Qu’est-ce que c’est ? ».',
      'Le bouton [[ecran:reglages]] (⚙) adapte RéseauLab au niveau de la classe.',
      'Le plan s’ajuste à l’écran ; les boutons du [[ecran:zoom]] (− / + / Ajuster) changent sa taille.',
    ],
    related: ['guide-configurer', 'reseau', 'switch', 'liaison'],
  },
  {
    id: 'guide-configurer',
    title: 'Configurer un équipement',
    aliases: ['panneau', 'réglages'],
    level: '5e',
    category: 'guide',
    short: 'Un équipement sélectionné se règle dans le panneau du bas.',
    body: `Cliquez sur un équipement : son [[ecran:panneau|panneau]] s’ouvre en bas de l’écran. Pour un ordinateur, on y règle son nom, sa carte réseau (filaire ou Wi-Fi) et sa **configuration IP** : [[adresse-ip|adresse IP]], [[masque]], [[passerelle]], [[dns|serveur DNS]], ou bien la configuration automatique ([[dhcp|DHCP]]).

Une valeur tapée est prise en compte dès que vous quittez le champ : touche [touche:Entrée], touche [touche:Tab] ou clic ailleurs. Si elle est incorrecte, un message rouge apparaît sous le champ.

Le petit bouton **?** à côté d’un champ rappelle à quoi il sert.`,
    remember: [
      'Un « ! » sur un équipement signale un réglage à vérifier : le panneau dit quoi faire.',
      'Le clic droit sur un équipement ouvre un menu (configurer, supprimer ses câbles, supprimer).',
    ],
    related: ['guide-verifier', 'adresse-ip', 'masque', 'passerelle'],
  },
  {
    id: 'guide-simuler',
    title: 'Lancer la simulation',
    aliases: ['mode simulation', 'bureau', 'ligne de commande'],
    level: '5e',
    category: 'guide',
    short: 'En mode Simulation, les équipements fonctionnent : on ouvre leur bureau et on les utilise.',
    body: `Cliquez sur [[ecran:simulation]] en haut de l’écran. Cliquez ensuite sur un ordinateur pour ouvrir son **bureau** : on y lance la ligne de commande, le navigateur web, la messagerie… et on y installe d’autres logiciels.

Dans la **ligne de commande**, tapez \`help\` pour voir les commandes. Les plus utiles : \`ipconfig\` (voir sa configuration), \`ping\` (tester une communication), \`traceroute\` (voir les routeurs traversés).

Les fenêtres se déplacent par leur barre de titre. [touche:Échap] ferme celle du dessus ; [[ecran:ranger]] et **Tout fermer** sont en bas de l’écran.`,
    remember: [
      'Revenir en mode Conception arrête la simulation : les fenêtres se ferment.',
      'Un serveur installé doit être démarré depuis sa fenêtre.',
    ],
    related: ['guide-observer', 'ping', 'client-serveur'],
  },
  {
    id: 'guide-observer',
    title: 'Observer les échanges',
    aliases: ['trames', 'légende', 'pas à pas', 'échanges de données'],
    level: '5e',
    category: 'guide',
    short:
      'Les messages échangés circulent sur les câbles, au ralenti, et sont listés pour chaque équipement.',
    body: `Pendant la simulation, chaque message qui passe sur un câble est dessiné comme une pastille qui porte le nom de son [[protocole]]. La [[ecran:legende|légende]], en bas à gauche du plan, explique les couleurs. Le curseur [[ecran:vitesse]] règle le ralenti.

[[ecran:pause]] puis [[ecran:trame-suivante]] font avancer les messages câble par câble : pratique pour suivre un échange pas à pas.

La fenêtre **Échanges de données** d’un équipement liste tout ce qu’il a envoyé et reçu. Cliquez sur une ligne pour voir son contenu, [[couches|couche par couche]].`,
    remember: [
      'Des messages passent parfois sans que vous ayez rien lancé : adresses automatiques (DHCP), routes des routeurs (RIP). La case « Masquer le trafic automatique » les cache.',
      'Une trame « ignorée » est arrivée jusqu’à l’équipement sans lui être destinée.',
    ],
    related: ['trame-paquet', 'couches', 'guide-verifier'],
  },
  {
    id: 'guide-verifier',
    title: 'Trouver ce qui ne marche pas',
    aliases: ['vérifier', 'diagnostic', 'erreur', 'panne'],
    level: '5e',
    category: 'guide',
    short: 'Le bouton Vérifier repère les erreurs de réglage et explique pourquoi une communication échoue.',
    body: `Le bouton [[ecran:verifier]] ouvre deux outils.

**Vérification du réseau** : la liste de ce qui semble mal réglé (équipement non relié, adresse manquante ou en double, passerelle mal choisie…). Chaque point dit pourquoi c’est gênant et quoi faire ; **Montrer** sélectionne l’équipement concerné.

**Tester une communication** : choisissez un équipement de départ et une destination. Le test se fait sur une copie du réseau, sans lancer la simulation. En cas d’échec, il indique où le message s’est arrêté et pourquoi.

Dans la ligne de commande, après un \`ping\` raté, le bouton **Pourquoi ça ne marche pas ?** lance directement ce test.`,
    remember: [
      'Corrigez un problème à la fois, puis testez de nouveau.',
      'Commencez par le plus simple : les câbles, puis les adresses, puis la passerelle.',
    ],
    related: ['ping', 'adresse-ip', 'passerelle'],
  },
  {
    id: 'guide-fichiers',
    title: 'Enregistrer et rouvrir son travail',
    aliases: ['enregistrer', 'ouvrir', 'fichier', 'Filius'],
    level: '5e',
    category: 'guide',
    short: 'Enregistrer télécharge un fichier que l’on rouvre plus tard avec Ouvrir.',
    body: `[[ecran:enregistrer]] demande un nom (par exemple le vôtre et celui de l’activité), puis place un fichier \`.reseaulab.json\` dans les téléchargements du navigateur. C’est ce fichier qu’il faut garder ou rendre.

[[ecran:ouvrir]] recharge un fichier enregistré. Il accepte aussi les projets du logiciel Filius (\`.fls\`).

Le travail en cours est aussi gardé automatiquement dans le navigateur du poste. À l’ouverture, RéseauLab signale le travail retrouvé : sur un ordinateur partagé, c’est peut-être celui d’un autre élève.`,
    remember: [
      'La sauvegarde automatique ne remplace pas Enregistrer : elle reste sur ce poste.',
      '[[ecran:exemple]] charge un réseau de collège complet pour s’entraîner.',
      '[[ecran:activites]] propose des exercices guidés ; le fichier enregistré garde ce qui a été réussi.',
    ],
    related: ['guide-construire'],
  },
];

const NOTIONS: readonly Notion[] = [
  {
    id: 'reseau',
    title: 'Réseau informatique',
    aliases: ['réseau'],
    level: '5e',
    category: 'materiel',
    short: 'Un réseau informatique est un ensemble d’équipements reliés entre eux pour échanger des données.',
    body: `Dès que deux équipements sont reliés et peuvent s’envoyer des messages, ils forment un réseau. Un réseau sert à **partager** : des fichiers, une imprimante, une connexion à Internet, des messages.

Dans un réseau on trouve des [[terminal|terminaux]] (ordinateurs, tablettes, objets connectés…), des équipements qui les relient ([[switch]], [[routeur]]) et des [[liaison|liaisons]] (câbles ou Wi-Fi).`,
    remember: [
      'Un réseau relie des équipements pour qu’ils échangent des données.',
      'Terminaux, équipements d’interconnexion et liaisons : les trois familles de composants.',
    ],
    inApp: 'Deux ordinateurs reliés à un switch forment déjà un réseau.',
    related: ['terminal', 'switch', 'liaison', 'reseau-local-internet'],
  },
  {
    id: 'terminal',
    title: 'Terminal',
    aliases: ['équipement terminal', 'poste', 'ordinateur', 'périphérique'],
    level: '5e',
    category: 'materiel',
    short:
      'Un terminal est un équipement placé au bout du réseau : c’est lui qui émet ou reçoit les données.',
    body: `Ordinateur, tablette, smartphone, imprimante, console de jeu, [[objet-connecte|objet connecté]] : tous sont des terminaux. Ils utilisent le réseau, alors que le [[switch]] et le [[routeur]] le font fonctionner.

Pour se relier au réseau, un terminal a une **carte réseau**, filaire ou Wi-Fi. Certains terminaux rendent des services aux autres : ce sont des [[client-serveur|serveurs]].`,
    remember: [
      'Un terminal est à une extrémité du réseau.',
      'Il a besoin d’une carte réseau pour communiquer.',
    ],
    inApp:
      'Dans la palette : Ordinateur, Portable, Serveur, Imprimante, Objet connecté, Smartphone et Tablette.',
    related: ['reseau', 'adresse-mac', 'client-serveur', 'objet-connecte'],
  },
  {
    id: 'client-serveur',
    title: 'Client et serveur',
    aliases: ['serveur', 'client', 'service'],
    level: '5e',
    category: 'services',
    short: 'Un serveur rend un service ; un client le lui demande.',
    body: `Quand vous affichez une page web, votre navigateur est le **client** : il envoie une demande. L’ordinateur qui possède la page est le **serveur** : il répond en l’envoyant.

Un serveur est un ordinateur comme un autre, sur lequel fonctionne un logiciel qui attend les demandes : serveur web, serveur de messagerie, serveur [[dns|DNS]], serveur [[dhcp|DHCP]]… Il doit rester allumé et garder la même adresse pour qu’on le retrouve.`,
    remember: [
      'Le client demande, le serveur répond.',
      'Un serveur ne répond que si son logiciel est démarré.',
    ],
    inApp:
      'En simulation, « Installer des logiciels » sur le bureau d’un poste propose les serveurs ; chacun se démarre depuis sa fenêtre.',
    mistakes: [
      {
        belief: 'un serveur est forcément un gros ordinateur spécial.',
        truth:
          'un serveur, c’est d’abord un logiciel qui rend un service. N’importe quel ordinateur peut en faire fonctionner un.',
      },
    ],
    related: ['web-http', 'messagerie', 'dns', 'dhcp', 'fichiers-arborescence'],
  },
  {
    id: 'switch',
    title: 'Switch (commutateur)',
    aliases: ['commutateur', 'switch'],
    level: '5e',
    category: 'materiel',
    short: 'Un switch, ou commutateur, relie entre eux les équipements d’un même réseau local.',
    body: `Le switch a plusieurs prises, appelées **ports**. Chaque équipement y est branché par un câble. Quand un message arrive sur un port, le switch le renvoie vers le port où se trouve son destinataire.

Pour cela il **apprend** : en lisant l’[[adresse-mac|adresse MAC]] de l’émetteur de chaque message, il note sur quel port se trouve chaque équipement. Tant qu’il ne sait pas où est un destinataire, il envoie le message sur tous ses ports.`,
    remember: [
      'Le switch relie les équipements d’un même réseau.',
      'Il apprend sur quel port se trouve chaque adresse MAC.',
    ],
    inApp: 'En simulation, cliquez sur un switch : sa table des adresses MAC se remplit au fil des échanges.',
    mistakes: [
      {
        belief: 'un switch a besoin d’une adresse IP pour fonctionner.',
        truth:
          'il aiguille les trames grâce aux [[adresse-mac|adresses MAC]] ; il n’a pas besoin d’adresse IP pour faire son travail.',
      },
      {
        belief: 'un switch relie deux réseaux différents.',
        truth:
          'il relie les équipements d’un même réseau. Relier deux réseaux, c’est le rôle du [[routeur]].',
      },
    ],
    related: ['adresse-mac', 'reseau', 'routeur', 'wifi'],
  },
  {
    id: 'liaison',
    title: 'Liaisons filaires et sans fil',
    aliases: ['câble', 'câble Ethernet', 'fibre optique', 'liaison'],
    level: '5e',
    category: 'materiel',
    short: 'Une liaison transporte les données entre deux équipements : par un câble ou par des ondes.',
    body: `Les liaisons **filaires** utilisent un câble : câble Ethernet en cuivre, dans lequel passe un signal électrique, ou fibre optique, dans laquelle passe de la lumière. Elles sont rapides et fiables.

Les liaisons **sans fil** utilisent des ondes radio : [[wifi|Wi-Fi]], Bluetooth, réseau mobile (4G, 5G). Elles permettent de se déplacer, mais leur portée est limitée et les obstacles les gênent.`,
    remember: [
      'Sans liaison, aucun message ne peut partir ni arriver.',
      'Filaire : câble Ethernet, fibre optique. Sans fil : Wi-Fi, Bluetooth, réseau mobile.',
    ],
    inApp: 'L’outil Câble relie deux équipements ; une liaison Wi-Fi est dessinée en pointillés.',
    related: ['wifi', 'switch', 'reseau'],
  },
  {
    id: 'wifi',
    title: 'Wi-Fi, point d’accès et SSID',
    aliases: ['wifi', 'point d’accès', 'SSID', 'sans fil'],
    level: '5e',
    category: 'materiel',
    short: 'Le Wi-Fi relie des équipements au réseau par des ondes radio, grâce à un point d’accès.',
    body: `Le **point d’accès** est l’équipement qui émet le réseau sans fil. À la maison, il est dans la [[box]]. Il diffuse un nom de réseau, le **SSID** : c’est le nom que l’on choisit dans la liste des réseaux Wi-Fi.

Un terminal en Wi-Fi rejoint un réseau en choisissant son SSID (et, en vrai, en donnant son mot de passe). Il se comporte ensuite comme s’il était branché par un câble.`,
    remember: [
      'Le SSID est le nom d’un réseau Wi-Fi.',
      'Le point d’accès relie les équipements sans fil au reste du réseau.',
    ],
    inApp:
      'La box et chaque switch sont aussi des points d’accès avec un nom Wi-Fi (SSID). Réglez un poste en « Sans fil (Wi-Fi) » puis choisissez ce nom.',
    mistakes: [
      {
        belief: 'Wi-Fi et Internet, c’est la même chose.',
        truth:
          'le Wi-Fi relie seulement l’appareil au point d’accès (souvent la box). L’accès à Internet passe ensuite par la box et le fournisseur d’accès.',
      },
    ],
    related: ['liaison', 'box', 'switch'],
  },
  {
    id: 'box',
    title: 'Box Internet',
    aliases: ['box', 'modem', 'routeur domestique'],
    level: '5e',
    category: 'materiel',
    short: 'La box relie le réseau de la maison à Internet et réunit plusieurs équipements en un seul.',
    body: `Une box contient à la fois un [[routeur]] (il relie le réseau de la maison à Internet), un [[switch]] (ses prises pour les câbles), un [[wifi|point d’accès Wi-Fi]] et un serveur [[dhcp|DHCP]] (il donne automatiquement une adresse à chaque appareil).

C’est pour cela qu’à la maison on branche un appareil, ou on choisit le Wi-Fi, et « ça marche » : la box fait tout le travail de configuration.`,
    remember: [
      'Une box = routeur + switch + point d’accès Wi-Fi + serveur DHCP.',
      'Elle sépare le réseau local de la maison et Internet.',
    ],
    inApp:
      'L’équipement « Box Internet » de la palette fait tout cela : reliez-y des terminaux (câble ou Wi-Fi), cochez « Configuration automatique (DHCP) » sur chacun, et la box leur donne une adresse. Sa prise Internet se relie à un routeur. Simplification : la box de RéseauLab ne modifie pas les adresses des messages ; pour sortir vers Internet, le routeur d’en face doit connaître le chemin du réseau de la maison.',
    related: ['routeur', 'switch', 'wifi', 'dhcp', 'reseau-local-internet', 'ip-privee-publique'],
  },
  {
    id: 'reseau-local-internet',
    title: 'Réseau local et Internet',
    aliases: ['réseau local', 'LAN', 'Internet', 'réseau mondial'],
    level: '5e',
    category: 'materiel',
    short:
      'Un réseau local couvre un lieu (maison, collège) ; Internet relie entre eux des réseaux du monde entier.',
    body: `Un **réseau local** (LAN) relie les équipements d’un même lieu : ceux de la maison, d’une salle, de tout le collège. Ses équipements communiquent directement, par l’intermédiaire de [[switch|switchs]].

**Internet** n’est pas un seul grand réseau : c’est un réseau **de réseaux**. Des millions de réseaux locaux y sont reliés les uns aux autres par des [[routeur|routeurs]]. Pour sortir de son réseau local, un message passe par un routeur : la [[passerelle]].`,
    remember: [
      'Réseau local : un lieu, des équipements reliés par des switchs.',
      'Internet : des réseaux reliés entre eux par des routeurs.',
    ],
    inApp:
      'Le réseau d’exemple contient deux réseaux locaux (salle des élèves, salle des serveurs) reliés par un routeur.',
    mistakes: [
      {
        belief: 'Internet est un seul grand réseau.',
        truth:
          'Internet est un réseau de réseaux : des milliers de réseaux reliés entre eux par des routeurs.',
      },
    ],
    related: ['reseau', 'routeur', 'passerelle', 'chemin-internet', 'ip-privee-publique'],
  },
  {
    id: 'topologie',
    title: 'Topologie d’un réseau',
    aliases: ['schéma du réseau', 'architecture', 'étoile', 'arbre', 'maillée', 'maillage', 'panne'],
    level: '5e',
    category: 'materiel',
    short:
      'La topologie est la façon dont les équipements d’un réseau sont reliés entre eux : qui est relié à qui.',
    body: `On la représente par un schéma : un dessin pour chaque équipement, un trait pour chaque [[liaison]]. L’endroit où les équipements sont posés dans la pièce ne compte pas : seuls les traits comptent.

[[schema:topologies]]

- **En étoile** : tous les terminaux sont reliés à un même équipement central, le plus souvent un [[switch]]. C’est la topologie des réseaux locaux. Les appareils en [[wifi|Wi-Fi]] forment aussi une étoile, autour du point d’accès.
- **En arbre** : plusieurs étoiles reliées entre elles. Dans un collège, chaque salle a son switch, et les switchs des salles sont reliés à un switch principal.
- **Maillée** : il existe plusieurs chemins d’un équipement à l’autre. C’est le cas des [[routeur|routeurs]] d’[[reseau-local-internet|Internet]] : si une liaison est coupée, les messages passent par un autre chemin.

Lire le schéma permet de prévoir l’effet d’une panne. En étoile, si un câble est débranché, seul son terminal est coupé du réseau ; si le switch central tombe en panne, plus personne ne communique. En arbre, la panne d’un switch coupe tous les équipements qui sont « en dessous » de lui.`,
    remember: [
      'La topologie décrit qui est relié à qui, pas où les équipements sont posés.',
      'En étoile : tous les terminaux sont reliés à un équipement central (switch, point d’accès Wi-Fi).',
      'En arbre : des étoiles reliées entre elles, par exemple un switch par salle relié au switch principal.',
      'Maillée : plusieurs chemins possibles ; une liaison coupée n’arrête pas les échanges.',
    ],
    example:
      'Dans la salle de techno, les postes et l’imprimante sont reliés au switch de la salle : c’est une étoile. Ce switch est relié au switch principal du collège, comme ceux des autres salles : le réseau du collège est un arbre.',
    mistakes: [
      {
        belief: 'la topologie, c’est la place des équipements dans la salle.',
        truth:
          'c’est la façon dont ils sont reliés. Deux postes voisins peuvent être branchés sur deux switchs différents ; deux schémas dessinés autrement peuvent montrer la même topologie.',
      },
      {
        belief: 'si un câble est débranché, tout le réseau s’arrête.',
        truth:
          'en étoile, seul l’équipement au bout de ce câble est coupé. C’est la panne de l’équipement central, le switch, qui coupe tout le monde.',
      },
      {
        belief: 'en Wi-Fi, les appareils sont reliés directement les uns aux autres.',
        truth: 'chacun est relié au point d’accès, au centre : c’est aussi une étoile.',
      },
    ],
    inApp:
      'Le plan de RéseauLab est le schéma de la topologie. Pour voir l’effet d’une panne : en Conception, supprimez le câble d’un poste ; en Simulation, faites un ping vers ce poste, puis vers un poste resté branché.',
    related: ['reseau', 'switch', 'liaison', 'reseau-local-internet', 'chemin-internet'],
  },
  {
    id: 'fichiers-arborescence',
    title: 'Fichiers, dossiers et arborescence',
    aliases: ['fichier', 'dossier', 'arborescence', 'chemin', 'extension', 'lecteur réseau', 'droits'],
    level: '5e',
    category: 'services',
    short:
      'Les fichiers sont rangés dans des dossiers emboîtés : l’arborescence. Un chemin indique où trouver un fichier.',
    body: `Un **fichier** contient des données : un texte, une image, un tableau, un programme. Son nom se termine souvent par une **extension** qui indique son format : \`.txt\` (texte), \`.odt\` ou \`.docx\` (traitement de texte), \`.ods\` ou \`.xlsx\` (tableur), \`.png\` ou \`.jpg\` (image), \`.csv\` (tableau de données).

Les fichiers sont rangés dans des **dossiers**, eux-mêmes rangés dans d’autres dossiers : cela forme une **arborescence**, comme les branches d’un arbre. Le **chemin** d’un fichier liste les dossiers à ouvrir pour l’atteindre, séparés par \`/\` (ou \`\\\` sous Windows) : \`/Documents/4A/compte-rendu.odt\`.

Au collège, tes fichiers ne sont pas sur le poste où tu travailles : ils sont sur un [[client-serveur|serveur]], et tu les retrouves depuis n’importe quel poste dans un **lecteur réseau**. Chaque dossier a des **droits** : certains se lisent seulement (lecture), d’autres permettent aussi d’ajouter ou de modifier des fichiers (écriture).`,
    remember: [
      'Un fichier est rangé dans un dossier ; les dossiers emboîtés forment l’arborescence.',
      'Le chemin indique où est un fichier : /Documents/4A/compte-rendu.odt.',
      'L’extension indique le format du fichier (.odt, .png, .csv…).',
      'Droits : lecture (consulter) ou écriture (modifier, ajouter).',
    ],
    example:
      'Dans /Documents/Commun/reglement.pdf, le fichier reglement.pdf (un PDF) est dans le dossier Commun, lui-même dans Documents.',
    inApp:
      'En simulation, ouvrez l’Explorateur de fichiers d’un poste ou d’un serveur pour parcourir son arborescence ; dans la ligne de commande, dir (ou ls) liste un dossier et cd y entre.',
    mistakes: [
      {
        belief: 'mes fichiers du collège sont enregistrés sur l’ordinateur où je travaille.',
        truth:
          'ils sont sur le serveur du collège : c’est pour cela que tu les retrouves sur n’importe quel poste, après t’être connecté avec ton compte.',
      },
      {
        belief: 'changer l’extension d’un fichier change son format.',
        truth:
          'l’extension indique seulement le format. Renommer image.png en image.txt ne la transforme pas en texte : l’ordinateur ne saura plus l’ouvrir.',
      },
    ],
    related: ['client-serveur', 'securite-numerique', 'guide-fichiers'],
  },
  {
    id: 'securite-numerique',
    title: 'Bons usages et sécurité numérique',
    aliases: [
      'mot de passe',
      'verrouillage de session',
      'compte personnel',
      'droit d’auteur',
      'propriété intellectuelle',
      'cyberviolence',
      'usurpation d’identité',
    ],
    level: '5e',
    category: 'securite',
    short:
      'Protéger son compte et respecter les autres : mot de passe, session verrouillée, droit d’auteur, comportement responsable.',
    body: `Au collège, chacun a un **compte personnel** : il donne accès à tes fichiers et à l’ENT. Ce qui est fait avec ton compte est fait **en ton nom**. Pour le protéger :

- un **mot de passe** long, que tu es seul à connaître, différent pour chaque service ;
- **verrouiller sa session** dès qu’on quitte son poste ([touche:Windows+L]) et se déconnecter à la fin du cours.

Respecter les autres, c’est aussi :

- le **droit d’auteur** (propriété intellectuelle) : une image, une musique, un texte trouvés sur Internet appartiennent à leur auteur. On ne les réutilise que si c’est autorisé (licence libre, par exemple), en citant la source ;
- ne pas se servir du compte d’un autre : c’est une **usurpation d’identité**, punie par la loi ;
- refuser la **cyberviolence** (moqueries, insultes, photos publiées sans accord) : en parler à un adulte, ne pas la relayer. La **vie privée** des autres se respecte aussi en ligne.`,
    remember: [
      'Mon compte = mon identité : mot de passe secret, session verrouillée quand je m’absente.',
      'Une œuvre trouvée sur Internet a un auteur : autorisation et source.',
      'Utiliser le compte d’un autre est une usurpation d’identité.',
      'Face à la cyberviolence : ne pas relayer, en parler à un adulte.',
    ],
    example:
      'Un mot de passe solide : une phrase facile à retenir pour toi mais longue, comme « 3Chats-mangent2Pizzas! », plutôt que « 1234 » ou ton prénom.',
    mistakes: [
      {
        belief: 'je peux prêter mon mot de passe à mon meilleur ami.',
        truth: 'tout ce qu’il fera avec sera fait en ton nom. Un mot de passe ne se prête pas.',
      },
      {
        belief: 'une image trouvée sur Internet est libre de droits.',
        truth:
          'elle appartient à son auteur, même sans le symbole ©. Il faut une autorisation, une licence libre, et citer la source.',
      },
    ],
    related: ['fichiers-arborescence', 'usage-raisonne', 'pare-feu'],
  },
  {
    id: 'adresse-ip',
    title: 'Adresse IP',
    aliases: ['IP', 'adresse', 'IPv4'],
    level: '4e',
    category: 'adressage',
    short:
      'L’adresse IP identifie un équipement sur le réseau, comme une adresse postale identifie une maison.',
    body: `Pour envoyer un message, il faut savoir à qui : chaque équipement a donc une adresse IP. Elle s’écrit avec **4 nombres de 0 à 255** séparés par des points, par exemple \`192.168.1.10\`.

Une adresse IP a deux parties : le début désigne le **réseau** (comme la ville et la rue), la fin désigne l’**équipement** dans ce réseau (comme le numéro de la maison). C’est le [[masque]] qui indique où s’arrête la première partie.

[[schema:adresse-ip]]

Dans un même réseau, deux équipements ne peuvent pas avoir la même adresse.`,
    remember: [
      'Une adresse IP : 4 nombres de 0 à 255 séparés par des points.',
      'Elle est unique dans son réseau.',
      'Début = le réseau, fin = l’équipement.',
    ],
    example:
      'Dans 192.168.1.10 avec le masque 255.255.255.0, le réseau est 192.168.1 et l’équipement est le numéro 10.',
    inApp:
      'Sélectionnez un ordinateur en mode Conception : son adresse IP se règle dans le panneau du bas. En simulation, la commande ipconfig l’affiche.',
    mistakes: [
      {
        belief: 'un ordinateur garde la même adresse IP partout.',
        truth:
          'l’adresse IP dépend du réseau où il est branché : à la maison et au collège, un portable n’a pas la même. C’est son [[adresse-mac|adresse MAC]] qui ne change pas.',
      },
      {
        belief: '192.168.1.300 est une adresse IP possible.',
        truth: 'chacun des 4 nombres va de 0 à 255.',
      },
    ],
    related: ['masque', 'adresse-mac', 'dhcp', 'passerelle', 'ip-privee-publique', 'depannage'],
  },
  {
    id: 'masque',
    title: 'Masque et « même réseau »',
    aliases: ['masque de sous-réseau', 'masque', 'même réseau', 'adresse du réseau'],
    level: '4e',
    category: 'adressage',
    short: 'Le masque indique quelle partie de l’adresse IP désigne le réseau.',
    body: `Le masque s’écrit comme une adresse IP. Le plus courant est \`255.255.255.0\` : il signifie que les **trois premiers nombres** de l’adresse désignent le réseau, et le dernier l’équipement.

Deux équipements sont **dans le même réseau** si la partie réseau de leurs adresses est identique. Ils peuvent alors communiquer directement. Sinon, leurs messages doivent passer par un [[routeur]].

[[schema:meme-reseau]]

Avec le masque \`255.255.255.0\`, un réseau peut contenir 254 équipements : les numéros 1 à 254. Le 0 désigne le réseau lui-même et le 255 sert à s’adresser à tous ses équipements à la fois (diffusion).`,
    remember: [
      'Masque 255.255.255.0 : les trois premiers nombres désignent le réseau.',
      'Même partie réseau = même réseau = communication directe.',
    ],
    example:
      '192.168.1.10 et 192.168.1.25 (masque 255.255.255.0) sont dans le même réseau. 192.168.1.10 et 192.168.2.10 ne le sont pas.',
    inApp:
      'RéseauLab propose le masque 255.255.255.0 avec la première adresse. Vérifier signale des équipements reliés au même switch mais placés dans des réseaux différents.',
    mistakes: [
      {
        belief: 'deux adresses qui se ressemblent sont dans le même réseau.',
        truth:
          'c’est le masque qui décide. Avec 255.255.255.0, 192.168.1.10 et 192.168.2.10 sont dans deux réseaux différents : leurs trois premiers nombres ne sont pas identiques.',
      },
      {
        belief: 'le masque est l’adresse d’un équipement.',
        truth:
          'il ne désigne aucun équipement : il dit seulement où s’arrête la partie « réseau » d’une adresse.',
      },
    ],
    related: ['adresse-ip', 'passerelle', 'routeur'],
  },
  {
    id: 'adresse-mac',
    title: 'Adresse MAC et carte réseau',
    aliases: ['MAC', 'adresse physique', 'carte réseau'],
    level: '4e',
    category: 'adressage',
    short: 'L’adresse MAC est le numéro de série de la carte réseau : elle est fixée à la fabrication.',
    body: `La **carte réseau** est le composant qui relie un équipement au réseau, par câble ou en Wi-Fi. Chaque carte porte une adresse MAC unique au monde, écrite avec 6 groupes de deux caractères, par exemple \`02:00:00:00:00:01\`.

L’[[adresse-ip|adresse IP]] et l’adresse MAC ne servent pas à la même chose. L’adresse IP se choisit et dit **où** est l’équipement dans les réseaux ; l’adresse MAC ne change pas et sert à remettre un message au bon équipement **à l’intérieur du réseau local**. Le [[switch]] ne regarde que les adresses MAC.`,
    remember: [
      'Adresse MAC : fixe, liée à la carte réseau.',
      'Adresse IP : choisie, liée au réseau où se trouve l’équipement.',
    ],
    inApp:
      'Le panneau d’un ordinateur affiche son adresse MAC ; la commande ipconfig aussi (« adresse physique »).',
    mistakes: [
      {
        belief: 'l’adresse MAC permet de retrouver un ordinateur sur Internet.',
        truth:
          'elle ne sert que dans le réseau local. D’un réseau à l’autre, c’est l’[[adresse-ip|adresse IP]] qui guide le message.',
      },
    ],
    related: ['adresse-ip', 'switch', 'arp'],
  },
  {
    id: 'dhcp',
    title: 'Adresse fixe ou automatique (DHCP)',
    aliases: ['DHCP', 'configuration automatique', 'adresse automatique', 'adresse fixe', 'bail'],
    level: '4e',
    category: 'services',
    short:
      'Une adresse IP peut être réglée à la main (fixe) ou distribuée automatiquement par un serveur DHCP.',
    body: `Avec une adresse **fixe**, quelqu’un règle à la main l’[[adresse-ip|adresse IP]], le [[masque]], la [[passerelle]] et le serveur [[dns|DNS]] de l’équipement. C’est ce qu’on fait pour un serveur ou une imprimante, que l’on doit toujours retrouver à la même adresse.

Avec la configuration **automatique**, l’équipement demande à son démarrage : « qui peut me donner une adresse ? ». Un serveur **DHCP** du même réseau lui en propose une, avec le masque, la passerelle et le DNS. C’est ce que fait la [[box]] à la maison.`,
    remember: [
      'Adresse fixe : réglée à la main, ne change pas.',
      'Adresse automatique : donnée par un serveur DHCP du même réseau.',
      'Le serveur DHCP, lui, doit avoir une adresse fixe.',
    ],
    inApp:
      'Cochez « Configuration automatique (DHCP) » sur un poste. Au lancement de la simulation, suivez les trames DHCP ; ipconfig montre l’adresse obtenue.',
    mistakes: [
      {
        belief: 'en configuration automatique, l’ordinateur choisit lui-même son adresse.',
        truth: 'il la demande : c’est le serveur DHCP qui la lui attribue, pour un temps limité (le bail).',
      },
      {
        belief: 'un serveur peut recevoir n’importe quelle adresse par DHCP.',
        truth:
          'les autres doivent le retrouver toujours à la même adresse : on lui donne en général une adresse fixe.',
      },
    ],
    related: ['adresse-ip', 'box', 'client-serveur'],
  },
  {
    id: 'ping',
    title: 'Tester une communication : ping',
    aliases: ['ping', 'test de communication', 'ICMP'],
    level: '4e',
    category: 'protocoles',
    short:
      'La commande ping envoie une demande à un équipement et attend sa réponse : elle dit s’il est joignable.',
    body: `\`ping\` suivi d’une adresse envoie un petit message, une « demande d’écho ». Si l’équipement visé le reçoit, il renvoie une « réponse d’écho ». Le temps affiché est la durée de l’aller-retour.

Si la réponse revient, les deux équipements peuvent communiquer. Sinon, le message s’est perdu quelque part : à l’aller **ou** au retour. Il faut alors chercher : câble, adresse, masque, [[passerelle]], [[pare-feu]]…`,
    remember: [
      'ping teste si un équipement est joignable.',
      'Une réponse = l’aller et le retour fonctionnent.',
    ],
    example: 'ping 192.168.1.10 — ou ping www.college.fr si un serveur DNS est configuré.',
    inApp:
      'En simulation, ouvrez la ligne de commande d’un poste et tapez ping suivi d’une adresse. Après un échec, « Pourquoi ça ne marche pas ? » explique où le message s’est arrêté.',
    mistakes: [
      {
        belief: 'si le ping échoue, c’est que la destination est éteinte.',
        truth:
          'la panne peut être n’importe où : câble, adresse, masque, passerelle, pare-feu… et même sur le chemin du retour. Le bouton [[ecran:verifier]] aide à la trouver.',
      },
    ],
    related: ['guide-verifier', 'adresse-ip', 'ttl', 'depannage'],
  },
  {
    id: 'objet-connecte',
    title: 'Objet connecté',
    aliases: ['objet connecté', 'IoT', 'capteur'],
    level: '4e',
    category: 'materiel',
    short: 'Un objet connecté est un objet du quotidien capable d’échanger des données par un réseau.',
    body: `Montre, enceinte, thermostat, caméra, station météo : un objet connecté contient des capteurs ou des actionneurs, un petit ordinateur et une carte réseau, souvent en [[wifi|Wi-Fi]] ou en Bluetooth.

Pour le réseau, c’est un [[terminal]] comme un autre : pour communiquer il lui faut une liaison, une [[adresse-ip|adresse IP]] dans le bon réseau, et souvent une [[passerelle]] pour joindre un serveur sur Internet.`,
    remember: [
      'Un objet connecté est un terminal : il lui faut une adresse IP du réseau où on l’ajoute.',
      'Ajouter un objet à un réseau : le relier, lui donner une adresse du même réseau, tester.',
    ],
    inApp:
      'Ajoutez un « Objet connecté » à un réseau existant, donnez-lui une adresse libre du même réseau, puis vérifiez par un ping, ou tapez son adresse dans le navigateur d’un poste pour lire sa mesure.',
    related: ['terminal', 'adresse-ip', 'masque', 'wifi', 'donnees-objet', 'usage-raisonne'],
  },
  {
    id: 'ip-privee-publique',
    title: 'Adresse IP privée et adresse IP publique',
    aliases: ['adresse privée', 'adresse publique', 'IP publique', 'IP privée', 'FAI', 'fournisseur d’accès'],
    level: '4e',
    category: 'adressage',
    short:
      'Une adresse privée sert dans un réseau local ; une adresse publique, fournie par le fournisseur d’accès, identifie ce réseau sur Internet.',
    body: `Certaines plages d’[[adresse-ip|adresses IP]] sont réservées aux **réseaux locaux** : ce sont les adresses **privées**. Les plus courantes commencent par \`192.168.\`, \`10.\` ou \`172.16.\` à \`172.31.\`. Chaque maison, chaque collège peut utiliser les mêmes : elles ne sortent jamais sur Internet.

Pour aller sur Internet, le réseau local passe par un [[routeur]] ou une [[box]]. Côté Internet, celle-ci a une adresse **publique**, unique au monde, attribuée par le **fournisseur d’accès à Internet** (FAI : l’opérateur auquel on paie l’abonnement). Tous les appareils de la maison sortent sur Internet avec cette adresse publique.`,
    remember: [
      'Adresse privée (192.168.…, 10.…) : dans le réseau local seulement.',
      'Adresse publique : unique sur Internet, fournie par le FAI.',
      'La box ou le routeur fait le lien entre les deux.',
    ],
    example:
      'À la maison, l’ordinateur a l’adresse privée 192.168.1.12 ; la box a l’adresse publique 82.64.12.34, donnée par l’opérateur.',
    inApp:
      'Sélectionnez une box : sa prise « Internet » se règle à part, avec une adresse publique ; ses prises « maison » utilisent des adresses privées.',
    mistakes: [
      {
        belief: 'mon ordinateur a sa propre adresse sur Internet.',
        truth:
          'il a une adresse privée, valable chez toi seulement. Sur Internet, c’est l’adresse publique de la box qui apparaît.',
      },
      {
        belief: 'deux maisons ne peuvent pas utiliser la même adresse 192.168.1.10.',
        truth:
          'elles le peuvent : ce sont des adresses privées, qui ne servent que dans chaque réseau local.',
      },
    ],
    related: ['adresse-ip', 'box', 'reseau-local-internet', 'dhcp'],
  },
  {
    id: 'depannage',
    title: 'Dépanner un réseau',
    aliases: ['dépannage', 'panne', 'doublon', 'adresse en double', 'ipconfig', 'faute de frappe'],
    level: '4e',
    category: 'adressage',
    short:
      'Pour dépanner, on vérifie dans l’ordre : le câblage, puis les adresses, puis le masque, en testant avec ping.',
    body: `Quand deux équipements ne communiquent pas, on cherche **méthodiquement**, du plus simple au plus subtil :

- **1. Le câblage** : chaque équipement est-il relié (câble branché, bon réseau Wi-Fi) ?
- **2. Les adresses** : chacun a-t-il une [[adresse-ip|adresse IP]] ? Est-elle dans le **bon réseau** ? N’est-elle pas déjà prise par un autre (**doublon**) ? Pas de **faute de frappe** (\`192.168.11.5\` au lieu de \`192.168.10.5\`) ?
- **3. Le masque** : est-il le même que celui des autres équipements du réseau ?

À chaque étape, on corrige **une seule chose**, puis on teste de nouveau avec [[ping]]. La commande \`ipconfig\` affiche l’adresse et le masque réellement utilisés par un poste.`,
    remember: [
      'Ordre : câblage → adresse (doublon, mauvais réseau, faute de frappe) → masque.',
      'Une correction à la fois, puis un nouveau test (ping).',
      'ipconfig montre l’adresse et le masque d’un poste.',
    ],
    example:
      'Poste 3 ne répond pas : il est bien relié, mais ipconfig montre 192.168.10.2, l’adresse de Poste 2. On lui donne une adresse libre (192.168.10.3) et le ping fonctionne.',
    inApp:
      'Le bouton [[ecran:verifier]] repère les câbles manquants, les adresses en double ou hors du réseau. Après un ping raté, « Pourquoi ça ne marche pas ? » montre où le message s’est arrêté.',
    mistakes: [
      {
        belief: 'quand rien ne marche, il faut tout changer d’un coup.',
        truth:
          'en changeant plusieurs réglages à la fois, on ne sait plus lequel était en cause. Une correction, un test.',
      },
      {
        belief: 'deux postes qui ont la même adresse peuvent quand même fonctionner tous les deux.',
        truth:
          'un message envoyé à cette adresse n’arrive qu’à l’un des deux, au hasard : l’adresse doit être unique dans le réseau.',
      },
    ],
    related: ['ping', 'adresse-ip', 'masque', 'guide-verifier'],
  },
  {
    id: 'donnees-objet',
    title: 'Les données d’un objet connecté',
    aliases: ['donnée', 'mesure', 'table de données', 'descripteur', 'unité', 'format', 'CSV', 'capteur'],
    level: '4e',
    category: 'materiel',
    short:
      'Un objet connecté transforme une grandeur physique en données, qu’il envoie sur le réseau sous forme de table.',
    body: `Le **capteur** d’un [[objet-connecte|objet connecté]] mesure une grandeur physique (température, humidité, lumière…) et la transforme en signal électrique. La **carte programmable** de l’objet convertit ce signal en **nombre**, l’accompagne de la date et de l’heure, puis l’envoie sur le réseau par sa carte réseau (câble ou [[wifi|Wi-Fi]]).

Les mesures s’accumulent dans une **table de données** : une ligne par mesure, une colonne par **descripteur**. Chaque descripteur a :

- un **nom** (Heure, Température, Humidité) ;
- un **type** : nombre entier, nombre décimal, texte, date et heure… ;
- une **unité** quand c’est une grandeur (°C, %).

On peut télécharger la table au format \`.csv\` (valeurs séparées par des virgules ou des points-virgules) pour la tracer dans un **tableur** et interpréter le comportement de l’objet : à quelle heure fait-il le plus chaud ?`,
    remember: [
      'Capteur → nombre → envoi sur le réseau → table de données.',
      'Une colonne = un descripteur, avec un type (entier, décimal, texte, date) et une unité.',
      'Une ligne = une mesure.',
    ],
    example:
      'Une station météo envoie toutes les heures : 10:00 ; 18,5 ; 62 — l’heure (date et heure), la température (décimal, °C) et l’humidité (entier, %).',
    inApp:
      'Un objet connecté sert une petite page web : tapez son adresse dans le navigateur d’un poste pour lire ses mesures.',
    mistakes: [
      {
        belief: 'le capteur envoie directement « il fait chaud ».',
        truth:
          'il ne fournit qu’un nombre ; c’est nous, ou un programme, qui l’interprétons à l’aide de l’unité et des autres mesures.',
      },
    ],
    related: ['objet-connecte', 'usage-raisonne', 'client-serveur'],
  },
  {
    id: 'usage-raisonne',
    title: 'Usage raisonné des objets communicants',
    aliases: [
      'cookie',
      'témoin de connexion',
      'géolocalisation',
      'identité numérique',
      'données personnelles',
      'traces',
    ],
    level: '4e',
    category: 'securite',
    short:
      'Sites, applications et objets connectés collectent des données sur nous : cookies, position, habitudes. Il faut savoir les maîtriser.',
    body: `Ce que nous faisons en ligne laisse des **traces** qui, mises ensemble, forment notre **identité numérique** : publications, photos, comptes, mais aussi données collectées sans qu’on le voie.

- Un **cookie** (témoin de connexion) est un petit fichier qu’un site enregistre dans le navigateur. Il peut être utile (rester connecté, garder un panier) ou servir à **suivre** nos visites pour la publicité. On peut les refuser ou les effacer.
- La **géolocalisation** permet à une application de connaître notre position. Pratique pour un itinéraire, elle révèle aussi où l’on vit et où l’on va : on ne l’autorise qu’aux applications qui en ont besoin, et seulement pendant leur utilisation.
- Les **objets connectés** (montre, enceinte, caméra, station météo…) envoient leurs données à des serveurs, parfois à l’autre bout du monde : nos pas, notre sommeil, notre présence à la maison.

En France, la loi (RGPD) oblige à demander notre accord et permet de demander l’effacement de ses données.`,
    remember: [
      'Cookie : petit fichier déposé par un site ; on peut le refuser ou l’effacer.',
      'Géolocalisation : à n’autoriser qu’aux applications qui en ont besoin.',
      'Un objet connecté envoie des données sur nous : savoir lesquelles et à qui.',
      'Mes traces en ligne forment mon identité numérique.',
    ],
    example:
      'Une station météo qui mesure la température d’une chambre heure par heure révèle aussi quand la chambre est occupée.',
    mistakes: [
      {
        belief: 'refuser les cookies empêche d’aller sur le site.',
        truth:
          'la plupart des sites restent utilisables : seuls les cookies nécessaires à leur fonctionnement sont indispensables.',
      },
      {
        belief: 'si je ne publie rien, je n’ai pas d’identité numérique.',
        truth: 'les cookies, la position et les objets connectés laissent des traces même sans rien publier.',
      },
    ],
    related: ['securite-numerique', 'donnees-objet', 'objet-connecte'],
  },
  {
    id: 'routeur',
    title: 'Routeur',
    aliases: ['routeur', 'interface'],
    level: '3e',
    category: 'materiel',
    short: 'Un routeur relie plusieurs réseaux et fait passer les messages de l’un à l’autre.',
    body: `Le [[switch]] relie des équipements **dans** un réseau ; le routeur relie des **réseaux** entre eux. Il a plusieurs **interfaces** : chacune est branchée à un réseau différent et porte une [[adresse-ip|adresse IP]] de ce réseau.

Quand un message arrive, le routeur lit l’adresse de destination et consulte sa [[table-de-routage|table de routage]] pour choisir par quelle interface le faire repartir. Les équipements d’un réseau utilisent l’adresse de l’interface du routeur comme [[passerelle]].`,
    remember: [
      'Un routeur relie des réseaux différents.',
      'Chaque interface a une adresse dans le réseau auquel elle est reliée.',
    ],
    inApp:
      'Posez un routeur entre deux switchs, donnez une adresse à chacune de ses interfaces (eth0, eth1), puis indiquez ces adresses comme passerelle des postes.',
    mistakes: [
      {
        belief: 'un routeur a une seule adresse IP.',
        truth: 'il a une adresse dans chaque réseau auquel il est relié : une par interface.',
      },
      {
        belief: 'routeur et box, c’est la même chose.',
        truth:
          'la [[box]] contient un routeur, mais aussi un switch, un point d’accès Wi-Fi et un serveur DHCP.',
      },
    ],
    related: ['passerelle', 'table-de-routage', 'switch', 'reseau-local-internet'],
  },
  {
    id: 'passerelle',
    title: 'Passerelle',
    aliases: ['passerelle par défaut', 'gateway'],
    level: '3e',
    category: 'adressage',
    short:
      'La passerelle est l’adresse du routeur auquel un équipement confie les messages destinés aux autres réseaux.',
    body: `Avant d’envoyer un message, un équipement compare l’adresse de destination à la sienne, à l’aide du [[masque]]. Si le destinataire est dans son réseau, il le lui envoie directement. Sinon, il l’envoie à sa **passerelle**, qui se charge de le faire suivre.

La passerelle est donc l’adresse de l’interface du [[routeur]] qui se trouve **dans le même réseau** que l’équipement. Sans passerelle, un équipement ne peut communiquer qu’avec ceux de son propre réseau.

[[schema:passerelle]]`,
    remember: [
      'Passerelle = adresse du routeur, dans le réseau de l’équipement.',
      'Sans passerelle, pas de communication avec les autres réseaux.',
      'La réponse aussi a besoin d’une passerelle : celle du destinataire.',
    ],
    example:
      'Poste 192.168.1.10, routeur 192.168.1.1 sur ce réseau : la passerelle du poste est 192.168.1.1.',
    inApp: 'Champ « Passerelle » dans la configuration IP d’un poste. La commande ipconfig l’affiche.',
    mistakes: [
      {
        belief: 'la passerelle est l’adresse de la destination, ou du serveur que l’on veut joindre.',
        truth:
          'c’est l’adresse du [[routeur]] **dans le réseau de l’équipement** : elle a donc la même partie réseau que son adresse IP.',
      },
      {
        belief: 'il faut une passerelle pour parler à un voisin du même réseau.',
        truth:
          'dans le même réseau, la communication est directe. La passerelle ne sert que pour sortir du réseau.',
      },
    ],
    related: ['routeur', 'masque', 'table-de-routage'],
  },
  {
    id: 'table-de-routage',
    title: 'Table de routage et routage',
    aliases: ['routage', 'route', 'table de routage', 'RIP'],
    level: '3e',
    category: 'protocoles',
    short: 'La table de routage indique, pour chaque réseau de destination, par où envoyer un message.',
    body: `Le **routage** consiste à choisir le chemin d’un message à travers les réseaux. Chaque [[routeur]] décide seulement de l’étape suivante, grâce à sa table de routage : une liste de lignes « pour aller vers tel réseau, passer par telle interface, ou par tel autre routeur ».

Un routeur connaît d’office les réseaux reliés à ses interfaces. Pour les autres, il faut lui ajouter des **routes** : à la main (routes statiques), ou en laissant les routeurs s’échanger leurs tables par un protocole de routage (RIP, par exemple).

Si un routeur ne trouve aucune ligne pour la destination, il abandonne le message et prévient l’émetteur.`,
    remember: [
      'Chaque routeur choisit l’étape suivante en lisant sa table de routage.',
      'Il faut un chemin à l’aller et un chemin au retour.',
    ],
    inApp:
      'Onglet « Routage » d’un routeur en Conception ; en simulation, cliquez sur un routeur pour voir sa table. Sur un poste : commande route.',
    related: ['routeur', 'passerelle', 'chemin-internet', 'ttl'],
  },
  {
    id: 'trame-paquet',
    title: 'Trame et paquet',
    aliases: ['trame', 'paquet', 'encapsulation'],
    level: '3e',
    category: 'protocoles',
    short:
      'Les données voyagent découpées en paquets, eux-mêmes transportés dans des trames d’un équipement au suivant.',
    body: `Un **paquet** est un message muni des [[adresse-ip|adresses IP]] de l’émetteur et du destinataire final. Il garde ces adresses pendant tout son voyage, d’un bout à l’autre.

Pour franchir chaque liaison, le paquet est placé dans une **trame**, qui porte les [[adresse-mac|adresses MAC]] des deux équipements voisins. À chaque [[routeur]], la trame est ouverte, le paquet en est sorti puis replacé dans une nouvelle trame pour l’étape suivante : comme une lettre qui change de sac postal à chaque centre de tri.`,
    remember: [
      'Paquet : adresses IP, de l’émetteur au destinataire final.',
      'Trame : adresses MAC, d’un équipement à son voisin.',
    ],
    inApp:
      'Dans « Échanges de données », cliquez sur une trame : la couche Liaison montre les adresses MAC, la couche Réseau les adresses IP.',
    related: ['couches', 'adresse-mac', 'adresse-ip', 'protocole'],
  },
  {
    id: 'protocole',
    title: 'Protocole',
    aliases: ['protocole', 'règles de communication'],
    level: '3e',
    category: 'protocoles',
    short: 'Un protocole est un ensemble de règles que deux équipements suivent pour se comprendre.',
    body: `Pour communiquer, il ne suffit pas d’être reliés : il faut parler de la même façon. Un protocole fixe la forme des messages, leur ordre et ce qu’il faut faire en cas de problème, comme les règles de politesse d’une conversation téléphonique.

Chaque protocole a un rôle précis : IP achemine les [[trame-paquet|paquets]] d’un réseau à l’autre, TCP vérifie que rien ne s’est perdu, [[web-http|HTTP]] sert à demander une page web, [[dns|DNS]] à traduire un nom en adresse… Ils travaillent ensemble, répartis en [[couches]].`,
    remember: [
      'Un protocole = des règles communes pour communiquer.',
      'Chaque protocole a un rôle ; ils se complètent.',
    ],
    inApp: 'Sur le plan, chaque trame porte le nom de son protocole ; la légende rappelle le rôle de chacun.',
    related: ['couches', 'trame-paquet', 'ping'],
  },
  {
    id: 'couches',
    title: 'Les couches : qui fait quoi',
    aliases: ['couche', 'liaison', 'transport', 'application', 'modèle en couches', 'TCP', 'UDP'],
    level: '3e',
    category: 'protocoles',
    short: 'Les protocoles sont rangés en couches : chacune rend un service à celle du dessus.',
    body: `Un message est préparé par étapes, comme un colis que l’on emballe plusieurs fois :

- **Application** : ce que veut faire le logiciel (demander une page web, envoyer un courriel).
- **Transport** : à quel logiciel remettre le message, grâce à un numéro de **port** ; TCP vérifie aussi que tout est arrivé.
- **Réseau** : de quel équipement à quel équipement, grâce aux adresses IP.
- **Liaison** : d’un équipement à son voisin, grâce aux adresses MAC.

[[schema:couches]]

À l’arrivée, les emballages sont retirés dans l’ordre inverse.`,
    remember: [
      'Quatre couches : Application, Transport, Réseau, Liaison.',
      'Chaque couche ajoute ses informations autour du message.',
    ],
    inApp:
      'Le détail d’une trame, dans « Échanges de données », est présenté couche par couche, avec une couleur pour chacune.',
    related: ['trame-paquet', 'protocole'],
  },
  {
    id: 'arp',
    title: 'ARP : trouver l’adresse MAC',
    aliases: ['ARP', 'table ARP'],
    level: '3e',
    category: 'protocoles',
    short:
      'ARP permet à un équipement de trouver l’adresse MAC qui correspond à une adresse IP de son réseau.',
    body: `Pour envoyer une [[trame-paquet|trame]] à un voisin, il faut son [[adresse-mac|adresse MAC]]. Or on ne connaît en général que son adresse IP. L’équipement envoie donc à **tout** le réseau une question : « qui a l’adresse 192.168.1.20 ? ». Celui qui la porte répond en donnant son adresse MAC ; les autres ignorent la question.

La réponse est gardée en mémoire dans la **table ARP**, pour ne pas reposer la question à chaque message. Si personne ne répond, c’est qu’aucun équipement du réseau n’a cette adresse.

[[schema:arp]]`,
    remember: [
      'ARP : « qui a cette adresse IP ? » → adresse MAC.',
      'La question est diffusée à tout le réseau local ; elle ne traverse pas les routeurs.',
    ],
    inApp:
      'Le premier ping entre deux postes commence par deux trames ARP. Commande arp, ou « Afficher les tables », pour voir la table ARP.',
    mistakes: [
      {
        belief: 'ARP sert à trouver l’adresse IP d’un équipement.',
        truth:
          'l’adresse IP est déjà connue : ARP trouve l’adresse MAC qui lui correspond, dans le réseau local.',
      },
      {
        belief: 'une demande ARP traverse les routeurs.',
        truth:
          'elle reste dans le réseau local. Pour une destination dans un autre réseau, l’ordinateur demande l’adresse MAC de sa [[passerelle]].',
      },
    ],
    related: ['adresse-mac', 'adresse-ip', 'trame-paquet'],
  },
  {
    id: 'dns',
    title: 'DNS : du nom à l’adresse',
    aliases: ['DNS', 'nom de domaine', 'serveur DNS'],
    level: '3e',
    category: 'services',
    short: 'Le DNS est l’annuaire d’Internet : il traduit un nom, comme www.college.fr, en adresse IP.',
    body: `Les équipements se joignent par leur [[adresse-ip|adresse IP]], mais nous retenons mieux des noms. Quand on tape un nom, l’ordinateur demande d’abord à un **serveur DNS** : « quelle est l’adresse de www.college.fr ? ». Avec la réponse, il peut contacter le bon serveur.

Chaque équipement doit donc connaître l’adresse de son serveur DNS. S’il n’en a pas, ou si le serveur ne connaît pas le nom, on ne peut joindre les autres que par leur adresse IP.

[[schema:dns]]`,
    remember: ['DNS : nom → adresse IP.', 'Sans serveur DNS, seules les adresses IP fonctionnent.'],
    inApp:
      'Champ « Serveur DNS » d’un poste. Le logiciel « Serveur DNS » contient la liste des noms. Commande nslookup pour l’interroger.',
    mistakes: [
      {
        belief: 'sans DNS, plus aucun échange n’est possible.',
        truth:
          'les échanges se font toujours avec des adresses IP. Sans DNS, on peut encore joindre un serveur par son adresse IP, mais plus par son nom.',
      },
      {
        belief: 'le serveur DNS envoie la page web demandée.',
        truth: 'il donne seulement l’adresse IP du serveur ; la page vient ensuite du serveur web.',
      },
    ],
    related: ['adresse-ip', 'client-serveur', 'web-http'],
  },
  {
    id: 'web-http',
    title: 'Web : navigateur, serveur web, HTTP',
    aliases: ['HTTP', 'web', 'navigateur', 'serveur web', 'page web', 'URL'],
    level: '3e',
    category: 'services',
    short: 'Le navigateur demande une page à un serveur web en suivant le protocole HTTP.',
    body: `Afficher une page web prend plusieurs étapes. Le navigateur demande au [[dns|DNS]] l’adresse du serveur. Il ouvre une connexion avec ce serveur (protocole TCP). Il envoie sa demande : « donne-moi cette page » (protocole **HTTP**). Le serveur répond en envoyant la page, que le navigateur affiche.

Le web n’est qu’un des services d’Internet, comme la [[messagerie]]. Avec HTTP, la page circule en clair : quiconque capte les échanges peut la lire. HTTPS, sa version sécurisée, la chiffre.`,
    remember: [
      'Le navigateur est le client, le serveur web possède les pages.',
      'HTTP est le protocole du web.',
    ],
    inApp:
      'Installez « Serveur web » sur un poste et démarrez-le, puis ouvrez le navigateur d’un autre poste. Dans les échanges de données, le texte de la page est lisible.',
    related: ['client-serveur', 'dns', 'protocole', 'pare-feu'],
  },
  {
    id: 'messagerie',
    title: 'Messagerie électronique',
    aliases: ['courriel', 'e-mail', 'mail', 'SMTP', 'POP3', 'serveur de messagerie'],
    level: '3e',
    category: 'services',
    short:
      'Un courriel est déposé sur le serveur de messagerie du destinataire, qui vient ensuite le relever.',
    body: `Une adresse comme \`eleve1@college.fr\` désigne une boîte aux lettres (\`eleve1\`) sur le serveur de messagerie d’un domaine (\`college.fr\`).

Pour **envoyer**, le logiciel de messagerie remet le message à un serveur (protocole SMTP), qui le fait suivre jusqu’au serveur du destinataire. Le message y attend dans la boîte. Pour **lire**, le destinataire se connecte à son serveur et relève son courrier (protocole POP3). Les deux personnes n’ont donc pas besoin d’être connectées en même temps.`,
    remember: [
      'Envoyer : SMTP. Relever son courrier : POP3.',
      'Le message attend sur le serveur du destinataire.',
    ],
    inApp:
      'Dans le réseau d’exemple, les postes ont une messagerie configurée : envoyez un message de Poste 1 à eleve2@college.fr.',
    related: ['client-serveur', 'dns', 'protocole'],
  },
  {
    id: 'ttl',
    title: 'Durée de vie (TTL) et traceroute',
    aliases: ['TTL', 'durée de vie', 'traceroute', 'tracert'],
    level: '3e',
    category: 'protocoles',
    short:
      'Le TTL est un compteur qui empêche un paquet de tourner sans fin ; traceroute s’en sert pour montrer le chemin suivi.',
    body: `Chaque [[trame-paquet|paquet]] part avec un compteur, le **TTL** (64 par exemple). Chaque [[routeur]] traversé lui retire 1. S’il arrive à 0, le routeur détruit le paquet et prévient l’émetteur. Un paquet ne peut donc pas tourner indéfiniment si les [[table-de-routage|tables de routage]] sont mal réglées.

La commande \`traceroute\` utilise cette règle : elle envoie des paquets avec un TTL de 1, puis 2, puis 3… Chaque routeur qui en détruit un se fait ainsi connaître, et l’on découvre un à un les routeurs du chemin.`,
    remember: [
      'Chaque routeur traversé retire 1 au TTL.',
      'traceroute affiche les routeurs traversés jusqu’à une destination.',
    ],
    inApp:
      'Commande traceroute dans la ligne de commande ; le TTL est visible dans la couche Réseau d’une trame.',
    related: ['table-de-routage', 'routeur', 'ping'],
  },
  {
    id: 'pare-feu',
    title: 'Pare-feu',
    aliases: ['pare-feu', 'firewall', 'filtrage', 'sécurité'],
    level: '3e',
    category: 'securite',
    short: 'Un pare-feu filtre les échanges : il ne laisse passer que ce que ses règles autorisent.',
    body: `Un pare-feu examine chaque message et applique ses **règles**, dans l’ordre : d’où il vient, où il va, quel [[protocole]] et quel service il vise. Il protège un ordinateur, ou tout un réseau quand il est placé sur le [[routeur]] qui le relie à l’extérieur.

Un pare-feu activé sans aucune règle bloque toutes les nouvelles demandes venues de l’extérieur. Les réponses à ce que l’on a soi-même demandé passent toujours. On ajoute ensuite une règle pour chaque service que l’on veut rendre accessible : c’est le principe de sécurité « tout est interdit, sauf ce qui est autorisé ».`,
    remember: [
      'Un pare-feu applique des règles : autoriser ou bloquer.',
      'Tout ce qui n’est pas autorisé est bloqué.',
    ],
    inApp:
      'Onglet « Pare-feu » d’un routeur, ou logiciel « Pare-feu » sur un poste. Un message bloqué est signalé sur le plan.',
    mistakes: [
      {
        belief: 'un pare-feu protège contre les virus.',
        truth:
          'il filtre les échanges selon ses règles (adresses, ports) ; il ne regarde pas si un fichier contient un virus. C’est le rôle d’un antivirus.',
      },
    ],
    related: ['routeur', 'protocole', 'web-http'],
  },
  {
    id: 'chemin-internet',
    title: 'Le chemin d’une information sur Internet',
    aliases: ['circulation de l’information', 'acheminement', 'chemin'],
    level: '3e',
    category: 'protocoles',
    short:
      'Sur Internet, une information voyage de réseau en réseau : chaque routeur la rapproche de sa destination.',
    body: `Quand vous consultez un site, la demande quitte votre appareil, traverse le réseau local jusqu’à la [[box]] (votre [[passerelle]]), puis passe de [[routeur]] en routeur à travers les réseaux des opérateurs, jusqu’au réseau où se trouve le serveur. La réponse fait le chemin inverse, pas forcément par les mêmes routeurs.

Aucun équipement ne connaît le chemin complet : chaque routeur ne décide que de l’étape suivante, d’après sa [[table-de-routage|table de routage]]. C’est ce qui rend Internet solide : si une liaison tombe en panne, les routeurs peuvent choisir un autre chemin.

[[schema:chemin-internet]]`,
    remember: [
      'Une information va de routeur en routeur, étape par étape.',
      'L’aller et le retour sont deux voyages distincts.',
    ],
    inApp:
      'Dans le réseau d’exemple, lancez traceroute www.college.fr depuis Poste 1, ou « Tester une communication » : le trajet de la demande est affiché.',
    related: ['routeur', 'table-de-routage', 'passerelle', 'ttl', 'reseau-local-internet'],
  },
];

export const DEFAULT_PACK: Pack = {
  notions: [...GUIDES, ...NOTIONS],
  questions: DEFAULT_QUESTIONS,
  messages: {},
};
