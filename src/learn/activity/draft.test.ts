import { routedNetwork } from '../../engine/testing';
import { EMPTY_STEP, buildActivity, emptyDraft, slug, type Draft } from './draft';
import { suggestObjectives } from './suggest';

describe('Brouillon d’activité', () => {
  const { net } = routedNetwork();
  const objectives = suggestObjectives(net).slice(0, 3);
  const draft: Draft = {
    title: 'Relier deux réseaux',
    level: '3e',
    duration: '40',
    intro: 'Un **routeur** relie les salles.',
    start: 'no-addresses',
    steps: [
      {
        title: 'Observer',
        body: 'Regarde le plan.',
        hints: 'Premier indice\n\n  Second indice  ',
        notions: ['routeur'],
        objectives,
      },
      EMPTY_STEP,
    ],
  };

  test('un brouillon vide dit ce qui manque, dans l’ordre', () => {
    expect(buildActivity(emptyDraft())).toEqual({ error: 'Donnez un titre à l’activité.' });
    expect(buildActivity({ ...emptyDraft(), title: 'A' })).toEqual({ error: 'Ajoutez au moins une étape.' });
    const body: Draft = { ...emptyDraft(), title: 'A', steps: [{ ...EMPTY_STEP, body: 'Texte' }] };
    expect(buildActivity(body)).toEqual({ error: 'Donnez un titre à l’étape 1.' });
    const titled: Draft = { ...body, steps: [{ ...EMPTY_STEP, title: 'Étape' }] };
    expect(buildActivity(titled)).toEqual({
      error: 'Ajoutez au moins un objectif, pour que l’activité se vérifie toute seule.',
    });
    const first = objectives[0];
    if (!first) throw new Error('objectif attendu');
    const unlabelled: Draft = {
      ...titled,
      steps: [{ ...EMPTY_STEP, title: 'Étape', objectives: [{ ...first, label: ' ' }] }],
    };
    expect(buildActivity(unlabelled)).toEqual({
      error: 'Chaque objectif doit avoir une phrase qui le décrit.',
    });
    expect(buildActivity({ ...draft, duration: 'longtemps' })).toEqual({
      error: 'La durée est un nombre de minutes (de 1 à 600), ou vide.',
    });
  });

  test('construit une activité valide : identifiants déduits, indices par ligne, étapes vides ignorées', () => {
    const built = buildActivity(draft);
    if ('error' in built) throw new Error(built.error);
    const { activity } = built;
    expect(activity).toMatchObject({
      id: 'relier-deux-reseaux',
      level: '3e',
      duration: 40,
      profile: { base: '3e' },
    });
    expect(activity.steps).toHaveLength(1);
    expect(activity.steps[0]).toMatchObject({
      id: 'etape-1',
      title: 'Observer',
      hints: ['Premier indice', 'Second indice'],
      notions: ['routeur'],
    });
    expect(activity.steps[0]?.objectives.map((o) => o.id)).toEqual([
      'etape-1-objectif-1',
      'etape-1-objectif-2',
      'etape-1-objectif-3',
    ]);
    expect(buildActivity({ ...draft, duration: '' })).not.toHaveProperty('activity.duration');
  });

  test('départ sur un plan vide : les équipements sont désignés par leur nom', () => {
    const link = suggestObjectives(net).find((s) => s.check.type === 'linked');
    if (!link) throw new Error('lien attendu');
    const built = buildActivity({
      ...draft,
      start: 'empty',
      steps: [{ ...EMPTY_STEP, title: 'Relier', objectives: [link] }],
    });
    if ('error' in built) throw new Error(built.error);
    expect(built.activity.steps[0]?.objectives[0]?.check).toEqual({
      type: 'linked',
      a: { by: 'name', name: 'A' },
      b: { by: 'name', name: 'Switch 1' },
    });
  });

  test('un nom de fichier simple se déduit du titre', () => {
    expect(slug('Mon 1er réseau !')).toBe('mon-1er-reseau');
    expect(slug('  Dépannage : le site du collège  ')).toBe('depannage-le-site-du-college');
    expect(slug('???')).toBe('activite');
    expect(slug('x'.repeat(80))).toHaveLength(50);
  });
});
