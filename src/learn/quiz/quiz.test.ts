import { DEFAULT_PACK } from '../content/default-pack';
import { LEVELS } from '../content/types';
import { buildQuiz, grade, instantiate, matchesShort, random, rightAnswer, shuffle, summarize } from './quiz';
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
const match: Question = {
  id: 'q-match',
  notion: 'protocole',
  level: '3e',
  type: 'match',
  prompt: 'Associe.',
  pairs: [
    ['IP', 'acheminer'],
    ['HTTP', 'demander une page'],
    ['DNS', 'traduire un nom'],
  ],
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

  test('association : les premiers éléments gardent leur ordre, les propositions sont mélangées', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const item = instantiate(match, random(seed));
      if (item.kind !== 'match') throw new Error('association attendue');
      expect(item.lefts).toEqual(['IP', 'HTTP', 'DNS']);
      expect(item.solution).toEqual(['acheminer', 'demander une page', 'traduire un nom']);
      expect([...item.shuffled].sort()).toEqual([...item.solution].sort());
      // La liste proposée ne donne jamais la réponse par son ordre.
      expect(item.shuffled).not.toEqual(item.solution);
    }
  });

  test('« même réseau ? » : adresses tirées, réponse et explication calculées', () => {
    const drawn = (question: Question, seeds: number) => {
      const seen = new Set<string>();
      for (let seed = 1; seed <= seeds; seed++) {
        const item = instantiate(question, random(seed));
        if (item.kind !== 'choice') throw new Error('choix attendu');
        const match =
          /(\d+\.\d+\.\d+\.\d+) et (\d+\.\d+\.\d+\.\d+), avec le masque (255\.255\.(?:255|0)\.0)\./.exec(
            item.prompt,
          );
        expect(match, item.prompt).not.toBeNull();
        const [, first = '', second = '', mask = ''] = match ?? [];
        const wide = mask === '255.255.0.0';
        const part = (address: string) =>
          address
            .split('.')
            .slice(0, wide ? 2 : 3)
            .join('.');
        const same = part(first) === part(second);
        expect(item.correct, item.prompt).toEqual([same ? 0 : 1]);
        expect(item.explanation.startsWith(same ? 'Oui' : 'Non')).toBe(true);
        expect(item.explanation).toContain(`les ${wide ? 'deux' : 'trois'} premiers nombres`);
        expect(item.explanation).toContain(part(first));
        expect(first).not.toBe(second);
        // Avec 255.255.0.0, le troisième nombre diffère toujours : c'est le piège à déjouer.
        if (wide) expect(first.split('.')[2], item.prompt).not.toBe(second.split('.')[2]);
        seen.add(`${mask} ${same ? 'oui' : 'non'}`);
      }
      return [...seen].sort();
    };
    // Sans précision : seulement le masque enseigné par les fiches, et les deux réponses sortent.
    expect(drawn(generated, 300)).toEqual(['255.255.255.0 non', '255.255.255.0 oui']);
    // 255.255.0.0 se demande ; là aussi les deux réponses sortent (bilan B4 : c'était toujours « oui »).
    expect(drawn({ ...generated, masks: ['255.255.0.0'] }, 300)).toEqual([
      '255.255.0.0 non',
      '255.255.0.0 oui',
    ]);
    expect(drawn({ ...generated, masks: ['255.255.255.0', '255.255.0.0'] }, 300)).toHaveLength(4);
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

  test('association : chaque élément avec sa proposition, tous', () => {
    const pairs = instantiate(match, random(1));
    expect(grade(pairs, ['acheminer', 'demander une page', 'traduire un nom'])).toBe(true);
    expect(grade(pairs, ['demander une page', 'acheminer', 'traduire un nom'])).toBe(false);
    expect(grade(pairs, ['acheminer', 'demander une page', ''])).toBe(false);
    expect(grade(pairs, ['acheminer', 'demander une page'])).toBe(false);
    expect(grade(pairs, 'acheminer')).toBe(false);
  });

  test('une réponse juste existe pour chaque forme de question', () => {
    for (const question of [mcq, order, match, short, generated])
      for (let seed = 1; seed <= 5; seed++) {
        const item = instantiate(question, random(seed));
        expect(grade(item, rightAnswer(item))).toBe(true);
      }
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

describe('Réponses courtes : l’écriture ne compte pas, le nombre oui', () => {
  test('espaces, majuscules, accents, ponctuation finale et virgule décimale', () => {
    expect(matchesShort(['10h00'], '10 h 00')).toBe(true);
    expect(matchesShort(['10h00'], ' 10H00. ')).toBe(true);
    expect(matchesShort(['30000'], '30 000')).toBe(true);
    // Espaces insécables d'un nombre recopié.
    expect(matchesShort(['30000'], '30\u00a0000')).toBe(true);
    expect(matchesShort(['30000'], '30\u202f000')).toBe(true);
    expect(matchesShort(['pour cent'], 'Pourcent')).toBe(true);
    expect(matchesShort(['1,5'], '1.5')).toBe(true);
    expect(matchesShort(['1.5'], '1,5 !')).toBe(true);
    expect(matchesShort(['Réseau'], 'reseau')).toBe(true);
    expect(matchesShort(['192.168.10'], '192.168.10.')).toBe(true);
    expect(matchesShort(['%'], ' % ')).toBe(true);
  });

  test('un nombre attendu peut être suivi de son unité', () => {
    expect(matchesShort(['4', 'quatre'], '4 routeurs')).toBe(true);
    expect(matchesShort(['8', 'huit'], '8 bits')).toBe(true);
    expect(matchesShort(['120'], '120 s')).toBe(true);
    expect(matchesShort(['120'], '120secondes.')).toBe(true);
    expect(matchesShort(['30000'], '30 000 octets')).toBe(true);
    expect(matchesShort(['10'], '10 h')).toBe(true);
    // Une équivalence dans une autre unité se liste.
    expect(matchesShort(['30000'], '30 Ko')).toBe(false);
    expect(matchesShort(['30000', '30 Ko'], '30 ko')).toBe(true);
  });

  test('mais un autre nombre, ou une réponse plus longue, reste faux', () => {
    expect(matchesShort(['10'], '10h30')).toBe(false);
    expect(matchesShort(['10'], '10:30')).toBe(false);
    expect(matchesShort(['4'], '4 ou 5')).toBe(false);
    expect(matchesShort(['4'], '4,5')).toBe(false);
    expect(matchesShort(['4'], '14')).toBe(false);
    expect(matchesShort(['4'], '40 routeurs')).toBe(false);
    expect(matchesShort(['4'], 'routeurs')).toBe(false);
    expect(matchesShort(['4'], '')).toBe(false);
    expect(matchesShort(['192.168.10'], '192.168.10.1')).toBe(false);
    expect(matchesShort(['192.168.10.1'], '192.168.10.1 et 192.168.10.2')).toBe(false);
    // Seul un nombre accepte une suite : pas un mot.
    expect(matchesShort(['png'], 'png ou jpg')).toBe(false);
  });

  test('chaque réponse courte fournie est acceptée telle qu’elle est écrite', () => {
    for (const question of DEFAULT_PACK.questions)
      if (question.type === 'short')
        for (const accepted of question.accepted)
          expect(matchesShort(question.accepted, accepted), question.id).toBe(true);
  });
});
