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

/** Two addresses and a mask: are they in the same network? */
function sameNetworkItem(question: Question, next: () => number): QuizItem {
  const prefix = next() < 0.75 ? 24 : 16;
  const mask = prefixToMask(prefix);
  const first = ((192 << 24) | (168 << 16) | (pick(next, 0, 9) << 8) | pick(next, 1, 254)) >>> 0;
  const same = next() < 0.5;
  // Differs either in the network part or only in the host part.
  let second = (first & 0xffffff00) | pick(next, 1, 254);
  if (!same) second = (second & 0xffff00ff) | (((((first >>> 8) & 0xff) + pick(next, 1, 5)) % 256) << 8);
  second >>>= 0;
  const answer = networkOf(first, mask) === networkOf(second, mask);
  const network = (ip: number) => formatIp(networkOf(ip, mask));
  return {
    id: question.id,
    notion: question.notion,
    kind: 'choice',
    prompt: `${question.prompt} ${formatIp(first)} et ${formatIp(second)}, avec le masque ${formatIp(mask)}.`,
    choices: ['Oui, dans le même réseau', 'Non, dans deux réseaux différents'],
    correct: [answer ? 0 : 1],
    explanation: answer
      ? `Oui : avec ce masque, les deux adresses ont la même partie réseau (${network(first)}).`
      : `Non : avec ce masque, la première est dans le réseau ${network(first)} et la seconde dans ${network(second)}.`,
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
      return Array.isArray(answer) && sameItems(answer, item.solution);
    case 'short':
      return typeof answer === 'string' && item.accepted.some((accepted) => fold(accepted) === fold(answer));
  }
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
