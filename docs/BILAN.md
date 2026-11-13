# Bilan du 13 novembre 2026 — interface de RéseauLab et activité « Du collège au musée » (3e)

## Contexte

Demande : un point sur l'interface de RéseauLab avec des pistes d'amélioration, et un point sur l'activité de 3e.
Cadrage : l'activité visée est **« Du collège au musée »** (« La salle de techno » est l'activité de 4e) ; matériel = **PC de salle info à la souris**. Ce document est un état des lieux : les pistes retenues deviennent des étapes de [`PLAN.md`](PLAN.md).

Méthode : lecture du code (`src/ui`, `src/learn/activity`), lecture intégrale de `college-musee.ts`, et captures de l'application construite (`dist/`) en 1366×768 et 1920×1080.

---

## Partie A — L'interface

### Ce qui est solide

- **Aide intégrée** : F1 contextuel, « ? » à côté des champs, fiches qui font clignoter l'élément d'écran cité, « Pourquoi ça ne marche pas ? » après un ping raté.
- **Saisie robuste** : erreur sous le champ, Échap rétablit, annulation sur 50 états.
- **Simulation lisible** : paquets nommés par protocole, abandon expliqué sur le plan, pas à pas.
- **Retour des questions** clair et pas seulement coloré (✔/✘, réponse attendue, lien vers la fiche).
- Plan et menus utilisables au clavier ; tout en Pointer Events.

### Constats prioritaires (gênent le travail des élèves)

**A1. À 1366×768, trois zones se disputent l'écran.** (constaté sur capture)

- Le plan de l'activité de 3e s'ajuste à **58 %** : noms et adresses deviennent illisibles (≈ 6-7 px).
- Dès qu'un équipement est sélectionné, le panneau du bas prend ≈ 40 % de la hauteur ; il reste ≈ 285 px de haut pour lire une question dans un panneau d'activité de 320 px de large.
- La « Consigne » (ouverte par défaut) dépasse un écran : l'élève doit défiler avant de voir l'étape 1.
- Pistes : panneau de configuration repliable ou en volet latéral ; consigne repliée après un bouton « Commencer » ; taille minimale des étiquettes quel que soit le zoom ; **cadrage par étape** (l'activité indique la zone du plan à montrer : le CDI seul en partie 1).

**A2. En simulation, les fenêtres recouvrent le plan.** (constaté)

- Le terminal (640×400) s'ouvre au centre et masque les routeurs que le paquet traverse : on ne voit plus ce qu'on est censé observer.
- Pistes : ancrer la ligne de commande dans le bas de l'écran (en simulation ce bandeau ne contient qu'une ligne), ou placer les fenêtres hors du trajet source → destination.

**A3. Le diagnostic parle trop tôt et ne se tait jamais.** (constaté + `lint.ts:96`)

- Dès l'ouverture : « Vérifier **8** » et un « ! » sur presque chaque équipement. Les pannes à trouver sont désignées avant d'être cherchées.
- « Poste 1 n'a pas de passerelle » s'affiche pendant toute la partie 1, alors que la passerelle est une notion de la partie 2.
- Le compteur ne peut pas tomber à zéro : serveur, tablette et capteur n'ont jamais de passerelle.
- Piste : laisser l'activité régler ce que le diagnostic montre, étape par étape (codes ignorés, ou marques affichées seulement après un clic sur « Vérifier »).

**A4. Trois façons de perdre son travail sans avertissement.**

- « Quitter l'activité » efface réponses, indices et objectifs, sans confirmation ni annulation (`session.ts:483`) ; le bouton est collé à « Vérifier mon travail », le plus cliqué.
- « Valider » est définitif (un seul essai) sans confirmation.
- Dans l'onglet Routage, un clic sur « X » supprime une route de l'infrastructure.
- Pistes : confirmation sur « Quitter » (et bouton éloigné, style discret) ; Valider en deux temps ou annulable quelques secondes.

**A5. « Vérifier mon travail » ne répond rien, et il y a deux « Vérifier ».**

- `checkWork` (`session.ts:534`) ne produit aucune notification : si rien ne change, l'élève ne sait pas si le clic a compté.
- « Vérifier » (barre, diagnostic du réseau) et « Vérifier mon travail » (activité) sont deux fonctions différentes.
- Pistes : message de résultat (« 2 objectifs validés ; il reste : … ») ; renommer l'un des deux (« Diagnostic »).

### Constats de second rang (cohérence, confort)

| #   | Constat                                                                                                                                                                                                          | Piste                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A6  | Tutoiement et vouvoiement mélangés, jusque dans une phrase (`ActivityPanel.tsx:505-513`)                                                                                                                         | Tutoyer partout côté élève                                                                               |
| A7  | Texte de base 14 px, étiquettes 10-11 px, « ? » de 18 px, poignée de 10 px, ⚙ minuscule, fermeture par une lettre « X »                                                                                          | Réglage « taille du texte » ; cibles ≥ 28 px ; vraies icônes                                             |
| A8  | Pas d'accueil : plan vide et six boutons de même poids ; fenêtre Activités petite (3,5 activités visibles sur 7), sans durée ni tri par niveau                                                                   | Accueil à trois entrées (activité / réseau libre / reprendre) ; liste filtrée par niveau, durée affichée |
| A9  | Question à ordonner : numéro décalé sur la 2e ligne, flèches seules ; à 1920 px le panneau d'activité reste à 320 px                                                                                             | Corriger l'alignement ; largeur par défaut proportionnelle                                               |
| A10 | Défauts d'affichage : « eth0 » écrit sous le nom du routeur ; bulle « personne ne répond » coupée au bord gauche ; notification posée sur des équipements ; aide de saisie tronquée (« passerelle (vide = dir ») | Corrections ponctuelles                                                                                  |
| A11 | Échap ne ferme pas le terminal quand le curseur est dans la saisie (`App.tsx:102`) ; Retour arrière supprime la sélection hors d'un champ                                                                        | Ajuster les raccourcis                                                                                   |

### De fond (moins urgent)

- Accessibilité : modales sans piège ni retour de focus, onglets du routeur incomplets, bordure des champs à 1,39:1.
- Dette : `styles.css` 2 821 lignes, `session.ts` 1 402, `PropertiesPanel.tsx` 1 054 ; 116 couleurs en dur ; ni test visuel ni audit d'accessibilité automatique.
- Hors périmètre vu le matériel : tactile, tablette, thème sombre.

---

## Partie B — « Du collège au musée » (3e)

**Fiche** : 180 min + bonus ; 20 étapes (6 + 12 + 2 bonus) ; 74 objectifs hors bonus, dont **55 questions et 19 manipulations vérifiées** ; 33 indices. Fichier : `src/learn/activity/college-musee.ts`.

### Points forts

- Scénario unique et motivant : faire afficher le site du musée, du CDI au data center.
- Vraies pannes vérifiées par le simulateur (Poste 2, route manquante, DNS), validation ouverte (toute route qui marche est acceptée).
- Lectures impossibles à deviner : tables de routage, sortie de `traceroute`, paquet capturé.
- La limite du simulateur (pas de traduction d'adresses) est dite à l'élève.
- Indices progressifs et fiches à chaque étape ; testée de bout en bout.

### Constats et pistes

**B1. La seconde séance finit par un tunnel de questions.**

- La dernière manipulation vérifiée est à l'étape 12. Les étapes 13 à 18 enchaînent **23 questions** (débit, données, deux objets, enjeux, bilan) sans toucher au simulateur.
- Pistes : ancrer ces notions dans une observation (taille réelle de la page reçue dans « Échanges de données », temps de transfert mesuré, export CSV des mesures du capteur) ; ou sortir « deux objets » et « enjeux » en mini-activité séparée.

**B2. La panne de routage est donnée au lieu d'être trouvée (étape 10).**

- La consigne dit quel routeur n'a pas la route juste après avoir demandé de cliquer sur « Pourquoi ça ne marche pas ? ». `traceroute` n'arrive qu'après la réparation.
- Piste : `traceroute` **avant** réparation, puis une question « quel est le dernier routeur qui répond ? », et seulement ensuite la route à ajouter.

**B3. On peut finir sans avoir compris.** (moteur, vaut pour toutes les activités)

- Une question compte comme faite dès qu'on y répond, juste ou faux (`evaluate.ts:261`) ; une réponse libre non vide suffit ; `traceroute` ou `nslookup` sans argument valident l'objectif.
- Le score n'apparaît que dans le compte rendu.
- Pistes : score par partie montré à l'élève ; « Revoir mes erreurs » en fin de partie ; seuil facultatif réglable par le professeur.

**B4. La question « même réseau ? » sort de la progression.** (`quiz.ts:37-45`)

- Une fois sur quatre le masque tiré est `255.255.0.0`, jamais expliqué ; dans ce cas la bonne réponse est toujours « oui », donc l'élève qui applique la règle apprise se trompe.
- Piste : option pour limiter le tirage à /24, ou indice qui traite les deux masques.

**B5. Des réponses courtes justes sont refusées.**

- « 4 routeurs », « 10 h 00 », « 30 Ko » sont comptés faux ; la comparaison ignore casse et accents mais pas l'unité ni les espaces internes (`content/merge.ts:44`).
- Piste : normalisation plus tolérante (unité finale, espaces, ponctuation), une fois dans le moteur.

**B6. L'élève peut casser le réseau qu'on lui donne.**

- Les routeurs du FAI, d'Internet et du data center sont entièrement modifiables ; seule la suppression d'un équipement est bloquée. Aucun « rétablir le réseau de l'étape ».
- Piste : équipements d'infrastructure en lecture seule, sauf les champs que l'activité fait régler.

**B7. Consignes : trop au début, repères de séance noyés.**

- L'encadré sur l'adresse privée/publique est dans l'introduction, avant toute manipulation ; il serait utile à l'étape 9, quand on lit la table du FAI.
- La fin de la 1re séance n'est signalée que par une phrase dans l'étape 9.
- Piste : titre « Séance 2 » dans le panneau ; introduction réduite à la mission et au plan d'adressage.

**B8. Petites incohérences entre consigne et simulateur.**

- « Lecture seule » du dossier Commun : non simulée, l'élève ne peut pas la constater.
- « Respecte le plan d'adressage » : non vérifié (Poste 2 en `.77` est accepté) ; s'il prend `.50`, il entre en conflit avec le capteur à l'étape suivante (déduit du code).
- Objectif « Vérifier ne signale plus d'erreur » alors que le compteur reste rouge (voir A3).
- La première question « à ordonner » est en réalité une association rôle ↔ équipement.
- Piste : un type de question « associer », utile aussi pour protocole ↔ rôle.

**B9. Côté professeur.**

- Pas de corrigé ni de fiche de déroulement ; aucune étape reliée au programme (champ `curriculum` vide) ; contenu toujours noté « à faire valider par l'enseignant » dans `docs/PLAN.md`.
- Pas de différenciation hors bonus ; 74 objectifs en 180 min ≈ 2 min 30 chacun, serré pour les élèves lents.
- Pistes : **corrigé imprimable généré depuis l'activité** (les explications existent déjà) ; étapes marquées « essentiel / approfondissement ».

**B10. Tests.** Les réponses attendues ne sont jamais confrontées au simulateur (ex. l'adresse lue dans `traceroute`) : un test qui exécute la commande et compare fermerait ce risque.

### Écarts déjà assumés dans le plan

Pas de jeu débranché, deux objets communicants traités par questions, pas de traduction d'adresses, pas d'export des mesures vers un tableur.

---

## Si l'on ne retient que l'essentiel

|     | Interface                                                | Activité de 3e                                                |
| --- | -------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | A1 — lisibilité à 1366×768                               | B1 — tunnel de 23 questions                                   |
| 2   | A3 — diagnostic réglable par l'activité                  | B2 — faire trouver la panne de routage                        |
| 3   | A4 — confirmations (Quitter, Valider)                    | B4 + B5 — question hors progression, réponses refusées à tort |
| 4   | A2 — fenêtres hors du trajet                             | B6 — infrastructure protégée                                  |
| 5   | A5 + A6 — retour de « Vérifier mon travail », tutoiement | B9 — corrigé imprimable                                       |

Correctifs rapides et sûrs : A4, A5, A6, A10, B4, B5. Chantiers : A1, A2, A3, B1, B6.

## Note sur « La salle de techno » (4e)

Analysée aussi avant le cadrage. Elle partage B3, B4, B5 et B8, avec deux défauts propres : la fiche « Dépanner » donne la solution de la panne de Poste 3 (`default-pack.ts:687`), et « 8 bits » est refusé à la question sur l'octet (`salle-techno.ts:1351`).

## Limites de ce bilan

- Tests non relancés ; aucune observation d'élèves en classe.
- Déduits du code sans essai à l'écran : le conflit d'adresse `.50`, le compteur « Vérifier » en fin d'activité, la sortie exacte de `traceroute`.
- Captures prises en Chrome sans interface, à 1366×768 et 1920×1080 uniquement.

## Suite

Les pistes retenues sont reprises dans [`PLAN.md`](PLAN.md), section « Suites du bilan », à commencer par B1 et B6.
