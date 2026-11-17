import { Network } from '../../engine/network';
import { parseLearnFile, serializeLearnFile } from '../file';
import { currentStep, evaluateNow, gateSteps, isSkipped } from './evaluate';
import {
  OPEN_MIN_WORDS,
  askQuestion,
  askRetry,
  canRetry,
  givenParts,
  givenText,
  isOpenAnswer,
  isSettled,
  markAnswer,
  markRetry,
  partsOf,
  scoreQuestions,
} from './questions';
import { rightAnswer } from '../quiz/quiz';
import type { Answer } from '../quiz/types';
import { MATCH_QUESTION, OPTIONAL, QUESTIONS, SWITCH_QUESTION as mcq } from '../../test/activities';
import {
  EMPTY_WORK,
  activitySchema,
  familyOf,
  optionalObjectives,
  requiredObjectives,
  type Activity,
  type ActivityInput,
  type Work,
} from './schema';

const parse = (input: ActivityInput): Activity => activitySchema.parse(input);

/** Answers a question of the activity, rightly unless `wrong`. */
function answer(activity: Activity, work: Work, id: string, wrong = false): Work {
  const objective = requiredObjectives(activity).find((o) => o.id === id);
  if (objective?.check.type !== 'question') throw new Error(id);
  const item = askQuestion(id, objective.check.question, 7);
  let given: Answer;
  if (item === null) given = 'Pour que le message arrive au bon destinataire.';
  else if (item.kind === 'choice') given = wrong ? [item.correct.includes(0) ? 1 : 0] : [...item.correct];
  else if (item.kind === 'order' || item.kind === 'match') given = wrong ? item.shuffled : item.solution;
  else given = wrong ? 'je ne sais pas' : rightAnswer(item);
  return { ...work, answers: { ...work.answers, [id]: markAnswer(item, given, 1000) } };
}

describe('Questions dans une activité', () => {
  test('format : questions valides, mauvaise réponse désignée, étapes bonus à la fin', () => {
    const activity = parse(QUESTIONS);
    expect(activity.steps[0]?.part).toBe('Partie 1 — Révisions');
    const check = activity.steps[0]?.objectives[0]?.check;
    expect(check && familyOf(check)).toBe('journal');

    const wrongIndex = structuredClone<ActivityInput>(QUESTIONS);
    const first = wrongIndex.steps[0]?.objectives?.[0];
    if (first) first.check = { type: 'question', question: { ...mcq, correct: [5] } };
    expect(activitySchema.safeParse(wrongIndex).success).toBe(false);

    const bonusFirst = { ...QUESTIONS, steps: [...QUESTIONS.steps].reverse() };
    expect(activitySchema.safeParse(bonusFirst).success).toBe(false);
    const bonusInMiddle = {
      ...QUESTIONS,
      steps: [QUESTIONS.steps[0], QUESTIONS.steps[2], QUESTIONS.steps[1]],
    };
    expect(activitySchema.safeParse(bonusInMiddle).success).toBe(false);
  });

  test('une question est atteinte dès qu’elle a une réponse, juste ou fausse', () => {
    const activity = parse(QUESTIONS);
    const network = new Network();
    let work = EMPTY_WORK;
    expect(evaluateNow(activity, network, work).get('q-switch')).toEqual({ status: 'todo' });
    // Une mauvaise réponse : la question est faite (un seul essai), notée fausse.
    work = answer(activity, work, 'q-switch', true);
    expect(work.answers['q-switch']?.right).toBe(false);
    work = answer(activity, work, 'q-pourquoi');
    expect(work.answers['q-pourquoi']?.right).toBeNull();
    const outcomes = gateSteps(activity, evaluateNow(activity, network, work));
    expect(outcomes.get('q-switch')).toEqual({ status: 'done' });
    expect(outcomes.get('q-pourquoi')).toEqual({ status: 'done' });
    expect(outcomes.get('q-reseau')).toEqual({ status: 'todo' });
    expect(outcomes.get('q-ordre')).toEqual({ status: 'locked' });
  });

  test('les étapes bonus ne comptent pas pour finir ; elles s’ouvrent ensuite', () => {
    const activity = parse(QUESTIONS);
    expect(requiredObjectives(activity).map((o) => o.id)).toEqual([
      'q-switch',
      'q-pourquoi',
      'q-reseau',
      'q-meme-reseau',
    ]);
    let work = EMPTY_WORK;
    for (const id of ['q-switch', 'q-pourquoi', 'q-reseau', 'q-meme-reseau'])
      work = answer(activity, work, id);
    const outcomes = gateSteps(activity, evaluateNow(activity, new Network(), work));
    expect(outcomes.get('q-ordre')).toEqual({ status: 'todo' });
    const done = new Set([...outcomes].filter(([, o]) => o.status === 'done').map(([id]) => id));
    expect(currentStep(activity, done)).toBe(2);
  });

  test('tirage : le même pour un même travail, un autre pour un autre travail', () => {
    const activity = parse(QUESTIONS);
    const check = activity.steps[1]?.objectives[1]?.check;
    if (check?.type !== 'question') throw new Error('question attendue');
    const a = askQuestion('q-meme-reseau', check.question, 1);
    expect(askQuestion('q-meme-reseau', check.question, 1)).toEqual(a);
    const prompts = new Set(
      [2, 3, 4, 5, 6].map((salt) => askQuestion('q-meme-reseau', check.question, salt)?.prompt),
    );
    expect(prompts.size).toBeGreaterThan(1);
    expect(a?.id).toBe('q-meme-reseau');
    expect(a?.kind).toBe('choice');
  });

  test('« même réseau ? » : 255.255.255.0 seulement, sauf si l’activité demande un autre masque', () => {
    const activity = parse(QUESTIONS);
    const check = activity.steps[1]?.objectives[1]?.check;
    if (check?.type !== 'question' || check.question.type !== 'same-network')
      throw new Error('question attendue');
    const question = check.question;
    const masks = (asked: typeof question) =>
      new Set(
        Array.from(
          { length: 200 },
          (_, salt) =>
            /masque ([\d.]+)\.$/.exec(askQuestion('q-meme-reseau', asked, salt)?.prompt ?? '')?.[1],
        ),
      );
    expect([...masks(question)]).toEqual(['255.255.255.0']);
    expect([...masks({ ...question, masks: ['255.255.0.0'] })]).toEqual(['255.255.0.0']);
    expect(masks({ ...question, masks: ['255.255.255.0', '255.255.0.0'] }).size).toBe(2);

    // Un masque que le tirage ne connaît pas est refusé à l'ouverture du fichier.
    const unknown = structuredClone<ActivityInput>(QUESTIONS);
    const objective = unknown.steps[1]?.objectives?.[1];
    if (objective)
      objective.check = {
        type: 'question',
        question: { ...question, masks: ['255.0.0.0'] as unknown as ['255.255.0.0'] },
      };
    expect(activitySchema.safeParse(unknown).success).toBe(false);
  });

  test('correction : choix, ordre, réponse courte (sans accents ni majuscules), réponse libre', () => {
    const activity = parse(QUESTIONS);
    const question = (step: number, index: number) => {
      const check = activity.steps[step]?.objectives[index]?.check;
      if (check?.type !== 'question') throw new Error('question attendue');
      return check.question;
    };
    const choice = askQuestion('q-switch', question(0, 0), 3);
    if (choice?.kind !== 'choice') throw new Error('choix attendu');
    const good = markAnswer(choice, choice.correct, 10);
    expect(good.right).toBe(true);
    expect(givenText(good)).toBe('Le switch');

    const order = askQuestion('q-ordre', question(2, 0), 3);
    if (order?.kind !== 'order') throw new Error('ordre attendu');
    expect(order.shuffled).not.toEqual(order.solution);
    const ordered = markAnswer(order, ['Câble', 'Adresse', 'Masque'], 10);
    expect(ordered.right).toBe(true);
    expect(givenText(ordered)).toBe('Câble → Adresse → Masque');
    expect(markAnswer(order, order.shuffled, 10).right).toBe(false);

    const short = askQuestion('q-reseau', question(1, 0), 3);
    expect(markAnswer(short, ' 192.168.10 ', 10).right).toBe(true);
    expect(markAnswer(short, '192.168.10.1', 10).right).toBe(false);

    expect(askQuestion('q-pourquoi', question(0, 1), 3)).toBeNull();
    const open = markAnswer(null, '  Pour trouver le bon destinataire.  ', 10);
    expect(open).toEqual({ given: 'Pour trouver le bon destinataire.', right: null, at: 10 });
  });

  test('parties et scores : par partie, bonus à part ; les réponses libres ne sont pas notées', () => {
    const activity = parse(QUESTIONS);
    const parts = partsOf(activity);
    expect(parts.map((p) => [p.title, p.bonus, p.steps.length])).toEqual([
      ['Partie 1 — Révisions', false, 1],
      ['Partie 2 — Adresses', false, 1],
      ['Bonus', true, 1],
    ]);
    let work = answer(activity, EMPTY_WORK, 'q-switch');
    work = answer(activity, work, 'q-pourquoi');
    expect(scoreQuestions(parts[0]?.steps ?? [], work)).toEqual({
      right: 1,
      marked: 1,
      corrected: 0,
      answered: 2,
      total: 2,
    });
    expect(scoreQuestions(parts[1]?.steps ?? [], work)).toEqual({
      right: 0,
      marked: 0,
      corrected: 0,
      answered: 0,
      total: 2,
    });
  });

  test('une partie peut porter une note ; sans titre de partie, la note n’est pas lue', () => {
    expect(partsOf(parse(QUESTIONS)).map((p) => p.note)).toEqual([
      '',
      '**Séance 2** : rouvre ton fichier avec [[ecran:ouvrir]].',
      '',
    ]);
    const orphan = parse({
      ...QUESTIONS,
      steps: QUESTIONS.steps.map((step) =>
        step.id === 'adresses' ? { ...step, part: undefined, partNote: 'Sans titre.' } : step,
      ),
    });
    expect(partsOf(orphan).map((p) => [p.title, p.note, p.steps.length])).toEqual([
      ['Partie 1 — Révisions', '', 2],
      ['Bonus', '', 1],
    ]);
  });

  test('réponse libre : une phrase d’au moins trois mots', () => {
    expect(OPEN_MIN_WORDS).toBe(3);
    for (const text of ['', '   ', 'ok', 'je sais', 'a', '. . . .', '?? !! ...'])
      expect(isOpenAnswer(text), text).toBe(false);
    for (const text of ['Pour trouver le destinataire.', 'adresse = numéro unique', '  un   deux\ntrois '])
      expect(isOpenAnswer(text), text).toBe(true);
  });

  test('nouvel essai : un autre tirage, la première réponse reste notée', () => {
    const activity = parse(QUESTIONS);
    const question = (id: string) => {
      const check = requiredObjectives(activity).find((o) => o.id === id)?.check;
      if (check?.type !== 'question') throw new Error(id);
      return check.question;
    };
    // Rien à réessayer sans réponse, ni après une bonne réponse, ni pour une réponse libre.
    expect(askRetry('q-switch', question('q-switch'), EMPTY_WORK)).toBeNull();
    const right = answer(activity, EMPTY_WORK, 'q-switch');
    expect(canRetry(right.answers['q-switch'])).toBe(false);
    expect(isSettled(right.answers['q-switch'])).toBe(true);
    const open = answer(activity, EMPTY_WORK, 'q-pourquoi');
    expect(askRetry('q-pourquoi', question('q-pourquoi'), open)).toBeNull();
    expect(isSettled(open.answers['q-pourquoi'])).toBe(true);
    expect(isSettled(undefined)).toBe(false);

    let work = answer(activity, { ...EMPTY_WORK, startedAt: 7 }, 'q-switch', true);
    const first = work.answers['q-switch'];
    if (!first) throw new Error('réponse attendue');
    expect([first.right, canRetry(first), isSettled(first)]).toEqual([false, true, false]);

    // Premier nouvel essai, encore faux : on peut recommencer, avec un autre tirage.
    const one = askRetry('q-switch', question('q-switch'), work);
    if (one?.item.kind !== 'choice') throw new Error('choix attendu');
    expect(one.tries).toBe(1);
    expect([...one.item.choices].sort()).toEqual(['Le serveur', 'Le switch', 'L’imprimante'].sort());
    const wrong = one.item.correct.includes(0) ? 1 : 0;
    work = { ...work, answers: { 'q-switch': markRetry(first, one, [wrong], 2000) } };
    expect(work.answers['q-switch']).toMatchObject({
      right: false,
      at: 1000,
      given: first.given,
      retry: { right: false, tries: 1, at: 2000, given: [wrong] },
    });
    expect(canRetry(work.answers['q-switch'])).toBe(true);
    expect(scoreQuestions(activity.steps, work)).toMatchObject({ right: 0, marked: 1, corrected: 0 });

    const two = askRetry('q-switch', question('q-switch'), work);
    if (two?.item.kind !== 'choice') throw new Error('choix attendu');
    expect(two.tries).toBe(2);
    const second = work.answers['q-switch'];
    if (!second) throw new Error('réponse attendue');
    work = { ...work, answers: { 'q-switch': markRetry(second, two, two.item.correct, 3000) } };
    const corrected = work.answers['q-switch'];
    expect(corrected).toMatchObject({ right: false, retry: { right: true, tries: 2, at: 3000 } });
    expect([canRetry(corrected), isSettled(corrected)]).toEqual([false, true]);
    expect(askRetry('q-switch', question('q-switch'), work)).toBeNull();
    // La note reste celle du premier essai ; la correction est comptée à part.
    expect(scoreQuestions(activity.steps, work)).toMatchObject({ right: 0, marked: 1, corrected: 1 });

    // « Même réseau ? » : le nouvel essai porte sur d'autres adresses.
    const asked = new Set<string>();
    for (let startedAt = 1; startedAt <= 20; startedAt++) {
      const base = answer(activity, { ...EMPTY_WORK, startedAt }, 'q-meme-reseau', true);
      const again = askRetry('q-meme-reseau', question('q-meme-reseau'), base);
      asked.add(String(again?.item.prompt !== base.answers['q-meme-reseau']?.item?.prompt));
    }
    expect([...asked]).toEqual(['true']);

    // Le fichier rendu garde le nouvel essai.
    const text = serializeLearnFile(new Network(), { activity, work });
    expect(parseLearnFile(text).work?.answers['q-switch']).toEqual(corrected);
  });

  test('correction obligatoire : une réponse fausse ne compte qu’une fois reprise avec succès', () => {
    const reached = (outcomes: ReadonlyMap<string, { status: string }>) =>
      new Set([...outcomes].filter(([, outcome]) => outcome.status === 'done').map(([id]) => id));
    const free = parse(QUESTIONS);
    const strict = parse({ ...QUESTIONS, requireCorrection: true });
    const network = new Network();
    let work = answer(strict, EMPTY_WORK, 'q-switch', true);
    work = answer(strict, work, 'q-pourquoi');
    // Sans l'option, répondre suffit (la correction est montrée) ; avec, l'étape suivante reste fermée.
    expect(evaluateNow(free, network, work).get('q-switch')?.status).toBe('done');
    const before = evaluateNow(strict, network, work);
    expect(before.get('q-switch')).toEqual({
      status: 'todo',
      detail: 'Réponse fausse : réessaie pour continuer.',
    });
    expect(before.get('q-pourquoi')?.status).toBe('done');
    expect(currentStep(strict, reached(before))).toBe(0);
    expect(gateSteps(strict, before).get('q-reseau')?.status).toBe('locked');

    const check = requiredObjectives(strict).find((o) => o.id === 'q-switch')?.check;
    if (check?.type !== 'question') throw new Error('question attendue');
    const retry = askRetry('q-switch', check.question, work);
    const first = work.answers['q-switch'];
    if (retry?.item.kind !== 'choice' || !first) throw new Error('nouvel essai attendu');
    work = {
      ...work,
      answers: { ...work.answers, 'q-switch': markRetry(first, retry, retry.item.correct, 5) },
    };
    const after = evaluateNow(strict, network, work);
    expect(after.get('q-switch')?.status).toBe('done');
    expect(currentStep(strict, reached(after))).toBe(1);
  });

  test('le fichier rendu garde les réponses et les questions telles que posées', () => {
    const activity = parse(QUESTIONS);
    let work: Work = { ...EMPTY_WORK, startedAt: 5 };
    for (const id of ['q-switch', 'q-pourquoi', 'q-reseau', 'q-meme-reseau'])
      work = answer(activity, work, id);
    const text = serializeLearnFile(new Network(), { activity, work, pack: null });
    const back = parseLearnFile(text);
    expect(back.work?.answers).toEqual(work.answers);
    expect(back.activity?.steps[2]?.bonus).toBe(true);
    // Un ancien fichier, sans réponses, s'ouvre toujours.
    const old = JSON.parse(text) as { work: Record<string, unknown> };
    delete old.work.answers;
    expect(parseLearnFile(JSON.stringify(old)).work?.answers).toEqual({});
  });

  test('association : posée, corrigée paire par paire, gardée dans le fichier', () => {
    const withMatch = (question: unknown) => ({
      ...QUESTIONS,
      steps: [
        {
          id: 'roles',
          title: 'Rôles',
          objectives: [{ id: 'q-roles', label: 'Rôles', check: { type: 'question', question } }],
        },
      ],
    });
    const activity = parse(withMatch(MATCH_QUESTION) as ActivityInput);
    // Deux éléments ou deux propositions identiques rendraient la question ambiguë.
    for (const pairs of [
      [
        ['Switch', 'Relier'],
        ['Switch', 'Fournir'],
      ],
      [
        ['Switch', 'Relier'],
        ['Routeur', 'Relier'],
      ],
      [['Switch', 'Relier']],
    ])
      expect(activitySchema.safeParse(withMatch({ ...MATCH_QUESTION, pairs })).success).toBe(false);

    const item = askQuestion('q-roles', MATCH_QUESTION, 3);
    if (item?.kind !== 'match') throw new Error('association attendue');
    expect(item.lefts).toEqual(['Switch', 'Routeur', 'Serveur']);
    const right = markAnswer(item, item.solution, 10);
    expect(right.right).toBe(true);
    // Deux propositions échangées : la troisième paire reste juste.
    const swapped = markAnswer(
      item,
      ['Relier des réseaux', 'Relier les équipements d’un réseau', 'Fournir des fichiers'],
      10,
    );
    expect(swapped.right).toBe(false);
    expect(givenText(swapped)).toBe(
      'Switch : Relier des réseaux ; Routeur : Relier les équipements d’un réseau ; Serveur : Fournir des fichiers',
    );
    expect(givenParts(swapped).map((p) => p.right)).toEqual([false, false, true]);
    expect(givenParts(swapped)[2]?.text).toBe('Serveur : Fournir des fichiers');

    // Un nouvel essai mélange autrement les propositions, pas les équipements.
    let work: Work = { ...EMPTY_WORK, answers: { 'q-roles': swapped } };
    const retry = askRetry('q-roles', MATCH_QUESTION, work);
    if (retry?.item.kind !== 'match') throw new Error('association attendue');
    expect(retry.item.lefts).toEqual(item.lefts);
    work = { ...work, answers: { 'q-roles': markRetry(swapped, retry, rightAnswer(retry.item), 20) } };
    expect(isSettled(work.answers['q-roles'])).toBe(true);
    const text = serializeLearnFile(new Network(), { activity, work });
    expect(parseLearnFile(text).work?.answers).toEqual(work.answers);
  });

  test('étape d’approfondissement : elle ne compte pas pour finir, et peut être passée', () => {
    const activity = parse(OPTIONAL);
    const network = new Network();
    expect(requiredObjectives(activity).map((o) => o.id)).toEqual(['q-switch', 'q-roles']);
    expect(optionalObjectives(activity).map((o) => o.id)).toEqual(['q-combien']);
    // La première étape ne peut pas être un approfondissement : il n'y aurait rien à faire avant.
    const steps = OPTIONAL.steps.map((step, i) => (i === 0 ? { ...step, optional: true } : step));
    expect(activitySchema.safeParse({ ...OPTIONAL, steps }).success).toBe(false);

    const work = answer(activity, EMPTY_WORK, 'q-switch');
    const reached = (outcomes: ReadonlyMap<string, { status: string }>) =>
      new Set([...outcomes].filter(([, outcome]) => outcome.status === 'done').map(([id]) => id));
    const status = (skipped: readonly string[]) => {
      const outcomes = gateSteps(activity, evaluateNow(activity, network, work), skipped);
      return [
        outcomes.get('q-combien')?.status,
        outcomes.get('q-roles')?.status,
        currentStep(activity, reached(outcomes), skipped),
      ];
    };
    // Tant qu'elle n'est ni faite ni passée, l'étape retient la suite.
    expect(status([])).toEqual(['todo', 'locked', 1]);
    // Passée : la suite s'ouvre ; ses objectifs restent à faire, pour qui y revient.
    expect(status(['plus'])).toEqual(['todo', 'todo', 2]);
    // Seul un approfondissement se passe : une étape ordinaire citée par erreur retient toujours la suite.
    const [base] = activity.steps;
    if (!base) throw new Error('étape attendue');
    expect(isSkipped(base, ['base'])).toBe(false);
    const blank = gateSteps(activity, evaluateNow(activity, network, EMPTY_WORK), ['base', 'plus']);
    expect(blank.get('q-combien')?.status).toBe('locked');

    // Le fichier rendu garde les étapes passées ; un ancien fichier n'en a pas.
    const text = serializeLearnFile(new Network(), { activity, work: { ...work, skipped: ['plus'] } });
    expect(parseLearnFile(text).work?.skipped).toEqual(['plus']);
    const old = JSON.parse(text) as { work: Record<string, unknown> };
    delete old.work.skipped;
    expect(parseLearnFile(JSON.stringify(old)).work?.skipped).toEqual([]);
  });

  test('réponse donnée, morceau par morceau : juste en vert, faux en rouge', () => {
    const choice = askQuestion(
      'q-multi',
      {
        type: 'mcq',
        prompt: 'Lesquels sont des terminaux ?',
        choices: ['PC', 'Switch', 'Tablette'],
        correct: [0, 2],
        explanation: '',
      },
      3,
    );
    if (choice?.kind !== 'choice') throw new Error('choix attendu');
    const index = (text: string) => choice.choices.indexOf(text);
    // Un juste, un faux, un oublié : seuls les choix cochés sont montrés.
    expect(givenParts(markAnswer(choice, [index('PC'), index('Switch')], 10))).toEqual([
      { text: 'PC', right: true },
      { text: 'Switch', right: false },
    ]);

    const order = askQuestion(
      'q-ordre',
      { type: 'order', prompt: 'Range', items: ['A', 'B', 'C'], explanation: '' },
      3,
    );
    expect(givenParts(markAnswer(order, ['A', 'C', 'B'], 10))).toEqual([
      { text: 'A', right: true },
      { text: 'C', right: false },
      { text: 'B', right: false },
    ]);

    const short = askQuestion(
      'q-court',
      { type: 'short', prompt: 'Réseau ?', accepted: ['192.168.10'], explanation: '' },
      3,
    );
    expect(givenParts(markAnswer(short, '192.168.1', 10))).toEqual([{ text: '192.168.1', right: false }]);
    expect(givenParts(markAnswer(null, 'Une réponse libre', 10))).toEqual([]);
  });
});
