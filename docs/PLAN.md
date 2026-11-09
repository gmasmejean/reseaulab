# RéseauLab — Plan de développement

Application web (100 % navigateur, sans installation ni serveur) permettant de
concevoir et simuler des réseaux informatiques en classe, avec les mêmes
fonctionnalités pédagogiques que le logiciel Filius.

## Objectifs

1. **Aucune installation** : l'application se construit en un seul fichier
   `reseaulab.html` utilisable hors-ligne (clé USB, ENT, mail) et peut aussi
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

## Hors périmètre (documenté)

- **Modem** reliant deux instances sur de vrais réseaux : impossible
  proprement dans un navigateur sans serveur.
- **Assistant de création de logiciels** (compilation Java à la volée).
- **Pair-à-pair (Gnutella)** : envisageable plus tard.
- **Dans les fichiers `.fls`** (signalé dans le rapport d'import) : modems,
  logiciel pair à pair, comptes du client de messagerie, hôtes virtuels du
  serveur web, cartes réseau supplémentaires d'un ordinateur.
