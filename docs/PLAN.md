# RéseauLab — Plan de développement

Application web (100 % navigateur, sans installation ni serveur) permettant de
concevoir et simuler des réseaux informatiques en classe, avec les mêmes
fonctionnalités pédagogiques que le logiciel Filius.

## Objectifs

1. **Aucune installation** : l'application se construit en un seul fichier
   `dist/index.html` utilisable hors-ligne (clé USB, ENT, mail) et peut aussi
   être hébergée comme site statique.
2. **Fidélité pédagogique** : les protocoles simulés (Ethernet, ARP, IPv4,
   ICMP, UDP, TCP, DHCP, DNS, HTTP, SMTP, POP3, RIP) suivent leur
   fonctionnement réel, simplifié mais jamais faux.
3. **Qualité** : moteur de simulation pur TypeScript, déterministe et
   couvert par des tests ; interface React testée.

## Architecture

```
src/
  engine/            Moteur de simulation (aucune dépendance à React/DOM)
    core/            Adresses IPv4/MAC, ordonnanceur à temps virtuel, événements
    net/             Trames, paquets, câbles, interfaces, capture des échanges
    devices/         Ordinateur, portable, switch, routeur
    stack/           ARP, IPv4 + routage, ICMP, UDP, TCP, pare-feu
    services/        DHCP, DNS, HTTP, SMTP/POP3, écho, RIP
    fs/              Système de fichiers virtuel de chaque poste
    terminal/        Interpréteur de commandes (ipconfig, ping, arp, route…)
    network.ts       Façade : topologie + simulation + (dé)sérialisation
  project/           Format de fichier projet (JSON versionné, validé par zod)
  ui/                Interface React (conception, simulation, fenêtres d'applis)
  i18n/              Textes de l'interface (français)
tests/e2e/           Tests de bout en bout (Playwright)
```

Principes clés :

- Le **temps est virtuel** : un ordonnanceur à événements discrets fait
  avancer la simulation. Les tests l'exécutent instantanément ; l'interface
  le fait avancer selon le curseur de vitesse : au ralenti tant qu'une trame
  est sur un câble (une traversée dure 400 ms ÷ vitesse), comme le temps réel
  sinon (×vitesse au-delà de 1), pour que l'animation reste lisible sans
  allonger les attentes (intervalle entre pings, délais d'expiration).
- Le moteur est **événementiel et synchrone** (callbacks), donc déterministe.
- L'objet `Network` est l'unique source de vérité ; l'interface s'y abonne.

## Fonctionnalités et étapes

Chaque étape se termine par : tests verts, lint + typage OK, mise à jour de ce
fichier (case cochée).

- [x] **Étape 0 — Socle** : projet Vite + React + TypeScript strict, ESLint,
      Prettier, Vitest, build fichier unique, scripts `check`.
- [x] **Étape 1 — Cœur** : adresses IPv4/MAC (validation, masques, réseaux),
      ordonnanceur à temps virtuel, émetteur d'événements.
- [x] **Étape 2 — Couche liaison** : trames Ethernet, câbles, interfaces,
      switch avec apprentissage (table SAT), capture des échanges.
- [x] **Étape 3 — Couche réseau** : ARP (cache, file d'attente), IPv4,
      tables de routage (plus long préfixe), passerelle, routeur multi-interfaces,
      TTL, ICMP (écho, délai dépassé, destination inaccessible).
- [x] **Étape 4 — Couche transport** : UDP (ports, ports éphémères), TCP
      (connexion en 3 temps, numéros de séquence, acquittements, retransmission,
      fermeture, RST).
- [x] **Étape 5 — Services** : DHCP (plage, réservations, client automatique),
      DNS (A, MX, NS, redirection), HTTP (serveur de fichiers / navigateur),
      SMTP + POP3 (comptes, relais entre serveurs via MX), serveur/client écho,
      pare-feu (postes et routeurs), RIP (routage automatique).
- [x] **Étape 6 — Terminal & fichiers** : système de fichiers virtuel ;
      commandes `help`, `ipconfig`, `ping`, `arp`, `route`, `traceroute`,
      `nslookup`, `host`, `netstat`, `ls/dir`, `cd`, `cat/type`, `mkdir`, `rm/del`,
      `clear/cls`, `hostname`.
- [x] **Étape 7 — Projet** : sérialisation JSON versionnée, validation stricte
      au chargement, ouverture/enregistrement de fichiers, sauvegarde auto.
- [x] **Étape 8 — Interface conception** : palette, plan de travail SVG
      (glisser-déposer, câblage, suppression), panneau de configuration
      (nom, IP, masque, passerelle, DNS, DHCP, interfaces du routeur, routes).
- [x] **Étape 9 — Interface simulation** : mode simulation, vitesse, câbles
      animés, bureau de chaque poste, installation de logiciels, fenêtres :
      terminal, navigateur, serveur web, éditeur de texte, explorateur de
      fichiers, messagerie, serveur de messagerie, serveur DNS, serveur DHCP,
      serveur/client écho, pare-feu ; tables SAT des switchs ; échanges de
      données (liste des trames + détail par couche).
- [x] **Étape 10 — Bout en bout & livraison** : scénarios Playwright, exemple
      de projet, build fichier unique, guide d'utilisation.
- [x] **Étape 11 — Import des projets Filius (`.fls`)** et annotations du plan
      (textes, zones colorées). Lecteur ZIP (`DecompressionStream` natif),
      analyseur XML minimal, interpréteur du sous-ensemble de
      `java.beans.XMLDecoder` utilisé par Filius (rien n'est exécuté), puis
      conversion vers le format de projet, validée par le schéma. Valeurs par
      défaut relevées dans les classes de Filius (XMLEncoder n'écrit que ce qui
      en diffère). Testé sur un projet d'exemple écrit à la main et vérifié
      localement sur 32 projets réels (Filius 1.10 à 2.5).
- [x] **Étape 12 — Interfaces des routeurs** : ajout et retrait d'interfaces
      (2 à 8) en mode conception. Le retrait supprime le câble branché et les
      routes statiques qui passaient par l'interface, renumérote les suivantes
      (les autres routes suivent leur interface) et demande confirmation dès
      que quelque chose serait perdu.
- [x] **Étape 13 — Clic droit** : menus contextuels relevés dans les classes de
      Filius (`GUIEvents`, `JDocuElement`) : équipement, câble, texte et zone en
      conception (mêmes entrées, mêmes palettes de couleurs, tailles 12/18/24,
      styles normal/italique/gras) ; bureau et échanges de données par interface
      en simulation. RéseauLab ajoute les tables du switch et du routeur au
      menu de simulation. Accessible au clavier (touche Menu, Maj+F10, flèches,
      Échap).
- [x] **Étape 14 — Animation au ralenti** : le temps simulé ralentit pendant
      qu'une trame traverse un câble (0,4 s par câble à la vitesse par défaut
      × 1, réglable de × 0,1 à × 4) et suit le temps réel le reste du temps.
      Un ping routé dure ainsi 3,2 s, le premier chargement d'une page web de
      l'exemple environ 18 s (4 s à × 4). Les temps affichés par `ping`
      restent ceux du réseau simulé (quelques dizaines de millisecondes).
- [x] **Étape 15 — Wi-Fi** (Filius 2.5) : chaque switch est un point d'accès
      avec un SSID unique (32 caractères au plus, « Wifi-n » par défaut). Un
      poste en « Sans fil (Wi-Fi) » rejoint un switch par son SSID ; la
      connexion se comporte comme un câble et se dessine en pointillés.
      Changer le SSID d'un switch déconnecte ses clients Wi-Fi, comme dans
      Filius. Import `.fls` : SSID des switchs, cartes et liaisons sans fil.
      Le portable du réseau d'exemple est en Wi-Fi.
- [x] **Étape 16 — Masquer le trafic automatique** : une case de la barre
      d'outils cache les trames DHCP et RIP (envoyées en diffusion, donc sans
      ARP) : elles ne sont ni animées ni ralenties, mais toujours échangées et
      capturées. Choix mémorisé dans le navigateur.

- [x] **Étape 17 — Correctifs de saisie et finitions** (premier lot de la
      feuille de route ci-dessous, issue d'un essai de l'application en
      1366 × 768). Un champ de texte est appliqué avant tout changement de
      sélection : taper une adresse puis cliquer sur le plan vide ne la perd
      plus ; une valeur invalide garde le champ et son message à l'écran. Le
      masque `255.255.255.0` est proposé avec la première adresse (poste et
      interface de routeur), comme dans Filius. `Ouvrir…` demande confirmation
      avant de remplacer un réseau, et un plan qui ne contient que des
      annotations compte comme non vide. `Enregistrer` demande le nom du
      fichier. Au démarrage, un bandeau signale le travail retrouvé dans le
      navigateur (avec sa date) et propose de le continuer ou de repartir de
      zéro. Les messages d'erreur restent jusqu'à leur fermeture et
      s'affichent sur le plan, plus sur le panneau. Nombres avec virgule ;
      « Client écho » ; mêmes libellés dans le panneau et le menu de
      simulation ; « commutateur » rappelé pour le switch.

## Feuille de route : de simulateur à outil d'apprentissage

Les étapes 0 à 16 donnent un simulateur équivalent à Filius. Les suivantes en
font un support d'apprentissage et de référence pour la Technologie au collège
(4e, 3e), sur les PC de salle info.

- [x] **Étape 18 — Plan lisible** : le plan s'ajuste à la zone visible (plus de
      barres de défilement sur un écran 1366 × 768) tant que l'élève n'a pas
      choisi de zoom ; boutons − / + / 100 % / « Ajuster » et Ctrl + molette
      (de 30 % à 200 %). Une fenêtre s'ouvre contre le bord opposé à son
      équipement, qui reste donc visible ; elle tient dans la zone (au plus
      55 % de sa largeur), sa barre de titre ne peut plus en sortir, Échap
      ferme celle du dessus, « Ranger les fenêtres » et « Tout fermer » sont
      dans la barre du bas. En simulation la palette disparaît et le panneau
      se réduit à une ligne ; la barre d'outils ne montre que les réglages du
      mode en cours. Annuler / Rétablir (boutons, Ctrl+Z, Ctrl+Y ou
      Ctrl+Maj+Z) sur 50 étapes : chaque étape est un instantané du projet,
      les modifications rapprochées (glisser un équipement) sont regroupées,
      ouvrir ou remplacer un réseau s'annule aussi.
- [x] **Étape 19 — Observabilité du moteur** : le moteur dit enfin pourquoi
      une communication échoue. Événement `drop` du réseau, avec l'équipement,
      l'instant, l'étape (envoi, réception, transfert) et une raison prise dans
      une liste fermée : `no-address`, `no-route` (avec le cas de la passerelle
      hors réseau, ignorée), `no-link`, `arp-timeout` (et l'adresse qui n'a pas
      répondu), `ttl-expired`, `firewall`, `not-a-router`,
      `iface-unconfigured`, `port-closed`. Chaque trame reçue porte un verdict
      dans la capture : acceptée, relayée, ignorée (pas pour cet équipement,
      ou personne n'écoute) ou filtrée par le pare-feu. Le terminal accepte une
      liste de commandes autorisées et signale les commandes lancées, le
      résultat d'un `ping` et un nom introuvable. `cloneNetwork` copie la
      conception d'un réseau pour la simuler hors écran. Aucun comportement du
      moteur n'est modifié : ce sont des observations.
- [x] **Étape 20 — Diagnostic** (`src/learn/diagnose`, premier module du
      volet pédagogique : TypeScript pur, soumis aux mêmes règles que le
      moteur). **Vérification du réseau** : 19 contrôles de la conception, sans
      simulation (poste non relié, adresse ou masque manquant, adresse en
      double, équipements du même switch dans des réseaux différents,
      passerelle hors réseau / inexistante / sur un ordinateur / manquante
      près d'un routeur, DNS, serveur non démarré, DHCP sans serveur,
      interfaces de routeur, boucle de switchs). Les règles tiennent compte
      du contexte pour ne signaler que ce qui gêne. Un « ! » marque
      l'équipement sur le plan, son panneau dit quoi faire, le bouton
      **Vérifier** affiche le nombre de points repérés. **Tester une
      communication** : un `ping` est rejoué par le vrai moteur sur une copie
      du réseau (aucune seconde implémentation du routage), puis l'abandon
      signalé par le moteur est traduit en cause : 21 explications, chacune
      avec « que faire ? » et le trajet parcouru par la demande. Après un
      `ping` raté, le terminal propose **Pourquoi ça ne marche pas ?**. Les
      textes sont séparés des règles (`messages.fr.ts`) pour pouvoir être
      reformulés. Garde-fous : pas de simulation s'il y a une boucle de
      switchs, exécution bornée en temps virtuel et en nombre d'événements.
- [x] **Étape 21 — Lisibilité de la simulation** : une trame est une pastille
      qui porte le nom de son protocole (ARP, ICMP, DHCP, DNS, HTTP…), dessinée
      au-dessus des équipements ; une légende repliable explique chaque
      couleur. Quand un équipement abandonne un paquet, la raison s'écrit un
      moment à côté de lui (« ✕ aucun chemin vers la destination »). **Trame
      suivante** fait avancer les trames d'un câble puis remet la simulation
      en pause ; la pause est signalée sur le plan. Échanges de données :
      filtre par protocole, trames ignorées en italique (« ← ignorée »,
      masquables), verdict de chaque trame reçue, défilement qui suit les
      nouvelles trames, messages DHCP racontés (« Qui peut me donner une
      adresse ? (DISCOVER) »). Les tables de routage et ARP d'un poste se
      consultent sans la ligne de commande, avec leurs en-têtes et une phrase
      d'explication. L'animation a son propre signal : seuls le plan et
      l'horloge sont redessinés à chaque image, le reste de l'interface
      seulement quand quelque chose change. « Masquer le trafic automatique »
      rejoint la légende, sur le plan.
- [x] **Étape 22 — Connaissances** : RéseauLab explique ce qu'il montre. Un
      **pack pédagogique** par défaut contient 34 fiches en français (6 de
      prise en main, 28 notions réparties en 5e / 4e / 3e : réseau, terminal,
      client et serveur, switch, liaisons, Wi-Fi, box, réseau local et
      Internet, topologie ; adresse IP, masque, adresse MAC, DHCP, ping, objet
      connecté ; routeur, passerelle, table de routage, trame et paquet,
      protocole, couches, ARP, DNS, web, messagerie, TTL, pare-feu, chemin
      d'une information). Chaque fiche : définition en une phrase,
      explication, exemple, « à retenir », « dans RéseauLab », renvois. La
      fenêtre **Aide et connaissances** remplace l'ancienne aide : rubriques,
      recherche sans accents, filtre par niveau, lexique alphabétique,
      navigation de lien en lien avec retour. Un **« ? »** à côté des champs
      (adresse IP, masque, passerelle, DNS, DHCP, adresse MAC, SSID, RIP)
      donne la définition sur place et mène à la fiche ; chaque constat du
      diagnostic renvoie à la sienne. Le texte des fiches utilise une mise en
      forme minimale (`src/learn/richtext.ts`) transformée en éléments
      d'interface, jamais insérée comme HTML. Un fichier de pack
      (`reseaulab-pack`, validé comme un projet) peut remplacer, ajouter ou
      masquer des fiches et reformuler les messages du diagnostic ; il est lu
      depuis le navigateur du poste (clé `reseaulab:pack`).
- [x] **Étape 23 — Profils par niveau** : le bouton **Réglages** (⚙) permet de
      choisir le niveau de la classe — 5e, 4e, 3e ou complet —, gardé sur le
      poste. Une table (`src/learn/profile/capabilities.ts`) dit à partir de
      quel niveau chaque équipement, logiciel, commande et réglage est
      proposé ; elle est exhaustive par construction (un logiciel ajouté sans
      niveau ne compile pas). Selon le niveau, RéseauLab masque : le routeur
      de la palette ; des logiciels à installer ; des commandes de la ligne
      de commande ; les champs passerelle, DNS, DHCP, Wi-Fi ; les onglets
      Routage et Pare-feu du routeur ; les échanges de données et les tables ;
      les constats du diagnostic que l'élève ne pourrait pas corriger ; l'aide
      « ? » et, par défaut, les fiches au-delà du niveau. Un profil masque
      l'interface sans rien désactiver : ce qui est déjà sur le plan ou déjà
      réglé (un routeur posé par l'enseignant, une passerelle renseignée)
      reste visible et fonctionne. La fenêtre des réglages liste ce que le
      niveau masque. En simulation, la barre d'outils ne garde
      qu'« Enregistrer » parmi les actions de projet.
- [x] **Étape 24 — Terminaux variés** : serveur, imprimante, objet connecté,
      smartphone et tablette rejoignent l'ordinateur et le portable. Ce sont
      tous des postes (une carte réseau, une pile IP complète) : seuls
      changent le dessin, le nom et l'équipement d'origine. L'imprimante et
      l'objet connecté affichent leur état sur une petite page web, comme les
      vrais ; le smartphone et la tablette sont en Wi-Fi et ont un
      navigateur. « Ajouter un objet connecté à un réseau local » se fait
      donc comme pour un poste : le relier, lui donner une adresse du réseau,
      le joindre par `ping` ou par son adresse dans le navigateur. La palette
      passe à une ligne par équipement pour que les neuf équipements et les
      trois outils restent visibles sur un écran de 768 px de haut. La box,
      prévue ici, fait l'objet de l'étape 29 (voir les écarts).
- [ ] **Étape 25 — Activités guidées** : consignes et objectifs dans le fichier,
      vérifiés automatiquement (état du réseau, sondes sur une copie, journal) ;
      panneau élève, indices, verrous ; activités d'exemple.
- [ ] **Étape 26 — Trace et compte rendu** : nom et classe, journal, compte
      rendu imprimable (plan, table d'adressage, objectifs, réponses), fichier
      rendu.
- [ ] **Étape 27 — Quiz** : questions par notion et par niveau, bilan renvoyant
      aux fiches.
- [ ] **Étape 28 — Éditeur d'activités** : objectifs proposés depuis le réseau
      solution, réseau de départ, export et import du pack pédagogique.
- [ ] **Étape 29 — Box Internet** : un seul équipement réunissant routeur,
      switch, point d'accès Wi-Fi et serveur DHCP, comme à la maison.

## Écarts au plan

- **pnpm au lieu de npm** : npm 10.9 plante (`Cannot read properties of null
(reading 'edgesOut')`) en résolvant les dépendances optionnelles de Vitest 5.
  Le verrou est donc `pnpm-lock.yaml`.
- **Système de fichiers avancé à l'étape 5** : le serveur web en dépend.
- **Pare-feu « à états »** : seuls les paquets qui ouvrent un échange (SYN TCP,
  datagramme UDP, requête ICMP) sont comparés aux règles ; les réponses
  passent toujours. C'est le comportement attendu par les élèves.
- **RIP** : diffusion toutes les 5 s virtuelles (au lieu de 30 s) pour que la
  convergence reste observable en classe.

- **Textes de l'interface** : les libellés partagés (équipements, logiciels,
  modes) sont centralisés dans `src/i18n/fr.ts` ; les textes propres à un seul
  composant restent dans ce composant, plus lisible qu'un fichier de clés.
- **Tests de bout en bout** : Playwright pilote le Chrome installé sur la
  machine (`channel: 'chrome'`) plutôt qu'un navigateur téléchargé. Les
  scénarios tournent sur le build final, servi et ouvert en `file://`.
- **Pare-feu des projets Filius** : Filius laisse passer l'ICMP (sauf
  « bloquer ICMP ») et, selon l'option, l'UDP ; l'import l'exprime par des
  règles explicites en tête de liste. Une politique par défaut « accepter »
  devient une règle finale « tout accepter ». La source « même réseau » est
  développée en une règle par réseau de l'équipement.
- **Bug corrigé pendant l'étape 11** : le pare-feu ne reconnaissait pas les
  segments TCP envoyés par l'initiateur d'une connexion acceptée ; un client
  ne pouvait donc rien envoyer à travers un pare-feu (test ajouté).
- **Confirmations** : boîte de dialogue intégrée à la page au lieu de
  `window.confirm`/`window.prompt`, parfois bloqués sur les postes gérés.
- **Libellés courts dans les formulaires** (étape 17) : « Masque » et
  « Passerelle » restent tels quels dans le panneau ; `ipconfig` garde les
  formes longues de Windows (« Masque de sous-réseau », « Passerelle par
  défaut »). Le lexique de l'étape 22 fera le lien.
- **Fenêtres fermées au changement de mode** : le texte non enregistré de
  l'éditeur est toujours perdu en quittant la simulation (non traité aux
  étapes 17 et 18).
- **Fenêtres flottantes conservées** (étape 18) : sur 1366 px, un plan large
  et une fenêtre de 640 px ne tiennent pas côte à côte sans réduire le plan à
  une taille illisible. Les fenêtres restent donc superposées au plan, du côté
  opposé à leur équipement ; les réseaux construits par les élèves (quelques
  équipements placés à gauche) restent entièrement visibles.
- **Box reportée à l'étape 29** (étape 24) : une box est un équipement
  composite — un routeur, un switch interne, un point d'accès et un serveur
  DHCP qui, aujourd'hui, ne peut tourner que sur un poste. La réaliser
  touche le Wi-Fi (réservé aux switchs), le choix des ports au câblage, le
  format de fichier et l'analyse de topologie du diagnostic. Elle est donc
  sortie de l'étape 24 et placée après les étapes pédagogiques (25 à 28),
  qui n'en dépendent pas. D'ici là, une box se reproduit avec un routeur, un
  switch et un poste serveur DHCP ; la fiche « Box Internet » l'explique.
- **Répartition par niveau à valider** (étape 23) : comme pour les fiches,
  le niveau attribué à chaque élément de l'interface est une proposition
  (5e : composants et web ; 4e : adressage, DHCP, `ping`, échanges de
  données ; 3e : routeur, passerelle, DNS, messagerie, pare-feu ; complet :
  RIP). Un profil accepte des écarts (`show`, `hide`), utilisés par les
  activités de l'étape 25 ; l'interface des réglages ne propose pour
  l'instant que le choix du niveau.
- **Couches de la capture non masquées** (étape 23) : il était prévu de
  cacher les couches hautes aux petits niveaux ; à la place, les échanges de
  données n'apparaissent qu'à partir de la 4e.
- **Contenu des fiches à valider** (étape 22) : le découpage par niveau et
  la rédaction sont une proposition. Aucune fiche ne cite le programme
  officiel (son texte n'a pas pu être consulté pendant la rédaction) ; le
  champ `curriculum` d'une fiche est laissé à l'enseignant. L'import et
  l'export d'un pack depuis l'interface arrivent à l'étape 28 ; d'ici là le
  mécanisme existe et est testé, mais sans bouton.
- **Pas de schémas intégrés aux fiches** (étape 22) : une fiche peut porter
  une image fournie par l'enseignant ; les schémas dessinés par RéseauLab
  restent à faire.
- **Pas de vue « dialogue »** (étape 21) : le diagramme d'échanges entre
  équipements prévu à cette étape n'est pas réalisé ; la liste filtrable et
  le pas-à-pas couvrent le besoin immédiat. À reprendre si l'usage en classe
  le demande.
- **Message de `ping` reformulé** (étape 20) : quand la demande ARP du poste
  reste sans réponse, Windows affiche « Réponse de <sa propre adresse> :
  hôte inaccessible », ce qui déroute. RéseauLab écrit « Hôte de destination
  inaccessible : aucun équipement n'a répondu à cette adresse sur le
  réseau. ». Les autres messages restent ceux de Windows.
- **Adresse en double signalée dans un même réseau seulement** (étape 20) :
  la même adresse de part et d'autre d'un routeur n'est pas signalée par la
  vérification ; le test de communication l'explique si elle gêne.
- **Pas d'abandon signalé à l'émission d'une trame** (étape 19) : un switch
  envoie sur ses ports libres quand il inonde, et un routeur en RIP diffuse
  sur ses interfaces non câblées ; signaler ces trames noierait les vrais
  échecs. L'absence de câble apparaît quand la résolution ARP échoue
  (`no-link`), et sera aussi détectée par les contrôles statiques de
  l'étape 20.
- **Annulation par instantanés** (étape 18) : l'historique garde le projet
  sérialisé à chaque étape plutôt qu'une liste de commandes inverses ; c'est
  plus simple et couvre toutes les modifications, y compris celles des
  fenêtres de serveurs. L'ordre des champs des annotations est désormais
  fixe dans le fichier, pour qu'un aller-retour redonne le même texte.

## Hors périmètre (documenté)

- **Modem** reliant deux instances sur de vrais réseaux : impossible
  proprement dans un navigateur sans serveur.
- **Assistant de création de logiciels** (compilation Java à la volée).
- **Pair-à-pair (Gnutella)** : envisageable plus tard.
- **Dans les fichiers `.fls`** (signalé dans le rapport d'import) : modems,
  logiciel pair à pair, comptes du client de messagerie, cartes réseau
  supplémentaires d'un ordinateur. Les hôtes virtuels du serveur web et le
  contenu des boîtes aux lettres ne sont pas repris non plus, sans
  avertissement pour l'instant.
