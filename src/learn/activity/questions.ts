import { grade, instantiate, random } from '../quiz/quiz';
import type { Answer, QuizItem } from '../quiz/types';
import type { Activity, ActivityQuestion, Objective, QuestionAnswer, Step, Work } from './schema';

/* Questions asked along an activity. They are drawn and marked as in the quiz
 * (src/learn/quiz), but answered once: the pupil sees the correction at once
 * and the answer is kept in the work, with the question as it was put. */

/** A number from a text (FNV-1a), so that each question gets its own draw. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * The question as put to the pupil: choices shuffled, addresses drawn. The
 * same objective and the same start of work give the same draw, so that a
 * page redrawn does not change the question under the pupil's eyes. Null for
 * an open question, which has nothing to draw.
 */
export function askQuestion(objectiveId: string, question: ActivityQuestion, salt: number): QuizItem | null {
  if (question.type === 'open') return null;
  const base = {
    id: objectiveId,
    notion: question.notion ?? '',
    level: '5e' as const,
    prompt: question.prompt,
    explanation: question.explanation,
  };
  const next = random((hash(objectiveId) ^ salt) >>> 0);
  switch (question.type) {
    case 'mcq':
      return instantiate(
        { ...base, type: 'mcq', choices: question.choices, correct: question.correct },
        next,
      );
    case 'order':
      return instantiate({ ...base, type: 'order', items: question.items }, next);
    case 'short':
      return instantiate({ ...base, type: 'short', accepted: question.accepted }, next);
    case 'same-network':
      return instantiate({ ...base, type: 'same-network' }, next);
  }
}

/** The draw of a work: fixed from its start. */
export function drawSalt(work: Work): number {
  return Math.floor(work.startedAt ?? 0) >>> 0;
}

/** Whether an answer has the form the question expects (indices, items or a text). */
export function fitsQuestion(item: QuizItem | null, given: Answer): boolean {
  if (item === null || item.kind === 'short') return typeof given === 'string';
  if (!Array.isArray(given)) return false;
  const values = given as readonly unknown[];
  return item.kind === 'choice'
    ? values.every((v) => typeof v === 'number')
    : values.every((v) => typeof v === 'string');
}

/** Marks an answer: right or wrong, or null for an open question. */
export function markAnswer(item: QuizItem | null, given: Answer, at: number): QuestionAnswer {
  if (item === null) return { given: typeof given === 'string' ? given.trim() : '', right: null, at };
  const kept: QuestionAnswer['given'] =
    typeof given === 'string' ? given : (given.map((v) => v) as number[] | string[]);
  return { item: stored(item), given: kept, right: grade(item, given), at };
}

/** A copy of the question as put, to keep in the work. */
function stored(item: QuizItem): NonNullable<QuestionAnswer['item']> {
  switch (item.kind) {
    case 'choice':
      return { ...item, choices: [...item.choices], correct: [...item.correct] };
    case 'order':
      return { ...item, shuffled: [...item.shuffled], solution: [...item.solution] };
    case 'short':
      return { ...item, accepted: [...item.accepted] };
  }
}

/** What the pupil answered, in words. */
export function givenText(answer: QuestionAnswer): string {
  const { item, given } = answer;
  if (typeof given === 'string') return given;
  if (item?.kind === 'choice') {
    return given
      .map((index) => (typeof index === 'number' ? (item.choices[index] ?? '') : index))
      .join(' ; ');
  }
  return given.map(String).join(' → ');
}

/** The question objectives of some steps. */
export function questionsOf(steps: readonly Step[]): Objective[] {
  return steps.flatMap((s) => s.objectives).filter((o) => o.check.type === 'question');
}

export interface QuestionScore {
  /** Marked questions answered right. */
  readonly right: number;
  /** Marked questions answered. */
  readonly marked: number;
  /** Questions answered, open ones included. */
  readonly answered: number;
  readonly total: number;
}

/** How the questions of some steps were answered. */
export function scoreQuestions(steps: readonly Step[], work: Work): QuestionScore {
  const questions = questionsOf(steps);
  const answers = questions.map((o) => work.answers[o.id]).filter((a) => a !== undefined);
  const marked = answers.filter((a) => a.right !== null);
  return {
    right: marked.filter((a) => a.right === true).length,
    marked: marked.length,
    answered: answers.length,
    total: questions.length,
  };
}

/** The parts of an activity: consecutive steps under one title, the bonus steps apart. */
export function partsOf(activity: Activity): { title: string | null; bonus: boolean; steps: Step[] }[] {
  const parts: { title: string | null; bonus: boolean; steps: Step[] }[] = [];
  for (const step of activity.steps) {
    const bonus = step.bonus === true;
    const last = parts.at(-1);
    if (last?.bonus === bonus && step.part === undefined) last.steps.push(step);
    else parts.push({ title: step.part ?? (bonus ? 'Bonus' : null), bonus, steps: [step] });
  }
  return parts;
}
