import { formatIp } from '../../engine/core/ipv4';
import { MATCH_QUESTION, QUESTIONS, SWITCH_QUESTION } from '../../test/activities';
import { answerKey, estimateMinutes, keyQuestion } from './answerKey';
import { BUILTIN_ACTIVITIES } from './builtin';
import { activitySchema, type ActivityInput } from './schema';

const parse = (input: ActivityInput) => activitySchema.parse(input);

function builtin(id: string) {
  const found = BUILTIN_ACTIVITIES.find((a) => a.id === id);
  if (!found) throw new Error(id);
  return found.build();
}

describe('Corrigé d’une activité', () => {
  test('chaque forme de question : la réponse attendue, en clair', () => {
    const question = (input: unknown) => {
      const activity = parse({
        ...QUESTIONS,
        steps: [
          {
            id: 's',
            title: 'S',
            objectives: [{ id: 'q', label: 'Q', check: { type: 'question', question: input } }],
          },
        ],
      } as ActivityInput);
      const check = activity.steps[0]?.objectives[0]?.check;
      if (check?.type !== 'question') throw new Error('question attendue');
      return keyQuestion(check.question);
    };

    expect(question(SWITCH_QUESTION)).toEqual({
      kind: 'Choix',
      prompt: 'Quel équipement relie les terminaux d’un même réseau ?',
      expected: ['Le switch'],
      ordered: false,
      pairs: [],
      notes: [],
      // Les mauvais choix ne sont dits qu'au professeur.
      marking: ['Autres choix proposés : Le serveur ; L’imprimante.'],
      explanation: 'Le switch (commutateur) relie les terminaux.',
      marked: true,
    });
    const several = question({
      type: 'mcq',
      prompt: 'Lesquels ?',
      choices: ['A', 'B', 'C'],
      correct: [2, 0],
    });
    expect(several.kind).toBe('Choix (plusieurs réponses)');
    expect(several.expected).toEqual(['C', 'A']);

    const order = question({ type: 'order', prompt: 'Ordre ?', items: ['Câble', 'Adresse', 'Masque'] });
    expect([order.kind, order.ordered, order.expected]).toEqual([
      'Remise en ordre',
      true,
      ['Câble', 'Adresse', 'Masque'],
    ]);

    const match = question(MATCH_QUESTION);
    expect(match.kind).toBe('Association');
    expect(match.expected).toEqual([
      'Switch : Relier les équipements d’un réseau',
      'Routeur : Relier des réseaux',
      'Serveur : Fournir des fichiers',
    ]);
    expect(match.pairs).toEqual(MATCH_QUESTION.pairs);

    const short = question({ type: 'short', prompt: 'Combien ?', accepted: ['4', 'quatre'] });
    expect(short.expected).toEqual(['4']);
    // Les autres réponses acceptées sont dites à tous ; la tolérance de la correction, au professeur.
    expect(short.notes).toEqual(['Aussi acceptées : quatre.']);
    expect(short.marking[0]).toContain('Majuscules, accents');
    expect(question({ type: 'short', prompt: 'Combien ?', accepted: ['4'] }).notes).toEqual([]);

    // Un tirage n'a pas de réponse fixe : le corrigé donne la règle et le masque utilisé.
    const drawn = question({ type: 'same-network', prompt: 'Même réseau ?', masks: ['255.255.0.0'] });
    expect(drawn.expected[0]).toContain('Oui si');
    expect(drawn.marking[0]).toContain('avec le masque 255.255.0.0');
    expect(question({ type: 'same-network', prompt: 'Même réseau ?' }).marking[0]).toContain(
      'avec le masque 255.255.255.0',
    );

    const open = question({ type: 'open', prompt: 'Pourquoi ?', explanation: 'Parce que.' });
    expect([open.marked, open.expected, open.explanation]).toEqual([false, [], 'Parce que.']);
  });

  test('parties, numéros, ce qui se fait et ce qui se répond ; les étapes bonus n’ont pas de durée', () => {
    const activity = parse({ ...QUESTIONS, duration: 40 });
    const parts = answerKey(activity);
    expect(parts.map((p) => [p.title, p.bonus, p.note !== ''])).toEqual([
      ['Partie 1 — Révisions', false, false],
      ['Partie 2 — Adresses', false, true],
      ['Bonus', true, false],
    ]);
    expect(parts.flatMap((p) => p.steps).map((s) => [s.number, s.checks, s.questions])).toEqual([
      ['1', 0, 2],
      ['2', 0, 2],
      ['B1', 0, 1],
    ]);
    // Deux étapes de même poids se partagent la durée ; le bonus est en plus.
    expect(parts.map((p) => p.minutes)).toEqual([20, 20, null]);
    const [first] = parts[0]?.steps ?? [];
    expect(first?.objectives.map((o) => [o.id, o.question?.kind, o.how])).toEqual([
      ['q-switch', 'Choix', undefined],
      ['q-pourquoi', 'Réponse rédigée', undefined],
    ]);
  });

  test('durées : des minutes entières dont la somme est la durée ; rien sans durée', () => {
    expect(estimateMinutes(parse(QUESTIONS)).size).toBe(0);
    expect(answerKey(parse(QUESTIONS)).map((p) => p.minutes)).toEqual([null, null, null]);
    for (const shipped of BUILTIN_ACTIVITIES) {
      const { activity } = shipped.build();
      const minutes = estimateMinutes(activity);
      const required = activity.steps.filter((s) => s.bonus !== true);
      expect([...minutes.keys()]).toEqual(required.map((s) => s.id));
      expect([...minutes.values()].every((m) => Number.isInteger(m) && m >= 0)).toBe(true);
      expect([...minutes.values()].reduce((sum, m) => sum + m, 0)).toBe(activity.duration);
    }
  });

  test('ce qui se fait sur le plan, se teste ou se fait en simulation est dit au professeur', () => {
    const { activity } = builtin('college-musee');
    const how = new Map(
      answerKey(activity)
        .flatMap((p) => p.steps)
        .flatMap((s) => s.objectives)
        .map((o) => [o.id, o.how]),
    );
    expect(how.get('poste3-relie')).toBe('se valide tout seul, dès que le plan est bon');
    expect(how.get('ping-musee')).toBe('se valide avec « Vérifier mon travail »');
    expect(how.get('traceroute')).toBe('se valide quand l’élève l’a fait en simulation');
    expect(how.get('q-lan')).toBeUndefined();
  });

  test('Du collège au musée : deux séances équilibrées, et un corrigé pour chaque manipulation', () => {
    const { network, activity } = builtin('college-musee');
    const parts = answerKey(activity);
    const minutes = parts.map((p) => p.minutes);
    // La 2e séance commence bien à la partie 3 : chaque séance tient en 1 h 30 environ.
    const first = (minutes[0] ?? 0) + (minutes[1] ?? 0);
    expect(first + (minutes[2] ?? 0)).toBe(180);
    expect(Math.abs(first - 90)).toBeLessThanOrEqual(10);
    expect(minutes[3]).toBeNull();

    const steps = parts.flatMap((p) => p.steps);
    // Toute étape où l'élève manipule dit au professeur quoi faire.
    for (const step of steps.filter((s) => s.checks > 0))
      expect([step.id, step.solution]).not.toEqual([step.id, '']);
    const solution = (id: string) => steps.find((s) => s.id === id)?.solution ?? '';
    const device = (name: string) => {
      const found = network.devices.find((d) => d.name === name);
      if (!found) throw new Error(name);
      return found.id;
    };
    // Ces corrigés disent ce que le réseau de départ contient vraiment.
    expect(solution('depanner')).toContain(formatIp(network.host(device('Poste 2')).config.ip));
    const core = network.router(device('Routeur Internet'));
    for (const route of core.staticRoutes)
      expect(solution('trouver-panne')).toContain(formatIp(route.destination));
    expect(solution('trouver-panne')).toContain(formatIp(core.interfaces[1]?.ip ?? 0));
    const datacenter = network.router(device('Routeur du data center'));
    expect(solution('reparer-chemin')).toContain(
      `passerelle \`${formatIp(datacenter.interfaces[0]?.ip ?? 0)}\``,
    );
    for (const route of network.router(device('Routeur du FAI')).staticRoutes)
      expect(solution('lire-table')).toContain(
        `\`${formatIp(route.destination)}\` → \`${formatIp(route.gateway)}\``,
      );
    // Ce qui ne regarde que le professeur est à part : la correction des élèves ne le montre pas.
    const note = (id: string) => steps.find((s) => s.id === id)?.teacherNote ?? '';
    expect(note('trouver-panne')).toContain('c’est à l’élève de le trouver');
    expect(solution('trouver-panne')).not.toContain('indice');
    expect(note('reparer-chemin')).toContain('toute route qui fait aboutir le ping est acceptée');
    expect(note('brancher')).toBe('');
    // Les questions ont toutes une réponse attendue, sauf les réponses rédigées.
    for (const objective of steps.flatMap((s) => s.objectives)) {
      const question = objective.question;
      if (question) expect(question.expected.length > 0).toBe(question.marked);
    }
  });
});
