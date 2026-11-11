import type { Network } from '../../engine/network';
import { MASK_24, ip } from '../../engine/testing';
import { DEFAULT_PACK } from '../content/default-pack';
import { lintNetwork } from '../diagnose/lint';
import { linkedNotions } from '../richtext';
import { BUILTIN_ACTIVITIES } from './builtin';
import { currentStep, evaluateAll, gateSteps, journalEntry } from './evaluate';
import { askQuestion, drawSalt, markAnswer } from './questions';
import { EMPTY_WORK, objectivesOf, type Activity, type Work } from './schema';

const find = (network: Network, name: string) => {
  const device = network.devices.find((d) => d.name === name);
  if (!device) throw new Error(`« ${name} » introuvable`);
  return device;
};

/** Every question of the activity answered rightly (open ones with a sentence). */
function answerAll(activity: Activity, work: Work): Work {
  const answers = { ...work.answers };
  for (const objective of objectivesOf(activity)) {
    if (objective.check.type !== 'question') continue;
    const item = askQuestion(objective.id, objective.check.question, drawSalt(work));
    const given =
      item === null
        ? 'Une réponse rédigée.'
        : item.kind === 'choice'
          ? item.correct
          : item.kind === 'order'
            ? item.solution
            : (item.accepted[0] ?? '');
    answers[objective.id] = markAnswer(item, given, 0);
  }
  return { ...work, answers };
}

/** What a pupil who succeeds does, for each activity: changes to the network, and the journal. */
const SOLUTIONS: Record<string, (network: Network) => Work> = {
  'premier-reseau': (network) => {
    const a = network.addHost('computer', { config: { ip: ip('192.168.1.1'), mask: MASK_24 } });
    const b = network.addHost('computer', { config: { ip: ip('192.168.1.2'), mask: MASK_24 } });
    const sw = network.addSwitch();
    network.connect(a.id, sw.id);
    network.connect(b.id, sw.id);
    return { ...EMPTY_WORK, simulated: true, commands: [journalEntry(a.id, 'ping')] };
  },
  'objet-connecte': (network) => {
    const object = network.addHost('object', { config: { ip: ip('192.168.0.3'), mask: MASK_24 } });
    network.connect(object.id, find(network, 'Switch').id);
    return {
      ...EMPTY_WORK,
      simulated: true,
      commands: [journalEntry(find(network, 'Ordinateur 1').id, 'ping')],
    };
  },
  'reseau-maison': (network) => {
    const box = find(network, 'Box');
    const pc = network.addHost('computer', { config: { useDhcp: true } });
    const phone = network.addHost('smartphone', { config: { useDhcp: true } });
    network.connect(pc.id, box.id);
    network.joinWifi(phone.id, 'Maison');
    return { ...EMPTY_WORK, simulated: true, commands: [journalEntry(pc.id, 'ipconfig')] };
  },
  'deux-reseaux': (network) => {
    const router = network.router(find(network, 'Routeur').id);
    network.connect(router.id, find(network, 'Switch salle A').id);
    network.connect(router.id, find(network, 'Switch salle B').id);
    router.setInterface(0, { ip: ip('192.168.1.1'), mask: MASK_24 });
    router.setInterface(1, { ip: ip('192.168.2.1'), mask: MASK_24 });
    for (const [name, gateway] of [
      ['Poste A1', '192.168.1.1'],
      ['Poste A2', '192.168.1.1'],
      ['Poste B1', '192.168.2.1'],
    ] as const) {
      network.host(find(network, name).id).updateConfig({ gateway: ip(gateway) });
    }
    return {
      ...EMPTY_WORK,
      simulated: true,
      commands: [journalEntry(find(network, 'Poste A1').id, 'traceroute')],
    };
  },
  'salle-techno': (network) => {
    const poste1 = find(network, 'Poste 1').id;
    const sw = find(network, 'Switch salle').id;
    // Partie 1 : brancher Poste 4, la tablette en Wi-Fi.
    network.connect(find(network, 'Poste 4').id, sw);
    network.joinWifi(find(network, 'Tablette').id, 'Salle-Techno');
    // Partie 2 : les trois pannes, puis la station météo.
    network.host(find(network, 'Poste 3').id).updateConfig({ ip: ip('192.168.10.3') });
    network.host(find(network, 'Imprimante').id).updateConfig({ ip: ip('192.168.10.30') });
    network.host(find(network, 'Tablette').id).updateConfig({ ip: ip('192.168.10.21') });
    const station = network.host(find(network, 'Station météo').id);
    network.connect(station.id, sw);
    station.updateConfig({ ip: ip('192.168.10.50'), mask: MASK_24 });
    // Bonus : un serveur DHCP et un smartphone en configuration automatique.
    const server = network.host(find(network, 'Serveur').id);
    server.install('dhcpserver');
    server.dhcpServer.updateConfig({ rangeStart: ip('192.168.10.100'), rangeEnd: ip('192.168.10.150') });
    server.dhcpServer.setActive(true);
    const phone = network.addHost('smartphone', { config: { useDhcp: true } });
    network.joinWifi(phone.id, 'Salle-Techno');
    const { activity } = BUILTIN_ACTIVITIES.find((a) => a.id === 'salle-techno')?.build() ?? {};
    const work = {
      ...EMPTY_WORK,
      simulated: true,
      commands: [journalEntry(poste1, 'ipconfig'), journalEntry(poste1, 'ping')],
    };
    return activity ? answerAll(activity, work) : work;
  },
  depannage: (network) => {
    network.connect(find(network, 'Routeur').id, find(network, 'Switch serveurs').id);
    const web = network.host(find(network, 'Serveur web').id);
    web.updateConfig({ gateway: ip('192.168.2.1') });
    web.webServer.setActive(true);
    return { ...EMPTY_WORK, simulated: true, commands: [journalEntry(find(network, 'Poste 1').id, 'ping')] };
  },
};

describe('Activités fournies', () => {
  const notions = new Set(DEFAULT_PACK.notions.map((n) => n.id));

  test('chacune a une solution prévue par ces tests', () => {
    expect(BUILTIN_ACTIVITIES.map((a) => a.id).sort()).toEqual(Object.keys(SOLUTIONS).sort());
    expect(new Set(BUILTIN_ACTIVITIES.map((a) => a.id)).size).toBe(BUILTIN_ACTIVITIES.length);
  });

  test.each(BUILTIN_ACTIVITIES.map((a) => [a.title, a] as const))(
    '%s : présentation cohérente',
    (_title, builtin) => {
      const { activity } = builtin.build();
      expect(activity.id).toBe(builtin.id);
      expect(activity.title).toBe(builtin.title);
      expect(activity.level).toBe(builtin.level);
      expect(builtin.summary.length).toBeGreaterThan(30);
      const ids = [...activity.steps.map((s) => s.id), ...objectivesOf(activity).map((o) => o.id)];
      expect(new Set(ids).size).toBe(ids.length);
      // Les fiches citées existent, dans la liste de l'étape comme dans le texte.
      for (const step of activity.steps) {
        for (const id of [...step.notions, ...linkedNotions(step.body)])
          expect(notions.has(id), `${step.id} → ${id}`).toBe(true);
        expect(step.hints.length, step.id).toBeGreaterThanOrEqual(1);
      }
      for (const id of linkedNotions(activity.intro)) expect(notions.has(id), id).toBe(true);
      expect(objectivesOf(activity).length).toBeGreaterThanOrEqual(5);
    },
  );

  test.each(BUILTIN_ACTIVITIES.map((a) => [a.title, a] as const))(
    '%s : rien n’est fait au départ, tout est validé par la solution',
    (_title, builtin) => {
      const { network, activity } = builtin.build();
      const start = gateSteps(activity, evaluateAll(activity, network, EMPTY_WORK));
      const done = (outcomes: typeof start) =>
        [...outcomes].filter(([, o]) => o.status === 'done').map(([id]) => id);
      // Au départ, aucun objectif n'est atteint : les étapes se font dans l'ordre.
      expect(done(start)).toEqual([]);
      expect(currentStep(activity, new Set(done(start)))).toBe(
        activity.steps.findIndex((s) => s.objectives.length > 0),
      );

      const solve = SOLUTIONS[builtin.id];
      expect(solve).toBeDefined();
      const work = solve?.(network) ?? EMPTY_WORK;
      const end = gateSteps(activity, evaluateAll(activity, network, work));
      expect([...end].filter(([, o]) => o.status !== 'done').map(([id, o]) => `${id}: ${o.status}`)).toEqual(
        [],
      );
      expect(done(end)).toHaveLength(objectivesOf(activity).length);
      expect(currentStep(activity, new Set(done(end)))).toBe(activity.steps.length - 1);
    },
  );

  test('La salle de techno : trois vraies pannes au départ ; la salle se répare avant la station', () => {
    const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === 'salle-techno');
    if (!builtin) throw new Error('salle-techno');
    const { network, activity } = builtin.build();
    const status = (id: string) => evaluateAll(activity, network, EMPTY_WORK).get(id)?.status;
    // Ce qui fonctionne déjà : Poste 1, le serveur et sa page.
    expect(status('ping-serveur')).toBe('done');
    expect(status('ent-affiche')).toBe('done');
    // Les pannes, le poste à brancher, la station à installer.
    for (const id of [
      'poste4-relie',
      'tablette-wifi',
      'poste3-repare',
      'imprimante-reparee',
      'tablette-reparee',
      'salle-saine',
      'station-reliee',
      'station-joignable',
      'mesures-lues',
    ])
      expect(status(id), id).toBe('todo');
    const codes = lintNetwork(network).map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['ip-duplicate', 'not-cabled', 'wifi-not-joined']));

    // Partie 1, puis les pannes une à une : la salle n'est saine qu'à la dernière.
    const sw = find(network, 'Switch salle').id;
    network.connect(find(network, 'Poste 4').id, sw);
    network.joinWifi(find(network, 'Tablette').id, 'Salle-Techno');
    network.host(find(network, 'Poste 3').id).updateConfig({ ip: ip('192.168.10.3') });
    expect(status('poste3-repare')).toBe('done');
    network.host(find(network, 'Imprimante').id).updateConfig({ ip: ip('192.168.10.30') });
    expect(status('imprimante-reparee')).toBe('done');
    expect(status('salle-saine')).toBe('todo');
    network.host(find(network, 'Tablette').id).updateConfig({ ip: ip('192.168.10.21') });
    expect(status('tablette-reparee')).toBe('done');
    expect(status('salle-saine')).toBe('done');
    // La station n'est pas encore installée : Vérifier la signale encore.
    expect(status('reseau-sain')).toBe('todo');
    expect(status('mesures-lues')).toBe('todo');
  });

  test('chaque appel construit un nouveau réseau de départ', () => {
    const [first] = BUILTIN_ACTIVITIES;
    expect(first?.build().network).not.toBe(first?.build().network);
  });
});
