import { Network } from '../engine/network';
import type { BuiltinActivity } from '../learn/activity/builtin';
import { activitySchema, type ActivityInput } from '../learn/activity/schema';

/* Activities written for the tests. */

export const SWITCH_QUESTION = {
  type: 'mcq' as const,
  prompt: 'Quel équipement relie les terminaux d’un même réseau ?',
  choices: ['Le switch', 'Le serveur', 'L’imprimante'],
  correct: [0],
  explanation: 'Le switch (commutateur) relie les terminaux.',
  notion: 'switch',
};

/** Pairs to put back together. */
export const MATCH_QUESTION = {
  type: 'match' as const,
  prompt: 'Associe chaque équipement à son rôle.',
  pairs: [
    ['Switch', 'Relier les équipements d’un réseau'],
    ['Routeur', 'Relier des réseaux'],
    ['Serveur', 'Fournir des fichiers'],
  ] as [string, string][],
  explanation: 'Le switch relie des équipements, le routeur des réseaux, le serveur fournit.',
  notion: 'switch',
};

/** Two steps of questions, then a bonus step. */
export const QUESTIONS: ActivityInput = {
  id: 'questions',
  title: 'Questions',
  level: '4e',
  steps: [
    {
      id: 'revisions',
      title: 'Révisions',
      part: 'Partie 1 — Révisions',
      objectives: [
        { id: 'q-switch', label: 'Rôle du switch', check: { type: 'question', question: SWITCH_QUESTION } },
        {
          id: 'q-pourquoi',
          label: 'Pourquoi une adresse',
          check: { type: 'question', question: { type: 'open', prompt: 'Pourquoi une adresse ?' } },
        },
      ],
    },
    {
      id: 'adresses',
      title: 'Adresses',
      part: 'Partie 2 — Adresses',
      partNote: '**Séance 2** : rouvre ton fichier avec [[ecran:ouvrir]].',
      objectives: [
        {
          id: 'q-reseau',
          label: 'Partie réseau',
          check: {
            type: 'question',
            question: {
              type: 'short',
              prompt: 'Partie réseau de 192.168.10.1 avec le masque 255.255.255.0 ?',
              accepted: ['192.168.10'],
            },
          },
        },
        {
          id: 'q-meme-reseau',
          label: 'Même réseau ?',
          check: { type: 'question', question: { type: 'same-network', prompt: 'Même réseau ?' } },
        },
      ],
    },
    {
      id: 'defi',
      title: 'Défi',
      bonus: true,
      objectives: [
        {
          id: 'q-ordre',
          label: 'Démarche',
          check: {
            type: 'question',
            question: { type: 'order', prompt: 'Dans quel ordre ?', items: ['Câble', 'Adresse', 'Masque'] },
          },
        },
      ],
    },
  ],
};

/** The same, as an activity of the list, on an empty plan. */
export const QUESTIONS_BUILTIN: BuiltinActivity = {
  id: 'questions',
  title: 'Questions',
  level: '4e',
  summary: 'Des questions.',
  build: () => ({ network: new Network(), activity: activitySchema.parse(QUESTIONS) }),
};

/** Three steps of one question each; the second one is an « approfondissement » that may be skipped. */
export const OPTIONAL: ActivityInput = {
  id: 'facultatif',
  title: 'Avec approfondissement',
  level: '3e',
  steps: [
    {
      id: 'base',
      title: 'Base',
      objectives: [
        { id: 'q-switch', label: 'Rôle du switch', check: { type: 'question', question: SWITCH_QUESTION } },
      ],
    },
    {
      id: 'plus',
      title: 'Pour aller plus loin',
      optional: true,
      solution: 'Réponse : **4** routeurs.',
      objectives: [
        {
          id: 'q-combien',
          label: 'Combien de routeurs',
          check: {
            type: 'question',
            question: { type: 'short', prompt: 'Combien de routeurs ?', accepted: ['4'] },
          },
        },
      ],
    },
    {
      id: 'fin',
      title: 'Fin',
      objectives: [{ id: 'q-roles', label: 'Rôles', check: { type: 'question', question: MATCH_QUESTION } }],
    },
  ],
};

export const OPTIONAL_BUILTIN: BuiltinActivity = {
  id: 'facultatif',
  title: 'Avec approfondissement',
  level: '3e',
  summary: 'Une étape peut être passée.',
  build: () => ({ network: new Network(), activity: activitySchema.parse(OPTIONAL) }),
};
