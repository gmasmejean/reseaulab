import { partsOf } from './questions';
import {
  familyOf,
  isOptionalStep,
  type Activity,
  type ActivityQuestion,
  type Objective,
  type Step,
} from './schema';

/* The answer key of an activity (« Corrigé »): what each step expects, the
 * right answer and the explanation of every question, and how the lesson may
 * unfold. The teacher reads all of it; the correction handed out to the
 * pupils leaves out what is marked as being for the teacher. It is built from
 * the activity itself, so that it never tells something else than what the
 * pupils are asked. */

/** A question as the teacher reads it: what is asked and what is expected. */
export interface KeyQuestion {
  /** « Choix », « Association »… */
  readonly kind: string;
  readonly prompt: string;
  /** The right answer, one line each (choices, items in order, pairs). */
  readonly expected: readonly string[];
  /** Whether `expected` is a sequence: the lines are numbered. */
  readonly ordered: boolean;
  /** The pairs of an association, left and right; empty for the other forms. */
  readonly pairs: readonly (readonly [string, string])[];
  /** What else the pupil may read about the answer: other texts accepted. */
  readonly notes: readonly string[];
  /** For the teacher only: wrong choices offered, how the answer is marked, what is drawn. */
  readonly marking: readonly string[];
  readonly explanation: string;
  /** False for an open question, read by the teacher on the report. */
  readonly marked: boolean;
}

export interface KeyObjective {
  readonly id: string;
  readonly label: string;
  /** For something to do: how RéseauLab checks it. Absent for a question. */
  readonly how?: string;
  readonly question?: KeyQuestion;
}

export interface KeyStep {
  readonly id: string;
  /** « 3 », or « B1 » for the first bonus step. */
  readonly number: string;
  readonly title: string;
  readonly body: string;
  readonly optional: boolean;
  /** What there was to do or to find (formatted text), for the teacher and for the pupils; empty when there is none. */
  readonly solution: string;
  /** A remark for the teacher alone (formatted text); empty when there is none. */
  readonly teacherNote: string;
  readonly hints: readonly string[];
  /** Identifiers of the knowledge cards of the step. */
  readonly notions: readonly string[];
  readonly objectives: readonly KeyObjective[];
  /** Things to do and questions, counted. */
  readonly checks: number;
  readonly questions: number;
  /** Share of the duration of the activity, in minutes; null for a bonus step or without a duration. */
  readonly minutes: number | null;
}

export interface KeyPart {
  readonly title: string | null;
  readonly note: string;
  readonly bonus: boolean;
  readonly steps: readonly KeyStep[];
  /** Sum of the minutes of its steps; null as for a step. */
  readonly minutes: number | null;
}

const HOW: Record<ReturnType<typeof familyOf>, string> = {
  state: 'se valide tout seul, dès que le plan est bon',
  probe: 'se valide avec « Vérifier mon travail »',
  journal: 'se valide quand l’élève l’a fait en simulation',
};

/** What a question expects, in words. */
export function keyQuestion(question: ActivityQuestion): KeyQuestion {
  const base = {
    prompt: question.prompt,
    explanation: question.explanation,
    ordered: false,
    marked: true,
    pairs: [],
    notes: [],
    marking: [],
  };
  switch (question.type) {
    case 'mcq': {
      const wrong = question.choices.filter((_, index) => !question.correct.includes(index));
      return {
        ...base,
        kind: question.correct.length > 1 ? 'Choix (plusieurs réponses)' : 'Choix',
        expected: question.correct.map((index) => question.choices[index] ?? ''),
        marking: wrong.length > 0 ? [`Autres choix proposés : ${wrong.join(' ; ')}.`] : [],
      };
    }
    case 'order':
      return { ...base, kind: 'Remise en ordre', expected: question.items, ordered: true };
    case 'match':
      return {
        ...base,
        kind: 'Association',
        expected: question.pairs.map(([left, right]) => `${left} : ${right}`),
        pairs: question.pairs,
      };
    case 'short': {
      const [first = '', ...others] = question.accepted;
      return {
        ...base,
        kind: 'Réponse courte',
        expected: [first],
        notes: others.length > 0 ? [`Aussi acceptées : ${others.join(' ; ')}.`] : [],
        marking: [
          'Majuscules, accents, espaces et ponctuation finale ne comptent pas ; un nombre peut être suivi de son unité.',
        ],
      };
    }
    case 'same-network': {
      const masks = question.masks?.length ? question.masks : ['255.255.255.0'];
      return {
        ...base,
        kind: 'Même réseau ? (tirage)',
        expected: [
          'Oui si les nombres désignés par le masque sont les mêmes dans les deux adresses, non sinon.',
        ],
        marking: [
          `Deux adresses sont tirées au sort pour chaque élève, avec le masque ${masks.join(' ou ')} : la correction affichée à l’élève détaille son tirage.`,
        ],
      };
    }
    case 'open':
      return {
        ...base,
        kind: 'Réponse rédigée',
        expected: [],
        marking: ['Non notée : à lire sur le compte rendu de l’élève (au moins trois mots sont demandés).'],
        marked: false,
      };
  }
}

function keyObjective(objective: Objective): KeyObjective {
  const { check } = objective;
  if (check.type === 'question')
    return { id: objective.id, label: objective.label, question: keyQuestion(check.question) };
  return { id: objective.id, label: objective.label, how: HOW[familyOf(check)] };
}

/** Weight of a step in the duration: reading it, doing, answering. */
const WEIGHT = { step: 1, check: 2, question: 1 } as const;

function weightOf(step: Step): number {
  const questions = step.objectives.filter((o) => o.check.type === 'question').length;
  return WEIGHT.step + WEIGHT.question * questions + WEIGHT.check * (step.objectives.length - questions);
}

/**
 * The duration of the activity shared between its steps (bonus left out),
 * according to what each one asks: an estimate to prepare the lesson, not a
 * measure. The minutes add up to the duration. Empty without a duration.
 */
export function estimateMinutes(activity: Activity): Map<string, number> {
  const minutes = new Map<string, number>();
  const steps = activity.steps.filter((step) => step.bonus !== true);
  const total = steps.reduce((sum, step) => sum + weightOf(step), 0);
  if (activity.duration === undefined || total === 0) return minutes;
  // Largest remainders: whole minutes that still add up to the duration.
  const shares = steps.map((step) => (activity.duration ?? 0) * (weightOf(step) / total));
  let left = activity.duration - shares.reduce((sum, share) => sum + Math.floor(share), 0);
  const byRemainder = shares
    .map((share, index) => ({ index, rest: share - Math.floor(share) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  const extra = new Set<number>();
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    extra.add(index);
    left--;
  }
  steps.forEach((step, index) => {
    minutes.set(step.id, Math.floor(shares[index] ?? 0) + (extra.has(index) ? 1 : 0));
  });
  return minutes;
}

/** The answer key of an activity, part by part. */
export function answerKey(activity: Activity): KeyPart[] {
  const minutes = estimateMinutes(activity);
  let bonus = 0;
  const numberOf = (step: Step) =>
    step.bonus === true ? `B${++bonus}` : String(activity.steps.indexOf(step) + 1);
  return partsOf(activity).map((part) => {
    const steps = part.steps.map((step): KeyStep => {
      const objectives = step.objectives.map(keyObjective);
      const questions = objectives.filter((o) => o.question !== undefined).length;
      return {
        id: step.id,
        number: numberOf(step),
        title: step.title,
        body: step.body,
        optional: isOptionalStep(step),
        solution: step.solution ?? '',
        teacherNote: step.teacherNote ?? '',
        hints: step.hints,
        notions: step.notions,
        objectives,
        checks: objectives.length - questions,
        questions,
        minutes: minutes.get(step.id) ?? null,
      };
    });
    const timed = steps.every((step) => step.minutes !== null);
    return {
      title: part.title,
      note: part.note,
      bonus: part.bonus,
      steps,
      minutes: timed ? steps.reduce((sum, step) => sum + (step.minutes ?? 0), 0) : null,
    };
  });
}
