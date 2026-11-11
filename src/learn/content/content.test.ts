import { MESSAGES } from '../diagnose/messages.fr';
import { linkedNotions, parseInline, parseRich, plainText } from '../richtext';
import { DEFAULT_PACK } from './default-pack';
import { fold, lexicon, mergePacks, searchNotions } from './merge';
import { nextNotion, readingOrder, shownAt } from './order';
import { DEVICE_NOTION, contextualNotion } from './context';
import { PackError, parsePack, serializePack } from './schema';
import type { Question } from '../quiz/types';
import { CATEGORIES, CATEGORY_LABEL, LEVELS, type Notion, type Pack } from './types';

function card(id: string, extra: Partial<Notion> = {}): Notion {
  return {
    id,
    title: `Fiche ${id}`,
    aliases: [],
    level: '4e',
    category: 'adressage',
    short: `Définition de ${id}.`,
    body: '',
    remember: [],
    related: [],
    ...extra,
  };
}

describe('Texte mis en forme', () => {
  test('paragraphes, listes, gras, italique, code et liens vers une fiche', () => {
    expect(
      parseRich(`Une **adresse IP** identifie un *équipement*.
Elle s’écrit \`192.168.1.10\`.

- voir [[masque]]
- voir [[passerelle|sa passerelle]],
  sur la ligne suivante

Fin.`),
    ).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Une ' },
          { type: 'bold', children: [{ type: 'text', text: 'adresse IP' }] },
          { type: 'text', text: ' identifie un ' },
          { type: 'italic', children: [{ type: 'text', text: 'équipement' }] },
          { type: 'text', text: '. Elle s’écrit ' },
          { type: 'code', text: '192.168.1.10' },
          { type: 'text', text: '.' },
        ],
      },
      {
        type: 'list',
        items: [
          [
            { type: 'text', text: 'voir ' },
            { type: 'link', notion: 'masque', text: 'masque' },
          ],
          [
            { type: 'text', text: 'voir ' },
            { type: 'link', notion: 'passerelle', text: 'sa passerelle' },
            { type: 'text', text: ',' },
            { type: 'text', text: ' sur la ligne suivante' },
          ],
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'Fin.' }] },
    ]);
  });

  test('un lien ou du code dans du gras ; des marques non fermées restent du texte', () => {
    expect(parseInline('**le [[dns|DNS]] et `ping`**')).toEqual([
      {
        type: 'bold',
        children: [
          { type: 'text', text: 'le ' },
          { type: 'link', notion: 'dns', text: 'DNS' },
          { type: 'text', text: ' et ' },
          { type: 'code', text: 'ping' },
        ],
      },
    ]);
    expect(parseInline('2 * 3 = 6, **pas fermé et [[cassé')).toEqual([
      { type: 'text', text: '2 * 3 = 6, **pas fermé et [[cassé' },
    ]);
    expect(parseInline('')).toEqual([]);
  });

  test('rien qui ressemble à du HTML n’est interprété', () => {
    expect(parseRich('<script>alert(1)</script> <b>x</b>')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script> <b>x</b>' }] },
    ]);
  });

  test('texte brut et liste des fiches citées', () => {
    const source =
      'Le **[[masque]]** et la [[passerelle|passerelle par défaut]].\n\n- `ipconfig`\n- *encore* [[masque]]';
    expect(plainText(source)).toBe('Le masque et la passerelle par défaut. ipconfig encore masque');
    expect(linkedNotions(source)).toEqual(['masque', 'passerelle']);
    expect(parseRich('  \r\n\r\n  ')).toEqual([]);
  });
});

describe('Pack pédagogique par défaut', () => {
  const notions = DEFAULT_PACK.notions;
  const ids = new Set(notions.map((n) => n.id));

  test('des identifiants uniques, des fiches complètes', () => {
    expect(ids.size).toBe(notions.length);
    expect(notions.length).toBeGreaterThanOrEqual(30);
    for (const n of notions) {
      expect(n.id, n.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(n.short.length, n.id).toBeGreaterThan(20);
      expect(n.short.length, n.id).toBeLessThanOrEqual(200);
      expect(n.body.length, n.id).toBeGreaterThan(100);
      expect(n.remember.length, n.id).toBeGreaterThanOrEqual(2);
      expect(n.related.length, n.id).toBeGreaterThanOrEqual(1);
      expect(LEVELS, n.id).toContain(n.level);
      expect(CATEGORIES, n.id).toContain(n.category);
    }
  });

  test('chaque niveau et chaque rubrique a des fiches', () => {
    for (const level of LEVELS) expect(notions.filter((n) => n.level === level).length).toBeGreaterThan(4);
    for (const category of CATEGORIES) {
      expect(
        notions.some((n) => n.category === category),
        category,
      ).toBe(true);
      expect(CATEGORY_LABEL[category]).not.toBe('');
    }
  });

  test('tous les renvois mènent à une fiche existante', () => {
    for (const n of notions) {
      for (const id of n.related) expect(ids.has(id), `${n.id} → ${id}`).toBe(true);
      expect(n.related, n.id).not.toContain(n.id);
      for (const id of linkedNotions(n.body)) expect(ids.has(id), `${n.id} cite ${id}`).toBe(true);
    }
  });

  test('chaque message du diagnostic renvoie à une fiche existante', () => {
    for (const [code, text] of Object.entries(MESSAGES)) expect(ids.has(text.notion), code).toBe(true);
  });

  test('le pack par défaut est un fichier de pack valide', () => {
    const file = serializePack({ notions });
    const read = parsePack(file);
    expect(read.notions).toEqual(notions.map((n) => ({ ...n })));
    expect(read.hidden).toEqual([]);
    expect(read.messages).toEqual({});
  });
});

describe('Personnalisation par l’enseignant', () => {
  const question = (id: string, notion: string): Question => ({
    id,
    notion,
    level: '4e',
    type: 'short',
    prompt: `Question ${id}`,
    accepted: ['oui'],
    explanation: '',
  });
  const base: Pack = {
    notions: [card('a', { related: ['b'] }), card('b', { related: ['a', 'c'] }), card('c')],
    questions: [question('qa', 'a'), question('qc', 'c')],
    messages: {},
  };

  test('remplace, ajoute et masque des fiches ; les renvois vers une fiche absente disparaissent', () => {
    const merged = mergePacks(
      base,
      {
        notions: [
          card('b', { title: 'B reformulée', related: ['a', 'c', 'z'] }),
          card('d', { related: ['d', 'a'] }),
        ],
      },
      { hidden: ['c'] },
    );
    expect(merged.notions.map((n) => n.id)).toEqual(['a', 'b', 'd']);
    expect(merged.notions[1]).toMatchObject({ title: 'B reformulée', related: ['a'] });
    expect(merged.notions[2]?.related).toEqual(['a']);
    // Le pack de départ n'est pas modifié.
    expect(base.notions.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(mergePacks(base)).toEqual(base);
  });

  test('remplace, ajoute et masque des questions ; celles d’une fiche masquée disparaissent', () => {
    const merged = mergePacks(base, {
      questions: [
        { ...question('qa', 'a'), prompt: 'Reformulée' },
        question('qb', 'b'),
        question('qz', 'inconnue'),
      ],
      hidden: ['c'],
    });
    expect(merged.questions.map((q) => `${q.id}:${q.prompt}`)).toEqual(['qa:Reformulée', 'qb:Question qb']);
    expect(mergePacks(base, { hidden: ['qa'] }).questions.map((q) => q.id)).toEqual(['qc']);
  });

  test('lit des questions dans un fichier de pack et refuse celles qui sont incohérentes', () => {
    const file = (questions: object[]) => JSON.stringify({ format: 'reseaulab-pack', version: 1, questions });
    const mcq = {
      id: 'q1',
      notion: 'masque',
      level: '4e',
      type: 'mcq',
      prompt: 'Vrai ?',
      choices: ['Oui', 'Non'],
      correct: [0],
    };
    expect(parsePack(file([mcq])).questions).toEqual([{ ...mcq, explanation: '' }]);
    expect(() => parsePack(file([{ ...mcq, correct: [2] }]))).toThrow('désigne un choix qui n’existe pas');
    expect(() => parsePack(file([{ ...mcq, choices: ['Seul'] }]))).toThrow('questions.0.choices');
    expect(() => parsePack(file([{ ...mcq, type: 'essai' }]))).toThrow('questions.0.type');
    expect(() => parsePack(file([mcq, mcq]))).toThrow('la question « q1 » est définie deux fois');
    expect(parsePack(serializePack({ questions: DEFAULT_PACK.questions })).questions).toEqual(
      DEFAULT_PACK.questions.map((q) => ({ ...q })),
    );
  });

  test('reformule un message du diagnostic, en plusieurs fois', () => {
    const merged = mergePacks(
      base,
      { messages: { 'ip-missing': { title: 'Adresse à compléter' } } },
      { messages: { 'ip-missing': { fix: 'Voir la fiche.' }, 'trace-ok': { title: 'Bravo' } } },
    );
    expect(merged.messages).toEqual({
      'ip-missing': { title: 'Adresse à compléter', fix: 'Voir la fiche.' },
      'trace-ok': { title: 'Bravo' },
    });
  });

  test('lit un fichier de pack et refuse en entier un fichier invalide', () => {
    const file = JSON.stringify({
      format: 'reseaulab-pack',
      version: 1,
      notions: [
        {
          id: 'vlan',
          title: 'VLAN',
          level: '3e',
          category: 'materiel',
          short: 'Un réseau virtuel.',
          body: '',
        },
      ],
      hidden: ['box'],
      messages: { 'ip-missing': { title: 'Sans adresse' } },
    });
    expect(parsePack(file)).toEqual({
      notions: [
        card('vlan', { title: 'VLAN', level: '3e', category: 'materiel', short: 'Un réseau virtuel.' }),
      ],
      questions: [],
      hidden: ['box'],
      messages: { 'ip-missing': { title: 'Sans adresse' } },
    });
    expect(parsePack('{"format":"reseaulab-pack","version":1}')).toEqual({
      notions: [],
      questions: [],
      hidden: [],
      messages: {},
    });

    const bad = (data: unknown) => () => parsePack(typeof data === 'string' ? data : JSON.stringify(data));
    expect(bad('{pas du json')).toThrow('JSON illisible');
    expect(bad({ format: 'reseaulab', version: 1 })).toThrow(PackError);
    expect(bad({ format: 'reseaulab-pack', version: 2 })).toThrow('Pack invalide (version)');
    const withNotion = (notion: object) => ({ format: 'reseaulab-pack', version: 1, notions: [notion] });
    expect(bad(withNotion({ ...card('Avec Majuscules') }))).toThrow(
      'Pack invalide (notions.0.id) : Identifiant invalide',
    );
    expect(bad(withNotion({ ...card('x'), level: '6e' }))).toThrow('notions.0.level');
    expect(bad(withNotion({ ...card('x'), image: { data: 'javascript:alert(1)', alt: '' } }))).toThrow(
      'Image invalide',
    );
    expect(bad({ format: 'reseaulab-pack', version: 1, notions: [card('x'), card('x')] })).toThrow(
      'la fiche « x » est définie deux fois',
    );
    expect(
      bad({ format: 'reseaulab-pack', version: 1, messages: { 'code-inconnu': { title: 'x' } } }),
    ).toThrow(PackError);
    expect(bad(' '.repeat(5_000_001))).toThrow('trop volumineux');
  });

  test('accepte une image fournie par l’enseignant', () => {
    const image = { data: 'data:image/png;base64,iVBORw0KGgo=', alt: 'Schéma' };
    const read = parsePack(serializePack({ notions: [card('x', { image })] }));
    expect(read.notions?.[0]?.image).toEqual(image);
  });
});

describe('Recherche et lexique', () => {
  const notions = DEFAULT_PACK.notions;

  test('sans tenir compte des accents ni des majuscules', () => {
    expect(fold('  Réseau Élève ')).toBe('reseau eleve');
    expect(searchNotions(notions, 'adresse ip')[0]?.id).toBe('adresse-ip');
    expect(searchNotions(notions, 'COMMUTATEUR')[0]?.id).toBe('switch');
    expect(
      searchNotions(notions, 'reseau')
        .map((n) => n.id)
        .slice(0, 2),
    ).toEqual(['reseau', 'reseau-local-internet']);
    expect(searchNotions(notions, 'xyzzy')).toEqual([]);
    expect(searchNotions(notions, '   ')).toHaveLength(notions.length);
  });

  test('un mot du titre ou d’un autre nom passe avant un mot de la définition', () => {
    const found = searchNotions(notions, 'routeur').map((n) => n.id);
    expect(found[0]).toBe('routeur');
    // La définition de la passerelle parle du routeur : elle vient ensuite.
    expect(found.indexOf('passerelle')).toBeGreaterThan(0);
  });

  test('le lexique liste titres et autres noms par ordre alphabétique, sans la prise en main', () => {
    const words = lexicon(notions);
    expect(words.some((w) => w.notion.category === 'guide')).toBe(false);
    expect(words.find((w) => w.word === 'commutateur')?.notion.id).toBe('switch');
    const folded = words.map((w) => fold(w.word));
    expect(folded).toEqual([...folded].sort((a, b) => a.localeCompare(b, 'fr')));
  });
});

describe('Ordre de lecture', () => {
  test('par rubrique, puis par niveau dans la rubrique, sinon dans l’ordre du pack', () => {
    const notions = [
      card('routeur', { level: '3e', category: 'materiel' }),
      card('ip', { level: '4e' }),
      card('reseau', { level: '5e', category: 'materiel' }),
      card('guide', { level: '5e', category: 'guide' }),
      card('ajout', { level: '5e', category: 'materiel' }),
    ];
    expect(readingOrder(notions).map((n) => n.id)).toEqual(['guide', 'reseau', 'ajout', 'routeur', 'ip']);
    // Au niveau 5e : la prise en main et les notions de 5e seulement.
    expect(readingOrder(notions, '5e').map((n) => n.id)).toEqual(['guide', 'reseau', 'ajout']);
    expect(shownAt(card('x', { level: '3e', category: 'guide' }), '5e')).toBe(true);
    expect(shownAt(card('x', { level: '3e' }), '4e')).toBe(false);
  });

  test('la fiche suivante : aucune après la dernière ni hors de la liste', () => {
    const order = readingOrder(DEFAULT_PACK.notions);
    expect(nextNotion(order, 'adresse-ip')?.id).toBe('masque');
    expect(nextNotion(order, order.at(-1)?.id ?? '')).toBeUndefined();
    expect(nextNotion(order, 'inconnue')).toBeUndefined();
    // Toutes les fiches du pack par défaut se lisent d’un bout à l’autre.
    expect(order).toHaveLength(DEFAULT_PACK.notions.length);
  });
});

describe('Aide selon le contexte', () => {
  const exists = (id: string) => DEFAULT_PACK.notions.some((n) => n.id === id);

  test('l’équipement sélectionné, sinon la dernière fiche lue, sinon la prise en main du mode', () => {
    expect(contextualNotion({ device: 'router', lastRead: 'dns', mode: 'design', exists })).toBe('routeur');
    expect(contextualNotion({ lastRead: 'dns', mode: 'design', exists })).toBe('dns');
    expect(contextualNotion({ mode: 'design', exists })).toBe('guide-construire');
    expect(contextualNotion({ mode: 'simulation', exists })).toBe('guide-simuler');
    // Une fiche masquée par l’enseignant est sautée.
    expect(contextualNotion({ device: 'box', mode: 'simulation', exists: (id) => id !== 'box' })).toBe(
      'guide-simuler',
    );
  });

  test('chaque sorte d’équipement a sa fiche dans le pack par défaut', () => {
    for (const id of Object.values(DEVICE_NOTION)) expect(exists(id)).toBe(true);
  });
});
