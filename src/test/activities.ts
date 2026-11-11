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
