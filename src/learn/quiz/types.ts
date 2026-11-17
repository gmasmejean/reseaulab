import type { Level } from '../content/types';

/* Questions of the self-assessment quiz. Like the knowledge cards, they are
 * data of the pedagogical pack: a teacher can add, replace or hide any. */

interface QuestionBase {
  /** Stable identifier: « passerelle-role ». */
  readonly id: string;
  /** Knowledge card the question is about (and to read again after a mistake). */
  readonly notion: string;
  readonly level: Level;
  readonly prompt: string;
  /** Shown after the answer, right or wrong. */
  readonly explanation: string;
}

export type Question = QuestionBase &
  (
    | {
        /** One or several right answers among the choices (indices in `choices`). */
        readonly type: 'mcq';
        readonly choices: readonly string[];
        readonly correct: readonly number[];
      }
    | {
        /** Items to put back in order; `items` is the right order. */
        readonly type: 'order';
        readonly items: readonly string[];
      }
    | {
        /**
         * Pairs to put back together (an equipment and its role, a protocol
         * and what it does): each first item is shown with a list of the
         * second ones to choose from.
         */
        readonly type: 'match';
        readonly pairs: readonly (readonly [string, string])[];
      }
    | {
        /** A word or a number to type; accents and capitals do not matter. */
        readonly type: 'short';
        readonly accepted: readonly string[];
      }
    | {
        /** « Are these two addresses in the same network? », with new addresses each time. */
        readonly type: 'same-network';
        /** Masks the draw may use; only 255.255.255.0, the one the cards teach, when absent. */
        readonly masks?: readonly SameNetworkMask[] | undefined;
      }
  );

/** The masks a « same network? » question can be drawn with. */
export const SAME_NETWORK_MASKS = ['255.255.255.0', '255.255.0.0'] as const;
export type SameNetworkMask = (typeof SAME_NETWORK_MASKS)[number];

/** A question as put to the pupil: generated values drawn, choices shuffled. */
export type QuizItem = {
  readonly id: string;
  readonly notion: string;
  readonly prompt: string;
  readonly explanation: string;
} & (
  | { readonly kind: 'choice'; readonly choices: readonly string[]; readonly correct: readonly number[] }
  | { readonly kind: 'order'; readonly shuffled: readonly string[]; readonly solution: readonly string[] }
  /** `solution[i]` goes with `lefts[i]`; `shuffled` is what the pupil chooses from. */
  | {
      readonly kind: 'match';
      readonly lefts: readonly string[];
      readonly shuffled: readonly string[];
      readonly solution: readonly string[];
    }
  | { readonly kind: 'short'; readonly accepted: readonly string[] }
);

/** What the pupil answered: chosen indices, items in their order (or matched to each first item), or a text. */
export type Answer = readonly number[] | readonly string[] | string;

export interface QuizResult {
  readonly item: QuizItem;
  readonly right: boolean;
}

export type Mastery = 'à revoir' | 'en cours' | 'acquis';

export interface NotionScore {
  readonly notion: string;
  readonly asked: number;
  readonly right: number;
  readonly mastery: Mastery;
}
