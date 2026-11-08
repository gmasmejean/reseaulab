# Règles de développement

Ces règles s'appliquent à chaque étape du [plan](PLAN.md).

## Code

1. **TypeScript strict** (`strict`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`) ; aucun `any`, aucun `@ts-ignore`.
2. **Le moteur (`src/engine`) ne dépend ni de React ni du DOM.** Il doit pouvoir
   tourner dans Node pour les tests.
3. **Déterminisme** : pas de `Date.now()`, `Math.random()` ni `setTimeout` dans le
   moteur ; uniquement l'ordonnanceur virtuel et des générateurs injectés.
4. **Données immuables** : trames et paquets sont `readonly` ; jamais modifiés
   après émission.
5. **Petites unités** : une responsabilité par module ; fonctions courtes et
   nommées explicitement ; identifiants en anglais, textes d'interface en
   français centralisés dans `src/i18n`.
6. **Entrées utilisateur validées** : adresses IP, masques, ports et fichiers
   projet sont validés à la frontière ; un fichier projet invalide est refusé
   avec un message clair, jamais chargé partiellement.
7. **Sécurité** : aucun HTML reçu dans la simulation n'est injecté brut dans la
   page (`dangerouslySetInnerHTML` interdit) ; le navigateur simulé utilise un
   rendu par liste blanche.
8. **Accessibilité** : contrôles avec libellés, navigation au clavier,
   contrastes suffisants.

## Tests

1. Toute fonctionnalité du moteur est livrée **avec ses tests** (Vitest) ;
   couverture du moteur visée ≥ 90 %.
2. Les tests de protocoles construisent un vrai petit réseau et vérifient le
   comportement observable (réponses, tables, trames capturées), pas les détails
   internes.
3. Les composants d'interface clés ont des tests (Testing Library) ; les
   parcours principaux ont des tests de bout en bout (Playwright).
4. Un bug corrigé = un test qui le reproduit.

## Processus

1. Une étape à la fois, dans l'ordre du plan.
2. Fin d'étape : `pnpm run check` (typage + lint + format + tests) doit passer ;
   puis la case de l'étape est cochée dans le plan. Quand l'interface est
   touchée, `pnpm run e2e` (scénarios Playwright) doit passer aussi.
3. Pas de dépendance ajoutée sans nécessité ; versions figées dans
   `pnpm-lock.yaml`.
4. Tout écart au plan est noté dans le plan avec sa raison.
