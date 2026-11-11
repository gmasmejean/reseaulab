# RéseauLab

Simulateur de réseaux informatiques pour l'enseignement, qui fonctionne
entièrement dans le navigateur : **aucune installation, aucun serveur, aucune
connexion Internet**. On construit un réseau (ordinateurs, serveurs,
imprimantes, objets connectés, smartphones, switchs, routeurs, câbles), on le
configure, puis on passe en mode simulation pour l'utiliser et
observer les échanges de données couche par couche.

## Utilisation au collège

1. Récupérer le fichier unique `dist/index.html` (voir « Construire » plus bas,
   ou demander le fichier déjà construit).
2. Le déposer sur l'ENT, une clé USB ou un dossier partagé.
3. Les élèves l'ouvrent par un double-clic : il s'ouvre dans le navigateur
   (Firefox, Chrome, Edge…). Tout fonctionne hors ligne.

**Vos projets Filius** (`.fls`) s'ouvrent directement avec **Ouvrir…** :
équipements, adresses, routes, pare-feu, DHCP, DNS, pages web, câbles et
annotations (textes, zones colorées) sont repris. Ce qui ne peut pas l'être
(modem, logiciel pair à pair…) est listé dans un rapport à l'ouverture.

Le travail en cours est sauvegardé automatiquement dans le navigateur du poste.
À l'ouverture, RéseauLab signale le travail retrouvé (avec sa date) et propose
de le continuer ou de repartir de zéro : sur un poste partagé, c'est peut-être
celui de l'élève précédent. Pour garder ou rendre son travail, l'élève utilise
**Enregistrer**, donne un nom au fichier (son nom, celui de l'activité) et
obtient un fichier `.reseaulab.json` dans les téléchargements, qu'on rouvre
ensuite avec **Ouvrir…**.

## Prise en main

- **Mode conception** : cliquer (ou glisser) un équipement de la palette pour
  l'ajouter ; choisir l'outil **Câble** puis cliquer sur deux équipements pour
  les relier ; sélectionner un équipement pour le configurer dans le panneau du
  bas (adresse IP, masque, passerelle, DNS, DHCP, interfaces et routes du
  routeur, pare-feu). Une valeur tapée est prise en compte dès qu'on quitte le
  champ (Entrée, Tab ou clic ailleurs) ; le masque `255.255.255.0` est proposé
  avec la première adresse. Un routeur a de 2 à 8 interfaces, que l'on ajoute ou
  retire dans son onglet « Interfaces ». Les outils **Texte** et **Zone** ajoutent des annotations
  sur le plan. Touche Suppr pour effacer la sélection ; **Ctrl+Z** annule,
  **Ctrl+Y** rétablit (50 étapes). Le plan s'ajuste à l'écran ; les boutons
  − / + / **Ajuster** en bas à droite et **Ctrl + molette** changent le zoom.
- **Terminaux** : ordinateur, portable, serveur, imprimante, objet connecté,
  smartphone et tablette se configurent de la même façon. L'imprimante et
  l'objet connecté affichent leur état sur une page web (tapez leur adresse
  dans le navigateur d'un poste) ; le smartphone et la tablette sont en
  Wi-Fi.
- **Box Internet** : un seul équipement qui fait routeur, switch, point
  d'accès Wi-Fi et serveur DHCP, comme à la maison. Elle est déjà réglée
  (adresse `192.168.1.1`, Wi-Fi « Box-1 ») : reliez-y un terminal par câble
  ou en Wi-Fi, cochez sa **Configuration automatique (DHCP)**, et il reçoit
  son adresse au lancement de la simulation. Sa **prise Internet** se relie
  à un routeur et se règle dans « Côté Internet ». Simplification : la box ne
  traduit pas les adresses (pas de NAT) ; pour sortir vers Internet, le
  routeur d'en face doit avoir une route vers le réseau de la maison (ou RIP
  coché des deux côtés).
- **Wi-Fi**, comme dans Filius : la box et chaque switch sont aussi des
  points d'accès avec un **nom Wi-Fi (SSID)** modifiable. Un terminal réglé
  en **Sans fil (Wi-Fi)** les rejoint en choisissant ce nom dans sa
  configuration (ou avec l'outil Câble). La connexion est dessinée en
  pointillés et `ipconfig` indique le réseau rejoint.
- **Clic droit**, comme dans Filius : sur un équipement (Configurer, Supprimer
  le câble / tous les câbles, Supprimer), un câble (Supprimer le câble), un
  texte (taille, style, couleur) ou une zone (couleur). En simulation : Afficher
  le bureau et les échanges de données de chaque interface. Au clavier : touche
  Menu ou Maj+F10.
- **Mode simulation** : cliquer sur un ordinateur ouvre son bureau. On y
  installe et lance des logiciels. Les fenêtres s'ouvrent du côté opposé à
  l'équipement pour le laisser visible ; **Échap** ferme celle du dessus,
  **Ranger les fenêtres** et **Tout fermer** sont dans la barre du bas. Les paquets sont animés sur les câbles, au
  ralenti pour qu'on puisse les suivre (0,4 s par câble à la vitesse par
  défaut) ; entre deux envois, le temps s'écoule normalement. Le
  curseur **Vitesse** règle ce ralenti. Chaque trame porte le nom de son
  protocole ; la **légende**, en bas à gauche du plan, explique les couleurs.
  **Pause** puis **Trame suivante** font avancer les trames câble par câble.
  Quand un équipement abandonne un paquet, la raison s'affiche un moment à
  côté de lui. La case **Masquer le trafic automatique** (près de la légende)
  cache les échanges que les équipements font seuls (adresses DHCP, routes
  RIP) : ils ne sont plus animés ni ralentis, mais restent listés dans les
  échanges de données.
- **Exemple** : charge un réseau de collège complet (salle élèves en DHCP,
  routeur, serveurs DNS, web et messagerie) pour une démonstration immédiate.

### Logiciels disponibles sur les postes

| Clients                               | Serveurs              |
| ------------------------------------- | --------------------- |
| Ligne de commande                     | Serveur web           |
| Navigateur web                        | Serveur DNS           |
| Messagerie (SMTP/POP3)                | Serveur DHCP          |
| Client écho                           | Serveur de messagerie |
| Éditeur de texte, explorateur, images | Serveur écho          |
| Pare-feu du poste                     |                       |

Commandes du terminal : `ipconfig` (`/renew`), `ping`, `traceroute`, `arp`,
`route`, `netstat`, `nslookup`, `hostname`, `ls`, `cd`, `pwd`, `cat`, `mkdir`,
`rm`, `touch`, `echo`, `clear`, `help`.

### Aide et connaissances

Le bouton **Aide** (ou la touche **F1**, qui ouvre la fiche de l'équipement
sélectionné) ouvre la prise en main de RéseauLab et les **fiches de
connaissances** : une trentaine de notions (adresse IP, masque, passerelle,
switch, routeur, DNS, DHCP…), chacune avec une définition courte, ce qu'il
faut retenir, une explication, souvent un schéma, un exemple, les erreurs
fréquentes et où l'observer dans RéseauLab. Les fiches de prise en main
montrent les boutons dont elles parlent : un clic les fait clignoter à
l'écran.

L'accueil de l'aide propose **Premiers pas** et un parcours par niveau
(5e, 4e, 3e) avec les fiches déjà lues ; « Fiche suivante » suit le
parcours. On peut aussi chercher un mot (dans tout le texte des fiches),
filtrer par niveau ou parcourir le lexique. Une fiche, ou tout un parcours,
s'imprime pour le cahier. Dans les panneaux de configuration, un **?** à
côté d'un champ rappelle sa définition et mène à la fiche ; le clic droit
sur un équipement propose « Qu'est-ce que c'est ? » ; les explications du
diagnostic renvoient aussi à la fiche concernée.

Sous chaque fiche, **Pour vérifier** pose une question corrigée sur place.
**Quiz d'entraînement** pose huit questions du niveau (choix, liste à
ordonner, réponse courte, « même réseau ? » avec des adresses tirées au
hasard). Chaque réponse est corrigée tout de suite avec une explication ; le
bilan indique, notion par notion, ce qui est acquis et ce qui est à revoir,
avec un lien vers la fiche. Rien n'est noté ; les scores apparaissent sur le
compte rendu.

Le contenu fourni est une proposition : le découpage par niveau, les textes
et les questions sont à adapter à votre progression (voir « Pack
pédagogique » plus bas).

### Activités guidées

Le bouton **Activités** propose cinq activités prêtes à l'emploi : « Mon
premier réseau », « Ajouter un objet connecté » et « Le réseau de la maison »
(4e), « Relier deux réseaux » et « Dépannage : le site du collège ne
s'affiche plus » (3e).
Chacune ouvre un réseau de départ et un **panneau d'activité** à droite du
plan : la consigne, des étapes, et des objectifs qui **se cochent tout seuls**
quand ils sont atteints. Certains se lisent sur le plan (équipements reliés,
adresse dans le bon réseau, plus rien à signaler) ; d'autres — une
communication, une page web — sont testés sur une copie du réseau par le
bouton **Vérifier mon travail**. Chaque étape propose des indices, donnés un
par un, et renvoie aux fiches de connaissances.

Une étape peut aussi poser des **questions** dans le panneau : choix simple ou
multiple, liste à remettre dans l'ordre, réponse courte, « ces deux adresses
sont-elles dans le même réseau ? » ou réponse libre. L'élève répond **une
fois** : la correction s'affiche aussitôt (réponse attendue, explication,
fiche à relire) et la réponse est gardée. Une réponse libre n'est pas
corrigée : elle est recopiée sur le compte rendu. Les étapes peuvent être
groupées en **parties**, et les dernières marquées **bonus** : elles ne
comptent pas pour finir l'activité et s'ouvrent ensuite.

L'élève rend son travail avec **Enregistrer** : le fichier contient le réseau,
l'activité et ce qui a été réussi. Il se rouvre avec **Ouvrir…**, comme tout
fichier d'activité que vous distribuez.

### Créer ses propres activités

**Activités → Créer une activité** (ou Réglages) :

1. Construisez sur le plan le réseau **terminé**, tel qu'un élève doit
   l'obtenir.
2. Donnez un titre, un niveau, une consigne ; ajoutez des étapes avec leurs
   consignes, leurs indices (un par ligne) et les fiches à lire.
3. Pour chaque étape, **choisissez parmi les objectifs proposés** : RéseauLab
   liste ce que votre réseau atteint (adresses, liens, passerelles,
   communications…). Chaque phrase se reformule.
4. Choisissez le **réseau de départ** : le même sans les adresses, un plan
   vide, ou le réseau tel quel (pour un dépannage : cassez-le d'abord).
5. **Contrôler l'activité** vérifie que votre solution atteint tous les
   objectifs et qu'aucun n'est déjà atteint au départ.
6. **Enregistrer le fichier d'activité** : le fichier à distribuer (ENT, clé
   USB). Il ne contient pas la solution. Les élèves l'ouvrent avec
   **Ouvrir…** et vous rendent le fichier qu'ils enregistrent.

Un élève qui ouvre le fichier dans un éditeur de texte peut lire les
objectifs, pas la solution. Ce qui prouve le travail est le réseau rendu.

Les questions, les parties et les étapes bonus ne se créent pas encore dans
cette fenêtre : elles s'écrivent dans le fichier d'activité (JSON), validé à
l'ouverture. Un objectif « question » :

```json
{
  "id": "role-switch",
  "label": "Rôle du switch",
  "check": {
    "type": "question",
    "question": {
      "type": "mcq",
      "prompt": "Quel équipement relie les terminaux d'un même réseau ?",
      "choices": ["Le switch", "Le serveur", "L'imprimante"],
      "correct": [0],
      "explanation": "Le switch (commutateur) relie les terminaux.",
      "notion": "switch"
    }
  }
}
```

Autres types : `order` (`items` dans le bon ordre), `short` (`accepted` : les
réponses acceptées, sans tenir compte des accents ni des majuscules),
`same-network` et `open` (réponse libre). Une étape prend `"part": "Partie 1 —
…"` pour commencer une partie et `"bonus": true` pour être un bonus (les
étapes bonus viennent en dernier).

### Compte rendu

Le bouton **Compte rendu** produit un document à imprimer ou à enregistrer en
PDF : nom et classe de l'élève, plan du réseau, **table d'adressage** remplie
automatiquement, objectifs de l'activité atteints ou non (avec l'heure),
réponses aux questions (juste ou fausse, réponse attendue, réponses libres
recopiées, total par partie), indices demandés, commandes utilisées et quelques lignes « ce que j'ai
appris ». Il fonctionne aussi sans activité, pour garder une trace d'un
réseau construit librement.

### Niveau de la classe

Le bouton **Réglages** (⚙) limite RéseauLab au programme d'un niveau : **5e**
(composants d'un réseau local, web), **4e** (adresse IP et masque, DHCP,
`ping`, échanges de données), **3e** (routeur, passerelle, DNS, messagerie,
pare-feu) ou **Complet**. Ce qui dépasse le niveau disparaît de la palette,
des logiciels à installer, de la ligne de commande et des panneaux ; ce que
vous avez déjà placé dans un réseau distribué aux élèves reste visible et
fonctionne. Le choix est gardé sur le poste. La répartition est une
proposition, à ajuster à votre progression.

### Vérifier son réseau

Le bouton **Vérifier** repère les erreurs de configuration les plus courantes
(poste non relié, adresse manquante ou en double, passerelle absente ou mal
choisie, serveur non démarré…) : un « ! » marque l'équipement sur le plan et
son panneau indique quoi faire. La même fenêtre **teste une communication**
entre deux équipements sur une copie du réseau, sans lancer la simulation, et
explique un échec en langage simple (« Ordinateur 1 ne sait pas par où envoyer
vers 10.0.2.10 : il n'a pas de passerelle »), avec le trajet parcouru par la
demande. Après un `ping` raté, le terminal propose directement **Pourquoi ça
ne marche pas ?**.

### Observer les échanges

Le bouton **Échanges de données** d'un équipement liste les trames reçues et
envoyées (Ethernet, ARP, IP, ICMP, UDP, TCP, DHCP, DNS, HTTP, SMTP, POP3, RIP),
colorées par couche, avec le détail de chaque en-tête. On peut les filtrer par
protocole ; les trames arrivées sans être destinées à l'équipement (diffusions,
trames qu'un switch a envoyées partout) sont marquées « ignorée » et peuvent
être masquées. Pour un switch, la **table des adresses MAC** montre
l'apprentissage en direct ; pour un poste ou un routeur, **Afficher les
tables** montre la table de routage et la table ARP.

## Développement

Prérequis : Node.js 22 ou plus et pnpm 9.

```sh
pnpm install
pnpm run dev        # serveur de développement
pnpm run check      # typage + lint + format + tests unitaires
pnpm run coverage   # couverture du moteur (seuils imposés)
pnpm run e2e        # scénarios de bout en bout (Chrome installé requis)
pnpm run build      # produit le fichier unique dist/index.html
```

- Architecture, étapes, feuille de route et écarts : [`docs/PLAN.md`](docs/PLAN.md).
- Règles de développement suivies : [`docs/REGLES.md`](docs/REGLES.md).

En bref : `src/engine` contient le moteur de simulation (TypeScript pur,
déterministe, sans DOM, couvert à plus de 90 % par les tests) ; `src/project`
le format de fichier versionné et validé ; `src/learn` la logique pédagogique
(diagnostic, fiches de connaissances, profils par niveau, activités et leur
vérification), pure et testée comme le moteur ;
`src/ui` l'interface React.

### Pack pédagogique

Les fiches et les messages du diagnostic sont des données
(`src/learn/content/default-pack.ts`, `src/learn/diagnose/messages.fr.ts`).
Un fichier de pack au format `reseaulab-pack` peut remplacer ou ajouter des
fiches, en masquer, et reformuler des messages, sans toucher au code :

```json
{
  "format": "reseaulab-pack",
  "version": 1,
  "notions": [
    {
      "id": "passerelle",
      "title": "Passerelle",
      "level": "4e",
      "category": "adressage",
      "short": "La porte de sortie du réseau.",
      "body": "Texte libre, avec **gras**, *italique*, `code`, listes et liens [[routeur]].",
      "remember": ["Une phrase à retenir."],
      "mistakes": [
        {
          "belief": "la passerelle est l'adresse du serveur.",
          "truth": "c'est l'adresse du [[routeur]] dans mon réseau."
        }
      ],
      "related": ["routeur"],
      "curriculum": "Référence au programme, à votre convenance"
    }
  ],
  "hidden": ["box"],
  "messages": { "ip-missing": { "title": "{device} : adresse à compléter" } }
}
```

**Réglages → Pack pédagogique** exporte le contenu fourni (à modifier dans un
éditeur de texte), importe un pack sur le poste et permet de revenir au
contenu d'origine. Un fichier d'activité peut emporter votre pack : cochez
« Joindre mon pack pédagogique au fichier » en l'enregistrant.

Dans le texte, `[touche:Ctrl+Z]` dessine des touches du clavier et
`[[ecran:simulation]]` un élément de l'écran que l'élève peut faire
clignoter (liste dans `src/learn/content/screen.ts`). `mistakes` (facultatif)
affiche des « erreurs fréquentes » : « On croit que… » / « En fait, … ».

Une fiche dont l'identifiant existe déjà remplace celle fournie. Le pack peut
aussi contenir des questions de quiz (`questions`), par exemple :

```json
{
  "id": "passerelle-maison",
  "notion": "passerelle",
  "level": "3e",
  "type": "mcq",
  "prompt": "À la maison, quelle est la passerelle des appareils ?",
  "choices": ["La box", "Le téléphone", "L'imprimante"],
  "correct": [0],
  "explanation": "La box est le routeur de la maison."
}
```

Les autres types sont `order` (`items` dans le bon ordre), `short`
(`accepted` : réponses admises) et `same-network` (question calculée).

## Licence

GPL-3.0-or-later. RéseauLab est une réalisation originale, inspirée par les
logiciels pédagogiques de simulation de réseaux ; il n'en reprend ni le code
ni les ressources graphiques.
