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
- **Wi-Fi**, comme dans Filius : chaque switch est aussi un point d'accès avec
  un **nom Wi-Fi (SSID)** modifiable. Un ordinateur ou un portable réglé en
  **Sans fil (Wi-Fi)** rejoint un switch en choisissant ce nom dans sa
  configuration (ou avec l'outil Câble vers un switch). La connexion est
  dessinée en pointillés et `ipconfig` indique le réseau rejoint.
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

Le bouton **Aide** ouvre la prise en main de RéseauLab et les **fiches de
connaissances** : une trentaine de notions (adresse IP, masque, passerelle,
switch, routeur, DNS, DHCP…), chacune avec une définition courte, une
explication, un exemple, ce qu'il faut retenir et où l'observer dans
RéseauLab. On peut chercher un mot, filtrer par niveau (5e, 4e, 3e) ou
parcourir le lexique. Dans les panneaux de configuration, un **?** à côté
d'un champ rappelle sa définition et mène à la fiche ; les explications du
diagnostic renvoient aussi à la fiche concernée.

Le contenu fourni est une proposition : le découpage par niveau et les textes
sont à adapter à votre progression (voir « Pack pédagogique » plus bas).

### Activités guidées

Le bouton **Activités** propose quatre activités prêtes à l'emploi : « Mon
premier réseau » et « Ajouter un objet connecté » (4e), « Relier deux
réseaux » et « Dépannage : le site du collège ne s'affiche plus » (3e).
Chacune ouvre un réseau de départ et un **panneau d'activité** à droite du
plan : la consigne, des étapes, et des objectifs qui **se cochent tout seuls**
quand ils sont atteints. Certains se lisent sur le plan (équipements reliés,
adresse dans le bon réseau, plus rien à signaler) ; d'autres — une
communication, une page web — sont testés sur une copie du réseau par le
bouton **Vérifier mon travail**. Chaque étape propose des indices, donnés un
par un, et renvoie aux fiches de connaissances.

L'élève rend son travail avec **Enregistrer** : le fichier contient le réseau,
l'activité et ce qui a été réussi. Il se rouvre avec **Ouvrir…**, comme tout
fichier d'activité que vous distribuez.

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
      "related": ["routeur"],
      "curriculum": "Référence au programme, à votre convenance"
    }
  ],
  "hidden": ["box"],
  "messages": { "ip-missing": { "title": "{device} : adresse à compléter" } }
}
```

Une fiche dont l'identifiant existe déjà remplace celle fournie. L'import et
l'export depuis l'interface sont prévus (étape 28 du plan).

## Licence

GPL-3.0-or-later. RéseauLab est une réalisation originale, inspirée par les
logiciels pédagogiques de simulation de réseaux ; il n'en reprend ni le code
ni les ressources graphiques.
