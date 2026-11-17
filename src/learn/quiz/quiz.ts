import { formatIp, networkOf, prefixToMask } from '../../engine/core/ipv4';
import { fold } from '../content/merge';
import { LEVELS, type Level } from '../content/types';
import type { Answer, Mastery, NotionScore, Question, QuizItem, QuizResult } from './types';

/* Building, marking and summing up a quiz. Everything is deterministic: the
 * interface gives the seed, so that a test can replay any quiz. */

/** Small seeded generator (mulberry32): numbers in [0, 1). */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled copy (Fisher–Yates). */
export function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const [a, b] = [result[i] as T, result[j] as T];
    result[i] = b;
    result[j] = a;
  }
  return result;
}

const pick = (next: () => number, min: number, max: number) => min + Math.floor(next() * (max - min + 1));

const address = (a: number, b: number, c: number, d: number) => ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;

/** Another value of the same range, never the one given. */
function other(next: () => number, value: number, min: number, max: number): number {
  const span = max - min + 1;
  return min + ((value - min + pick(next, 1, span - 1)) % span);
}

/**
 * Two addresses and a mask: are they in the same network? Whatever the mask,
 * both answers come out, and the addresses differ where it matters: under
 * 255.255.0.0 a « yes » has two different third numbers, which is the trap.
 */
function sameNetworkItem(question: Question & { type: 'same-network' }, next: () => number): QuizItem {
  const masks = question.masks?.length ? question.masks : (['255.255.255.0'] as const);
  const wide = masks[Math.floor(next() * masks.length)] === '255.255.0.0';
  const mask = prefixToMask(wide ? 16 : 24);
  const same = next() < 0.5;
  const [b, c, d] = [wide ? pick(next, 16, 31) : 168, pick(next, 0, 9), pick(next, 1, 254)];
  const first = address(wide ? 172 : 192, b, c, d);
  const second = wide
    ? address(172, same ? b : other(next, b, 16, 31), other(next, c, 0, 9), pick(next, 1, 254))
    : address(192, 168, same ? c : other(next, c, 0, 9), other(next, d, 1, 254));
  const answer = networkOf(first, mask) === networkOf(second, mask);
  const part = (ip: number) =>
    formatIp(ip)
      .split('.')
      .slice(0, wide ? 2 : 3)
      .join('.');
  const rule = `avec le masque ${formatIp(mask)}, les ${wide ? 'deux' : 'trois'} premiers nombres désignent le réseau`;
  return {
    id: question.id,
    notion: question.notion,
    kind: 'choice',
    prompt: `${question.prompt} ${formatIp(first)} et ${formatIp(second)}, avec le masque ${formatIp(mask)}.`,
    choices: ['Oui, dans le même réseau', 'Non, dans deux réseaux différents'],
    correct: [answer ? 0 : 1],
    explanation: answer
      ? `Oui : ${rule}, et ils sont les mêmes pour les deux adresses (${part(first)}).`
      : `Non : ${rule} : ${part(first)} pour la première, ${part(second)} pour la seconde.`,
  };
}

/** Turns a question of the pack into what is shown: values drawn, choices shuffled. */
export function instantiate(question: Question, next: () => number): QuizItem {
  const base = {
    id: question.id,
    notion: question.notion,
    prompt: question.prompt,
    explanation: question.explanation,
  };
  switch (question.type) {
    case 'mcq': {
      const order = shuffle(
        question.choices.map((_, index) => index),
        next,
      );
      return {
        ...base,
        kind: 'choice',
        choices: order.map((index) => question.choices[index] ?? ''),
        correct: order.flatMap((index, position) => (question.correct.includes(index) ? [position] : [])),
      };
    }
    case 'order': {
      let shuffled = shuffle(question.items, next);
      // Never hand out the answer: an order left untouched by the draw is rotated.
      if (shuffled.every((item, i) => item === question.items[i]))
        shuffled = [...shuffled.slice(1), ...shuffled.slice(0, 1)];
      return { ...base, kind: 'order', shuffled, solution: question.items };
    }
    case 'match': {
      const solution = question.pairs.map(([, right]) => right);
      let shuffled = shuffle(solution, next);
      // The list offered must not already be in the order of the answers.
      if (shuffled.every((item, i) => item === solution[i]))
        shuffled = [...shuffled.slice(1), ...shuffled.slice(0, 1)];
      return { ...base, kind: 'match', lefts: question.pairs.map(([left]) => left), shuffled, solution };
    }
    case 'short':
      return { ...base, kind: 'short', accepted: question.accepted };
    case 'same-network':
      return sameNetworkItem(question, next);
  }
}

export interface QuizOptions {
  /** Questions up to this school year. */
  readonly level: Level;
  readonly count: number;
  readonly seed: number;
  /** Only the questions about this knowledge card. */
  readonly notion?: string | undefined;
}

/** Draws a quiz: at most `count` questions, spread over the notions before any is asked twice. */
export function buildQuiz(questions: readonly Question[], options: QuizOptions): QuizItem[] {
  const next = random(options.seed);
  const reach = LEVELS.indexOf(options.level);
  const pool = shuffle(
    questions.filter(
      (q) =>
        LEVELS.indexOf(q.level) <= reach && (options.notion === undefined || q.notion === options.notion),
    ),
    next,
  );
  const rounds: Question[][] = [];
  const seen = new Map<string, number>();
  for (const question of pool) {
    const round = seen.get(question.notion) ?? 0;
    seen.set(question.notion, round + 1);
    (rounds[round] ??= []).push(question);
  }
  return rounds
    .flat()
    .slice(0, Math.max(0, options.count))
    .map((question) => instantiate(question, next));
}

const sameItems = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** Whether an answer is right. */
export function grade(item: QuizItem, answer: Answer): boolean {
  switch (item.kind) {
    case 'choice': {
      if (!Array.isArray(answer)) return false;
      const chosen = [...new Set(answer as readonly unknown[])].filter(
        (v): v is number => typeof v === 'number',
      );
      return sameItems(
        [...chosen].sort((a, b) => a - b),
        [...item.correct].sort((a, b) => a - b),
      );
    }
    case 'order':
    case 'match':
      return Array.isArray(answer) && sameItems(answer, item.solution);
    case 'short':
      return typeof answer === 'string' && matchesShort(item.accepted, answer);
  }
}

/** An answer that is marked right: for a short one, the first text accepted. */
export function rightAnswer(item: QuizItem): Answer {
  switch (item.kind) {
    case 'choice':
      return item.correct;
    case 'order':
    case 'match':
      return item.solution;
    case 'short':
      return item.accepted[0] ?? '';
  }
}

/**
 * A short answer as it is compared: no accents, capitals or spaces (« 30 000 »,
 * « 10 h 00 »), no final punctuation, and a decimal comma read as a point.
 */
function canonical(text: string): string {
  return fold(text)
    .replace(/(\d),(?=\d)/g, '$1.')
    .replace(/\s+/g, '')
    .replace(/[.!?;:]+$/, '');
}

/** A number followed by words without any digit: « 4 routeurs », « 120 s ». */
const NUMBER_THEN_WORDS = /^(\d+(?:\.\d+)?)\D+$/;

/**
 * Whether a typed answer is one of the accepted ones. The way it is written
 * does not count (see `canonical`), and a number may be followed by its unit
 * when the bare number is expected: « 4 routeurs » for « 4 ». The number
 * itself must be the expected one: « 10h30 » is not « 10 », nor « 30 Ko »
 * « 30000 » — an equivalent in another unit has to be listed.
 */
export function matchesShort(accepted: readonly string[], given: string): boolean {
  const answer = canonical(given);
  const wanted = accepted.map(canonical);
  if (wanted.includes(answer)) return true;
  const bare = NUMBER_THEN_WORDS.exec(answer)?.[1];
  return bare !== undefined && wanted.includes(bare);
}

function mastery(asked: number, right: number): Mastery {
  if (right === asked) return 'acquis';
  return right * 2 >= asked ? 'en cours' : 'à revoir';
}

/** Results by knowledge card, the weakest first. */
export function summarize(results: readonly QuizResult[]): NotionScore[] {
  const byNotion = new Map<string, { asked: number; right: number }>();
  for (const result of results) {
    const score = byNotion.get(result.item.notion) ?? { asked: 0, right: 0 };
    byNotion.set(result.item.notion, { asked: score.asked + 1, right: score.right + (result.right ? 1 : 0) });
  }
  const rank: Record<Mastery, number> = { 'à revoir': 0, 'en cours': 1, acquis: 2 };
  return [...byNotion]
    .map(([notion, s]) => ({ notion, ...s, mastery: mastery(s.asked, s.right) }))
    .sort((a, b) => rank[a.mastery] - rank[b.mastery]);
}
