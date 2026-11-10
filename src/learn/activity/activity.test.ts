import { IP_ANY } from '../../engine/core/ipv4';
import { Network } from '../../engine/network';
import { MASK_24, ip, routedNetwork, simpleLan, staticHost } from '../../engine/testing';
import { exampleNetwork } from '../../project/example';
import { serializeProject } from '../../project/serialize';
import { parseLearnFile, serializeLearnFile } from '../file';
import {
  activityProfile,
  currentStep,
  evaluateAll,
  evaluateNow,
  evaluateProbes,
  gateSteps,
  journalEntry,
  progressOf,
  protectedDevices,
  resolveRef,
} from './evaluate';
import {
  EMPTY_WORK,
  activitySchema,
  familyOf,
  objectivesOf,
  type Activity,
  type ActivityInput,
  type Check,
  type Work,
} from './schema';

type CheckInput = ActivityInput['steps'][number]['objectives'] extends (infer O)[] | undefined
  ? O extends { check: infer C }
    ? C
    : never
  : never;

/** An activity with one objective per check, named o0, o1… */
function activity(...checks: CheckInput[]): Activity {
  return activitySchema.parse({
    id: 'test',
    title: 'Test',
    level: '4e',
    steps: [
      {
        id: 'etape',
        title: 'Étape',
        objectives: checks.map((check, i) => ({ id: `o${i}`, label: `Objectif ${i}`, check })),
      },
    ],
  });
}

function statuses(network: Network, checks: CheckInput[], work: Work = EMPTY_WORK): string[] {
  return [...evaluateAll(activity(...checks), network, work).values()].map((o) => o.status);
}

const named = (name: string) => ({ by: 'name', name }) as const;

describe('Vérification des objectifs : état du réseau', () => {
  test('nombre d’équipements', () => {
    const { net } = simpleLan();
    expect(
      statuses(net, [
        { type: 'deviceCount', kind: 'computer', min: 2 },
        { type: 'deviceCount', kind: 'computer', min: 3 },
        { type: 'deviceCount', kind: 'switch' },
        { type: 'deviceCount', kind: 'router' },
        { type: 'deviceCount', kind: 'terminal', min: 1, max: 1 },
        { type: 'deviceCount', kind: 'router', min: 0, max: 0 },
      ]),
    ).toEqual(['done', 'todo', 'done', 'todo', 'todo', 'done']);
  });

  test('équipements reliés, directement ou par des switchs, mais pas à travers un routeur', () => {
    const { net, a, b, r, s1 } = routedNetwork();
    const id = (device: { id: string; name: string }) =>
      ({ by: 'id', id: device.id, label: device.name }) as const;
    expect(
      statuses(net, [
        { type: 'linked', a: id(a), b: id(r) },
        { type: 'linked', a: id(a), b: id(s1) },
        { type: 'linked', a: id(a), b: id(b) },
        { type: 'linked', a: named('a'), b: named('Inconnu') },
        { type: 'linked', a: named('Inconnu'), b: named('a') },
      ]),
    ).toEqual(['done', 'done', 'todo', 'unknown', 'unknown']);
  });

  test('même réseau IP', () => {
    const { net, a, b } = simpleLan();
    const check: CheckInput = { type: 'sameNetwork', devices: [{ by: 'kind', kind: 'computer' }] };
    expect(statuses(net, [check])).toEqual(['done']);
    b.updateConfig({ ip: ip('192.168.1.2') });
    expect(statuses(net, [check])).toEqual(['todo']);
    b.updateConfig({ ip: ip('192.168.0.2'), mask: ip('255.255.0.0') });
    expect(statuses(net, [check])).toEqual(['todo']);
    a.updateConfig({ useDhcp: true });
    expect(evaluateAll(activity(check), net, EMPTY_WORK).get('o0')).toEqual({
      status: 'todo',
      detail: 'A n’a pas d’adresse fixe complète.',
    });
    expect(statuses(net, [{ type: 'sameNetwork', devices: [named('Absent'), named('B')] }])).toEqual([
      'unknown',
    ]);
    expect(statuses(net, [{ type: 'sameNetwork', devices: [{ by: 'kind', kind: 'printer' }] }])).toEqual([
      'unknown',
    ]);
  });

  test('réglages d’un poste : valeur exacte, réseau, renseigné ou non, DHCP', () => {
    const { net, a } = routedNetwork();
    const device = named('A');
    expect(
      statuses(net, [
        { type: 'config', device, field: 'ip', equals: '192.168.1.10' },
        { type: 'config', device, field: 'ip', equals: '192.168.1.11' },
        { type: 'config', device, field: 'ip', inNetwork: '192.168.1.0/24' },
        { type: 'config', device, field: 'ip', inNetwork: '192.168.2.0/24' },
        { type: 'config', device, field: 'gateway', isSet: true },
        { type: 'config', device, field: 'dns', isSet: true },
        { type: 'config', device, field: 'dns', isSet: false },
        { type: 'config', device, field: 'dhcp', isSet: false },
        { type: 'config', device, field: 'dhcp', equals: 'oui' },
        { type: 'config', device: { by: 'kind', kind: 'computer' }, field: 'mask', equals: '255.255.255.0' },
        { type: 'config', device: named('R'), field: 'ip', isSet: true },
        { type: 'config', device: named('Absent'), field: 'ip', isSet: true },
      ]),
    ).toEqual([
      'done',
      'todo',
      'done',
      'todo',
      'done',
      'todo',
      'done',
      'done',
      'todo',
      'done',
      'todo',
      'unknown',
    ]);
    // Une adresse reçue d'un serveur DHCP n'est pas un réglage de l'élève.
    a.updateConfig({ useDhcp: true });
    expect(statuses(net, [{ type: 'config', device, field: 'ip', isSet: true }])).toEqual(['todo']);
    expect(statuses(net, [{ type: 'config', device, field: 'dhcp' }])).toEqual(['done']);
  });

  test('interface de routeur, logiciel installé, serveur démarré', () => {
    const { net, b } = routedNetwork();
    b.install('webserver');
    const router = named('R');
    const checks: CheckInput[] = [
      { type: 'routerInterface', device: router, inNetwork: '192.168.2.0/24' },
      { type: 'routerInterface', device: router, inNetwork: '10.0.0.0/8' },
      { type: 'routerInterface', device: named('A'), inNetwork: '192.168.1.0/24' },
      { type: 'routerInterface', device: named('Absent'), inNetwork: '192.168.1.0/24' },
      { type: 'installed', device: named('B'), app: 'webserver' },
      { type: 'installed', device: named('A'), app: 'webserver' },
      { type: 'serviceRunning', device: named('B'), app: 'webserver' },
    ];
    expect(statuses(net, checks)).toEqual(['done', 'todo', 'todo', 'unknown', 'done', 'todo', 'todo']);
    b.webServer.setActive(true);
    expect(statuses(net, checks)[6]).toBe('done');
  });

  test('vérification du réseau sans point signalé', () => {
    const { net, a } = routedNetwork();
    expect(statuses(net, [{ type: 'lintClean' }])).toEqual(['done']);
    a.updateConfig({ gateway: IP_ANY });
    expect(evaluateAll(activity({ type: 'lintClean' }), net, EMPTY_WORK).get('o0')).toEqual({
      status: 'todo',
      detail: '1 point(s) signalé(s) par Vérifier.',
    });
    expect(statuses(net, [{ type: 'lintClean', ignore: ['gateway-missing'] }])).toEqual(['done']);
  });
});

describe('Vérification des objectifs : tests sur une copie', () => {
  test('ping vers un équipement ou une adresse ; échec attendu', () => {
    const { net, b } = routedNetwork();
    const checks: CheckInput[] = [
      { type: 'ping', from: named('A'), to: named('B') },
      { type: 'ping', from: named('A'), to: { by: 'address', address: '192.168.2.10' } },
      { type: 'ping', from: named('A'), to: { by: 'address', address: '192.168.2.99' } },
      { type: 'ping', from: named('A'), to: named('B'), expect: 'fail' },
      { type: 'ping', from: named('Absent'), to: named('B') },
      { type: 'ping', from: named('A'), to: named('Absent') },
    ];
    expect(statuses(net, checks)).toEqual(['done', 'done', 'todo', 'todo', 'unknown', 'unknown']);
    // Un pare-feu qui doit bloquer : l'objectif « échec » est atteint.
    b.firewall.setEnabled(true);
    expect(statuses(net, checks).slice(0, 4)).toEqual(['todo', 'todo', 'todo', 'done']);
    expect(net.running).toBe(false);
  });

  test('nom traduit par le DNS et page web obtenue, dans le réseau d’exemple', () => {
    const net = exampleNetwork();
    const before = serializeProject(net);
    const poste = named('Poste 1');
    const checks: CheckInput[] = [
      { type: 'resolves', from: poste, name: 'www.college.fr' },
      { type: 'resolves', from: poste, name: 'www.inconnu.fr' },
      { type: 'httpGet', from: poste, url: 'http://www.college.fr/' },
      { type: 'httpGet', from: poste, url: 'http://www.college.fr/', contains: 'Bienvenue' },
      { type: 'httpGet', from: poste, url: 'http://www.college.fr/', contains: 'Texte absent' },
      { type: 'httpGet', from: poste, url: 'http://www.college.fr/absente.html' },
      { type: 'httpGet', from: named('Absent'), url: 'http://www.college.fr/' },
      { type: 'httpGet', from: named('Routeur'), url: 'http://www.college.fr/' },
      { type: 'resolves', from: named('Absent'), name: 'www.college.fr' },
    ];
    expect(statuses(net, checks)).toEqual([
      'done',
      'todo',
      'done',
      'done',
      'todo',
      'todo',
      'unknown',
      'todo',
      'unknown',
    ]);
    expect(serializeProject(net)).toBe(before);
  });
});

describe('Vérification des objectifs : ce que l’élève a fait', () => {
  test('commande lancée, simulation démarrée', () => {
    const { net, a } = simpleLan();
    const checks: CheckInput[] = [
      { type: 'commandRan', command: 'ping' },
      { type: 'commandRan', command: 'ping', device: named('A') },
      { type: 'commandRan', command: 'ipconfig', device: named('B') },
      { type: 'commandRan', command: 'ping', device: named('Absent') },
      { type: 'simulationStarted' },
    ];
    expect(statuses(net, checks)).toEqual(['todo', 'todo', 'todo', 'unknown', 'todo']);
    const work: Work = { ...EMPTY_WORK, commands: [journalEntry(a.id, 'ping')], simulated: true };
    expect(statuses(net, checks, work)).toEqual(['done', 'done', 'todo', 'unknown', 'done']);
  });
});

describe('Activité : familles de vérifications, équipements protégés, profil', () => {
  const both = activity(
    { type: 'deviceCount', kind: 'computer' },
    { type: 'ping', from: named('A'), to: named('B') },
    { type: 'simulationStarted' },
  );

  test('seuls les tests sur copie attendent la demande de l’élève', () => {
    expect(objectivesOf(both).map((o) => familyOf(o.check))).toEqual(['state', 'probe', 'journal']);
    const { net } = simpleLan();
    expect([...evaluateNow(both, net, EMPTY_WORK).keys()]).toEqual(['o0', 'o2']);
    expect([...evaluateProbes(both, net).keys()]).toEqual(['o1']);
    expect(progressOf(objectivesOf(both), new Set(['o0', 'o1']))).toBeCloseTo(2 / 3);
    expect(progressOf([], new Set())).toBe(1);
  });

  test('les étapes se font dans l’ordre : un objectif d’une étape fermée ne compte pas encore', () => {
    const one = (id: string, check: CheckInput) => [{ id, label: 'x', check }];
    const ordered = activitySchema.parse({
      id: 'ordre',
      title: 'Ordre',
      level: '4e',
      steps: [
        {
          id: 'un',
          title: 'Un',
          objectives: one('trois-postes', { type: 'deviceCount', kind: 'computer', min: 3 }),
        },
        { id: 'deux', title: 'Deux', objectives: one('propre', { type: 'lintClean' }) },
        { id: 'trois', title: 'Trois', objectives: one('switch', { type: 'deviceCount', kind: 'switch' }) },
      ],
    });
    const { net, sw } = simpleLan();
    const gated = () =>
      [...gateSteps(ordered, evaluateAll(ordered, net, EMPTY_WORK)).values()].map((o) => o.status);
    // Le réseau est propre et a un switch, mais la première étape n'est pas finie.
    expect(gated()).toEqual(['todo', 'locked', 'locked']);
    expect(currentStep(ordered, new Set())).toBe(0);
    const c = staticHost(net, 'C', '192.168.0.3');
    expect(gated()).toEqual(['done', 'todo', 'locked']);
    net.connect(c.id, sw.id);
    expect(gated()).toEqual(['done', 'done', 'done']);
    expect(currentStep(ordered, new Set(['trois-postes']))).toBe(1);
    expect(currentStep(ordered, new Set(['trois-postes', 'propre', 'switch']))).toBe(2);
  });

  test('désigne un équipement par identifiant, par nom (sans accents ni casse) ou par sorte', () => {
    const net = new Network();
    const a = staticHost(net, 'Poste Élève', '10.0.0.1');
    net.addHost('printer');
    expect(resolveRef(net, { by: 'id', id: a.id, label: 'x' })).toEqual([a]);
    expect(resolveRef(net, { by: 'id', id: 'zz', label: 'x' })).toEqual([]);
    expect(resolveRef(net, named('  poste eleve '))).toEqual([a]);
    expect(resolveRef(net, { by: 'kind', kind: 'printer' })).toHaveLength(1);
    expect(resolveRef(net, { by: 'kind', kind: 'tablet' })).toEqual([]);
  });

  test('les équipements du réseau de départ cités par leur identifiant sont protégés', () => {
    const withIds = activity(
      { type: 'ping', from: { by: 'id', id: 'n1', label: 'A' }, to: { by: 'id', id: 'n2', label: 'B' } },
      { type: 'sameNetwork', devices: [{ by: 'id', id: 'n3', label: 'C' }, named('Nouveau')] },
      { type: 'config', device: { by: 'kind', kind: 'computer' }, field: 'ip', isSet: true },
    );
    expect([...protectedDevices(withIds)].sort()).toEqual(['n1', 'n2', 'n3']);
    expect(protectedDevices(both).size).toBe(0);
  });

  test('profil de l’activité : niveau et écarts connus de cette version', () => {
    expect(activityProfile(both)).toBeNull();
    const parsed = activitySchema.parse({
      id: 'p',
      title: 'P',
      level: '4e',
      profile: { base: '4e', show: ['device:router'], hide: ['cmd:arp'] },
      steps: [{ id: 's', title: 'S' }],
    });
    expect(activityProfile(parsed)).toEqual({ base: '4e', show: ['device:router'], hide: ['cmd:arp'] });
  });
});

describe('Fichier d’activité', () => {
  const sample: ActivityInput = {
    id: 'premier-reseau',
    title: 'Mon premier réseau',
    level: '5e',
    duration: 30,
    intro: 'Relie **deux ordinateurs**.',
    steps: [
      {
        id: 'cabler',
        title: 'Câbler',
        body: 'Voir [[switch]].',
        hints: ['Utilise l’outil Câble.'],
        notions: ['switch'],
        objectives: [
          {
            id: 'deux-postes',
            label: 'Deux ordinateurs',
            check: { type: 'deviceCount', kind: 'computer', min: 2 },
          },
        ],
      },
    ],
  };

  test('un projet garde son activité et le travail de l’élève', () => {
    const { net } = simpleLan();
    const parsedActivity = activitySchema.parse(sample);
    const work: Work = {
      ...EMPTY_WORK,
      student: { name: 'Camille Dupont', className: '4e B' },
      conclusion: 'Un switch relie les ordinateurs.',
      startedAt: 1_700_000_000_000,
      reachedAt: { 'deux-postes': 1_700_000_060_000 },
      done: ['deux-postes'],
      hints: { cabler: 1 },
      commands: ['n1:ping'],
      simulated: true,
    };
    const text = serializeLearnFile(net, { activity: parsedActivity, work });
    const read = parseLearnFile(text);
    expect(read.activity).toEqual(parsedActivity);
    expect(read.work).toEqual(work);
    expect(serializeProject(read.network)).toBe(serializeProject(net));
    // Les valeurs par défaut sont complétées à la lecture.
    expect(read.activity?.steps[0]?.objectives[0]?.check).toEqual({
      type: 'deviceCount',
      kind: 'computer',
      min: 2,
    });
  });

  test('un projet simple reste un fichier valide ; le nom de l’élève peut l’accompagner sans activité', () => {
    const { net } = simpleLan();
    const plain = parseLearnFile(serializeProject(net));
    expect(plain.activity).toBeNull();
    expect(plain.work).toBeNull();
    expect(serializeLearnFile(net, { activity: null, work: null })).toBe(serializeProject(net));
    const signed = { ...EMPTY_WORK, student: { name: 'Sacha', className: '3e A' } };
    const read = parseLearnFile(serializeLearnFile(net, { activity: null, work: signed }));
    expect(read.activity).toBeNull();
    expect(read.work?.student).toEqual({ name: 'Sacha', className: '3e A' });
    // Un travail enregistré avant le compte rendu se relit, complété des valeurs par défaut.
    const old = JSON.parse(serializeLearnFile(net, { activity: null, work: null })) as Record<
      string,
      unknown
    >;
    old.work = { done: ['x'], hints: {}, commands: [], simulated: true };
    expect(parseLearnFile(JSON.stringify(old)).work).toEqual({ ...EMPTY_WORK, done: ['x'], simulated: true });
  });

  test('un fichier invalide est refusé en entier', () => {
    const { net } = simpleLan();
    const file = (change: (data: { activity: Record<string, unknown> }) => void) => {
      const data = JSON.parse(
        serializeLearnFile(net, { activity: activitySchema.parse(sample), work: null }),
      ) as {
        activity: Record<string, unknown>;
      };
      change(data);
      return JSON.stringify(data);
    };
    expect(() => parseLearnFile('{cassé')).toThrow('JSON illisible');
    expect(() => parseLearnFile(file((d) => (d.activity.level = '6e')))).toThrow(
      'Projet invalide (activity.level)',
    );
    expect(() => parseLearnFile(file((d) => (d.activity.steps = [])))).toThrow('activity.steps');
    expect(() =>
      parseLearnFile(
        file((d) => {
          const steps = d.activity.steps as { objectives: { check: Check | { type: string } }[] }[];
          const first = steps[0]?.objectives[0];
          if (first) first.check = { type: 'eval', code: 'alert(1)' } as unknown as Check;
        }),
      ),
    ).toThrow('Projet invalide (activity.steps.0.objectives.0.check');
    expect(() =>
      parseLearnFile(
        file((d) => {
          const steps = d.activity.steps as { id: string }[];
          steps.push({ ...(steps[0] as { id: string }) });
        }),
      ),
    ).toThrow('l’identifiant « cabler » sert deux fois');
    expect(() => parseLearnFile(' '.repeat(20_000_001))).toThrow('trop volumineux');
  });

  test('routeurs et postes configurés servent de point de départ à une sonde', () => {
    const { net, r } = routedNetwork();
    r.setInterface(1, { ip: ip('192.168.2.1'), mask: MASK_24 });
    expect(statuses(net, [{ type: 'ping', from: named('R'), to: named('B') }])).toEqual(['done']);
  });
});
