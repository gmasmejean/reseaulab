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
        /** A word or a number to type; accents and capitals do not matter. */
        readonly type: 'short';
        readonly accepted: readonly string[];
      }
    | {
        /** « Are these two addresses in the same network? », with new addresses each time. */
        readonly type: 'same-network';
      }
  );

/** A question as put to the pupil: generated values drawn, choices shuffled. */
export type QuizItem = {
  readonly id: string;
  readonly notion: string;
  readonly prompt: string;
  readonly explanation: string;
} & (
  | { readonly kind: 'choice'; readonly choices: readonly string[]; readonly correct: readonly number[] }
  | { readonly kind: 'order'; readonly shuffled: readonly string[]; readonly solution: readonly string[] }
  | { readonly kind: 'short'; readonly accepted: readonly string[] }
);

/** What the pupil answered: chosen indices, items in their order, or a text. */
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
