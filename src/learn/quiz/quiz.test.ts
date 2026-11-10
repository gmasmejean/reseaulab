import { DEFAULT_PACK } from '../content/default-pack';
import { LEVELS } from '../content/types';
import { buildQuiz, grade, instantiate, random, shuffle, summarize } from './quiz';
import type { Question, QuizItem } from './types';

const mcq: Question = {
  id: 'q-mcq',
  notion: 'switch',
  level: '5e',
  type: 'mcq',
  prompt: 'Lesquels ?',
  choices: ['A', 'B', 'C', 'D'],
  correct: [0, 2],
  explanation: 'A et C.',
};
const order: Question = {
  id: 'q-order',
  notion: 'couches',
  level: '3e',
  type: 'order',
  prompt: 'Dans l’ordre.',
  items: ['un', 'deux', 'trois'],
  explanation: '',
};
const short: Question = {
  id: 'q-short',
  notion: 'adresse-ip',
  level: '4e',
  type: 'short',
  prompt: 'Combien ?',
  accepted: ['4', 'quatre'],
  explanation: '',
};
const generated: Question = {
  id: 'q-gen',
  notion: 'masque',
  level: '4e',
  type: 'same-network',
  prompt: 'Même réseau ?',
  explanation: '',
};

describe('Tirage du quiz', () => {
  test('le même numéro de tirage donne le même quiz', () => {
    const a = random(42);
    const b = random(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(random(43)()).not.toBe(random(42)());
    const items = [1, 2, 3, 4, 5, 6];
    expect(shuffle(items, random(7))).toEqual(shuffle(items, random(7)));
    expect([...shuffle(items, random(7))].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    const quiz = (seed: number) => buildQuiz(DEFAULT_PACK.questions, { level: '3e', count: 8, seed });
    expect(quiz(1)).toEqual(quiz(1));
    expect(quiz(1).map((q) => q.id)).not.toEqual(quiz(2).map((q) => q.id));
  });

  test('ne pose que des questions du niveau, sur des notions différentes d’abord', () => {
    const five = buildQuiz(DEFAULT_PACK.questions, { level: '5e', count: 50, seed: 3 });
    const levelOf = (id: string) => DEFAULT_PACK.questions.find((q) => q.id === id)?.level;
    expect(five.length).toBeGreaterThanOrEqual(8);
    expect(five.every((q) => levelOf(q.id) === '5e')).toBe(true);
    const eight = buildQuiz(DEFAULT_PACK.questions, { level: '4e', count: 8, seed: 5 });
    expect(eight).toHaveLength(8);
    // Huit questions, huit notions : aucune n'est posée deux fois tant que d'autres attendent.
    expect(new Set(eight.map((q) => q.notion)).size).toBe(8);
    expect(buildQuiz(DEFAULT_PACK.questions, { level: '3e', count: 0, seed: 1 })).toEqual([]);
  });

  test('peut porter sur une seule notion', () => {
    const quiz = buildQuiz(DEFAULT_PACK.questions, { level: '3e', count: 10, seed: 9, notion: 'adresse-ip' });
    expect(quiz.length).toBeGreaterThanOrEqual(2);
    expect(quiz.every((q) => q.notion === 'adresse-ip')).toBe(true);
    // Une notion au-dessus du niveau demandé n'a pas de question.
    expect(
      buildQuiz(DEFAULT_PACK.questions, { level: '5e', count: 10, seed: 9, notion: 'passerelle' }),
    ).toEqual([]);
  });

  test('mélange les choix en gardant les bonnes réponses', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const item = instantiate(mcq, random(seed));
      expect(item.kind).toBe('choice');
      if (item.kind !== 'choice') continue;
      expect([...item.choices].sort()).toEqual(['A', 'B', 'C', 'D']);
      expect(item.correct.map((i) => item.choices[i]).sort()).toEqual(['A', 'C']);
    }
  });

  test('ne présente jamais une liste à ordonner déjà dans l’ordre', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const item = instantiate(order, random(seed));
      if (item.kind !== 'order') throw new Error('ordre attendu');
      expect(item.solution).toEqual(['un', 'deux', 'trois']);
      expect([...item.shuffled].sort()).toEqual(['deux', 'trois', 'un']);
      expect(item.shuffled).not.toEqual(item.solution);
    }
  });

  test('« même réseau ? » : adresses tirées, réponse et explication calculées', () => {
    const answers = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const item = instantiate(generated, random(seed));
      if (item.kind !== 'choice') throw new Error('choix attendu');
      const match =
        /(\d+\.\d+\.\d+\.\d+) et (\d+\.\d+\.\d+\.\d+), avec le masque (255\.255\.(?:255|0)\.0)\./.exec(
          item.prompt,
        );
      expect(match, item.prompt).not.toBeNull();
      const [, first = '', second = '', mask = ''] = match ?? [];
      const part = (address: string) =>
        address
          .split('.')
          .slice(0, mask === '255.255.255.0' ? 3 : 2)
          .join('.');
      const same = part(first) === part(second);
      expect(item.correct, item.prompt).toEqual([same ? 0 : 1]);
      expect(item.explanation.startsWith(same ? 'Oui' : 'Non')).toBe(true);
      expect(first).not.toBe(second);
      answers.add(item.correct[0] ?? -1);
    }
    // Les deux réponses sortent.
    expect([...answers].sort()).toEqual([0, 1]);
  });
});

describe('Correction', () => {
  const choice = instantiate(mcq, random(1));
  const sequence = instantiate(order, random(1));
  const text = instantiate(short, random(1));

  test('choix : toutes les bonnes réponses, et elles seules', () => {
    if (choice.kind !== 'choice') throw new Error('choix attendu');
    const [a, c] = choice.correct;
    const wrong = [0, 1, 2, 3].find((i) => !choice.correct.includes(i)) ?? -1;
    expect(grade(choice, [...choice.correct])).toBe(true);
    expect(grade(choice, [c ?? 0, a ?? 0, a ?? 0])).toBe(true);
    expect(grade(choice, [a ?? 0])).toBe(false);
    expect(grade(choice, [...choice.correct, wrong])).toBe(false);
    expect(grade(choice, [])).toBe(false);
    expect(grade(choice, 'A')).toBe(false);
  });

  test('ordre : la suite exacte', () => {
    expect(grade(sequence, ['un', 'deux', 'trois'])).toBe(true);
    expect(grade(sequence, ['un', 'trois', 'deux'])).toBe(false);
    expect(grade(sequence, ['un', 'deux'])).toBe(false);
    expect(grade(sequence, 'un')).toBe(false);
  });

  test('réponse courte : sans tenir compte des accents, des majuscules ni des espaces', () => {
    expect(grade(text, '4')).toBe(true);
    expect(grade(text, '  QUATRE ')).toBe(true);
    expect(grade(text, 'cinq')).toBe(false);
    expect(grade(text, [0])).toBe(false);
  });
});

describe('Bilan par notion', () => {
  const item = (notion: string): QuizItem => ({
    id: `${notion}-x`,
    notion,
    prompt: '',
    explanation: '',
    kind: 'short',
    accepted: ['x'],
  });

  test('acquis, en cours, à revoir ; les notions à revoir d’abord', () => {
    const summary = summarize([
      { item: item('switch'), right: true },
      { item: item('masque'), right: true },
      { item: item('masque'), right: false },
      { item: item('passerelle'), right: false },
      { item: item('passerelle'), right: false },
      { item: item('passerelle'), right: true },
      { item: item('switch'), right: true },
    ]);
    expect(summary).toEqual([
      { notion: 'passerelle', asked: 3, right: 1, mastery: 'à revoir' },
      { notion: 'masque', asked: 2, right: 1, mastery: 'en cours' },
      { notion: 'switch', asked: 2, right: 2, mastery: 'acquis' },
    ]);
    expect(summarize([])).toEqual([]);
  });
});

describe('Questions fournies', () => {
  const questions = DEFAULT_PACK.questions;
  const notions = new Map(DEFAULT_PACK.notions.map((n) => [n.id, n]));

  test('identifiants uniques, notion existante et de même niveau au plus', () => {
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    expect(questions.length).toBeGreaterThanOrEqual(28);
    for (const question of questions) {
      const notion = notions.get(question.notion);
      expect(notion, question.id).toBeDefined();
      // Une question n'est pas posée avant que sa notion soit abordée.
      expect(LEVELS.indexOf(question.level), question.id).toBeGreaterThanOrEqual(
        LEVELS.indexOf(notion?.level ?? '5e'),
      );
      expect(question.prompt.length, question.id).toBeGreaterThan(10);
    }
  });

  test('chaque niveau a de quoi faire un quiz ; chaque notion (hors prise en main) a une question', () => {
    for (const level of LEVELS) {
      expect(questions.filter((q) => q.level === level).length, level).toBeGreaterThanOrEqual(8);
    }
    const asked = new Set(questions.map((q) => q.notion));
    const without = DEFAULT_PACK.notions
      .filter((n) => n.category !== 'guide' && !asked.has(n.id))
      .map((n) => n.id);
    expect(without).toEqual([]);
  });

  test('questions à choix : une explication, des choix distincts, des bonnes réponses qui existent', () => {
    for (const question of questions) {
      if (question.type === 'same-network') continue;
      expect(question.explanation.length, question.id).toBeGreaterThan(15);
      if (question.type !== 'mcq') continue;
      expect(new Set(question.choices).size, question.id).toBe(question.choices.length);
      expect(question.correct.length, question.id).toBeGreaterThanOrEqual(1);
      expect(
        question.correct.every((i) => i >= 0 && i < question.choices.length),
        question.id,
      ).toBe(true);
      // Une question à plusieurs réponses le dit dans son énoncé.
      if (question.correct.length > 1) expect(question.prompt, question.id).toContain('plusieurs réponses');
    }
  });
});
