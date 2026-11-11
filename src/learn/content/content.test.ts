import { MESSAGES } from '../diagnose/messages.fr';
import { linkedNotions, parseInline, parseRich, plainText } from '../richtext';
import { DEFAULT_PACK } from './default-pack';
import { excerptOf, fold, lexicon, lexiconByLetter, mergePacks, searchHits, searchNotions } from './merge';
import { nextNotion, pathCards, pathsUpTo, readingOrder, resumeAt, shownAt } from './order';
import { DEVICE_NOTION, contextualNotion } from './context';
import { SCREEN_ELEMENTS } from './screen';
import { FIGURES } from './figures';
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
      const texts = [n.body, ...n.remember, ...(n.mistakes ?? []).flatMap((m) => [m.belief, m.truth])];
      for (const id of texts.flatMap(linkedNotions)) expect(ids.has(id), `${n.id} cite ${id}`).toBe(true);
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

  test('le lexique ne répète pas le début d’un titre, et se découpe par lettre', () => {
    const words = lexicon(notions).map((w) => w.word);
    expect(words).toContain('ARP : trouver l’adresse MAC');
    expect(words).not.toContain('ARP');
    expect(words).not.toContain('masque');
    // « IP » ne commence pas le titre « Adresse IP » : il reste, à la lettre I.
    const groups = lexiconByLetter(notions);
    expect(groups.find((g) => g.letter === 'I')?.entries.map((e) => e.word)).toContain('IP');
    expect(groups.map((g) => g.letter)).toEqual([...new Set(groups.map((g) => g.letter))]);
    expect(groups.flatMap((g) => g.entries)).toHaveLength(words.length);
  });

  test('la recherche lit aussi le texte des fiches, après les noms, et montre le passage trouvé', () => {
    const [first] = searchHits(notions, 'colis');
    expect(first?.notion.id).toBe('couches');
    expect(first?.excerpt?.match).toBe('colis');
    expect(`${first?.excerpt?.before}${first?.excerpt?.match}${first?.excerpt?.after}`).toMatch(
      /comme un colis que/,
    );
    // Un mot du titre ne donne pas d’extrait.
    expect(searchHits(notions, 'routeur')[0]).toEqual({ notion: notions.find((n) => n.id === 'routeur') });
    const ipconfig = searchNotions(notions, 'ipconfig').map((n) => n.id);
    expect(ipconfig).toContain('adresse-ip');
    // Le début d’un mot seulement : « port » trouve « ports », pas « transporte ».
    const port = searchHits(notions, 'port');
    expect(port.map((h) => h.notion.id)).toContain('switch');
    // « Une liaison transporte… » ne compte pas ; « leur portée » si.
    expect(port.find((h) => h.notion.id === 'liaison')?.excerpt?.after).toMatch(/^ée est limitée/);
    expect(port.every((h) => h.excerpt === undefined || /^port/i.test(h.excerpt.match))).toBe(true);
  });

  test('l’extrait garde les accents du texte et s’arrête à des mots entiers', () => {
    const text =
      'Dans le réseau du collège, chaque poste a une adresse IP unique et un nom bien choisi pour tous.';
    const excerpt = excerptOf(text, 'college');
    expect(excerpt?.match).toBe('collège');
    expect(excerpt?.before).toBe('Dans le réseau du ');
    expect(excerpt?.after.endsWith('…')).toBe(true);
    // Coupé juste avant une espace : le dernier mot est entier.
    expect(text).toContain(`${excerpt?.match}${excerpt?.after.slice(0, -1)} `);
    expect(excerptOf(text, 'absent')).toBeUndefined();
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

  test('l’équipement sélectionné, sinon la dernière fiche lue, sinon rien (l’accueil de l’aide)', () => {
    expect(contextualNotion({ device: 'router', lastRead: 'dns', exists })).toBe('routeur');
    expect(contextualNotion({ lastRead: 'dns', exists })).toBe('dns');
    expect(contextualNotion({ exists })).toBeUndefined();
    // Une fiche masquée par l’enseignant est sautée.
    expect(contextualNotion({ device: 'box', lastRead: 'dns', exists: (id) => id !== 'box' })).toBe('dns');
  });

  test('chaque sorte d’équipement a sa fiche dans le pack par défaut', () => {
    for (const id of Object.values(DEVICE_NOTION)) expect(exists(id)).toBe(true);
  });
});

describe('Touches et éléments de l’écran dans le texte', () => {
  test('[touche:…] donne des touches, [[ecran:…]] un élément connu ou du texte simple', () => {
    expect(parseInline('Annuler : [touche:Ctrl+Z], zoom : [touche:Ctrl++], [touche:+]')).toEqual([
      { type: 'text', text: 'Annuler : ' },
      { type: 'keys', keys: ['Ctrl', 'Z'] },
      { type: 'text', text: ', zoom : ' },
      { type: 'keys', keys: ['Ctrl', '+'] },
      { type: 'text', text: ', ' },
      { type: 'keys', keys: ['+'] },
    ]);
    expect(parseInline('[[ecran:simulation]] ou [[ecran:legende|la légende]] ou [[ecran:inconnu]]')).toEqual([
      { type: 'screen', target: 'simulation', text: 'Simulation', known: true },
      { type: 'text', text: ' ou ' },
      { type: 'screen', target: 'legende', text: 'la légende', known: true },
      { type: 'text', text: ' ou ' },
      { type: 'screen', target: 'inconnu', text: 'inconnu', known: false },
    ]);
    expect(plainText('Cliquez sur [[ecran:verifier]] ou tapez [touche:Ctrl+Z].')).toBe(
      'Cliquez sur Vérifier ou tapez Ctrl+Z.',
    );
    // Un élément de l’écran n’est pas un lien vers une fiche.
    expect(linkedNotions('[[ecran:aide]] et [[masque]]')).toEqual(['masque']);
  });

  test('les fiches fournies ne citent que des éléments connus', () => {
    const screens = DEFAULT_PACK.notions.flatMap((n) =>
      [n.body, ...n.remember, ...(n.mistakes ?? []).flatMap((m) => [m.belief, m.truth])].flatMap((text) =>
        parseRich(text).flatMap((b) =>
          b.type === 'paragraph' ? b.content : b.type === 'list' ? b.items.flat() : [],
        ),
      ),
    );
    const named = screens.filter((i) => i.type === 'screen');
    expect(named.length).toBeGreaterThan(10);
    expect(named.filter((i) => !i.known)).toEqual([]);
    expect(Object.keys(SCREEN_ELEMENTS).length).toBeGreaterThan(20);
  });
});

describe('Erreurs fréquentes', () => {
  test('les fiches clés en ont ; un pack peut en ajouter, une erreur incomplète est refusée', () => {
    const withMistakes = DEFAULT_PACK.notions.filter((n) => (n.mistakes ?? []).length > 0).map((n) => n.id);
    for (const id of ['adresse-ip', 'masque', 'passerelle', 'switch', 'routeur', 'dhcp', 'dns', 'arp'])
      expect(withMistakes).toContain(id);
    const mine = card('perso', { mistakes: [{ belief: 'une idée fausse.', truth: 'la bonne idée.' }] });
    expect(parsePack(serializePack({ notions: [mine] })).notions?.[0]?.mistakes).toEqual(mine.mistakes);
    const broken = serializePack({ notions: [mine] }).replace('"truth": "la bonne idée."', '"truth": ""');
    expect(() => parsePack(broken)).toThrow('notions.0.mistakes.0.truth');
    // La recherche les lit aussi.
    expect(searchNotions(DEFAULT_PACK.notions, 'antivirus').map((n) => n.id)).toEqual(['pare-feu']);
  });
});

describe('Parcours', () => {
  test('premiers pas, puis un parcours par niveau jusqu’à celui de la classe', () => {
    expect(pathsUpTo('5e')).toEqual(['guide', '5e']);
    expect(pathsUpTo('complet')).toEqual(['guide', '5e', '4e', '3e']);
    const notions = DEFAULT_PACK.notions;
    expect(pathCards(notions, 'guide').map((n) => n.id)[0]).toBe('guide-construire');
    expect(pathCards(notions, '4e').every((n) => n.level === '4e' && n.category !== 'guide')).toBe(true);
    // Toutes les fiches sont dans un parcours, une seule fois.
    const all = pathsUpTo('complet').flatMap((p) => pathCards(notions, p));
    expect(new Set(all.map((n) => n.id)).size).toBe(notions.length);
  });

  test('on reprend à la première fiche non lue, ou au début quand tout est lu', () => {
    const cards = [card('a'), card('b'), card('c')];
    expect(resumeAt(cards, new Set(['a']))?.id).toBe('b');
    expect(resumeAt(cards, new Set(['a', 'b', 'c']))?.id).toBe('a');
    expect(resumeAt([], new Set())).toBeUndefined();
  });
});

describe('Schémas', () => {
  test('[[schema:…]] seul dans son paragraphe devient un schéma ; ailleurs, il reste du texte', () => {
    expect(
      parseRich('Avant.\n\n[[schema:couches]]\n\n[[schema:inconnu]]\n\nVoir [[schema:couches]] ici.'),
    ).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Avant.' }] },
      { type: 'figure', figure: 'couches', known: true },
      { type: 'figure', figure: 'inconnu', known: false },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Voir ' },
          { type: 'link', notion: 'schema:couches', text: 'schema:couches' },
          { type: 'text', text: ' ici.' },
        ],
      },
    ]);
    // La recherche lit la description du schéma.
    expect(plainText('[[schema:dns]]')).toContain('www.college.fr');
  });

  test('les fiches fournies utilisent chaque schéma, et seulement des schémas connus', () => {
    const figures = DEFAULT_PACK.notions.flatMap((n) => parseRich(n.body)).filter((b) => b.type === 'figure');
    expect(figures.filter((f) => !f.known)).toEqual([]);
    expect(new Set(figures.map((f) => f.figure))).toEqual(new Set(Object.keys(FIGURES)));
  });
});
