import { Network } from '../../engine/network';
import { parseLearnFile, serializeLearnFile } from '../file';
import { currentStep, evaluateNow, gateSteps } from './evaluate';
import { askQuestion, givenText, markAnswer, partsOf, scoreQuestions } from './questions';
import { QUESTIONS, SWITCH_QUESTION as mcq } from '../../test/activities';
import {
  EMPTY_WORK,
  activitySchema,
  familyOf,
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
  let given: number[] | readonly string[] | string;
  if (item === null) given = 'Pour que le message arrive au bon destinataire.';
  else if (item.kind === 'choice') given = wrong ? [item.correct.includes(0) ? 1 : 0] : [...item.correct];
  else if (item.kind === 'order') given = wrong ? item.shuffled : item.solution;
  else given = wrong ? 'je ne sais pas' : (item.accepted[0] ?? '');
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
      answered: 2,
      total: 2,
    });
    expect(scoreQuestions(parts[1]?.steps ?? [], work)).toEqual({
      right: 0,
      marked: 0,
      answered: 0,
      total: 2,
    });
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
});
