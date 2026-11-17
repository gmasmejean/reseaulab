import { IP_ANY, formatIp, parseIp, sameNetwork } from '../../engine/core/ipv4';
import { Host } from '../../engine/devices/host';
import type { Network } from '../../engine/network';
import { LineClient } from '../../engine/services/echo';
import { httpGet, type HttpResponse, type HttpResult } from '../../engine/services/http';
import { lookupRoute, nextHop } from '../../engine/stack/routing';
import { Terminal } from '../../engine/terminal/terminal';
import { MASK_24, ip } from '../../engine/testing';
import { DEFAULT_PACK } from '../content/default-pack';
import { lintNetwork } from '../diagnose/lint';
import { tracePath } from '../diagnose/trace';
import { linkedNotions } from '../richtext';
import { rightAnswer } from '../quiz/quiz';
import { prepareProbe, runBounded } from '../sim/probe';
import { BUILTIN_ACTIVITIES } from './builtin';
import { currentStep, evaluateAll, gateSteps, journalEntry, protectedDevices } from './evaluate';
import { guardOf } from './protect';
import { askQuestion, drawSalt, markAnswer, partsOf } from './questions';
import { EMPTY_WORK, objectivesOf, type Activity, type ActivityQuestion, type Work } from './schema';

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
    const given = item === null ? 'Une réponse rédigée.' : rightAnswer(item);
    answers[objective.id] = markAnswer(item, given, 0);
  }
  return { ...work, answers };
}

/**
 * The expected answers of the questions of an activity, as these tests read
 * them — and which questions they have read. An answer that the pupil reads
 * in the simulator must be confronted with what the simulator shows: a test
 * reads it here and compares. What is never read is listed by `unread`, to be
 * declared as a question of knowledge (bilan B10).
 */
function expectedAnswers(activity: Activity) {
  const questions = new Map<string, ActivityQuestion>();
  for (const objective of objectivesOf(activity))
    if (objective.check.type === 'question') questions.set(objective.id, objective.check.question);
  const read = new Set<string>();
  const question = (id: string): ActivityQuestion => {
    const found = questions.get(id);
    if (!found) throw new Error(`« ${id} » n’est pas une question de l’activité`);
    read.add(id);
    return found;
  };
  /** Choices of a multiple-choice question, right ones then wrong ones. */
  const choices = (id: string): { right: string[]; wrong: string[] } => {
    const q = question(id);
    if (q.type !== 'mcq') throw new Error(`« ${id} » n’est pas une question à choix`);
    return {
      right: q.correct.map((index) => q.choices[index] ?? ''),
      wrong: q.choices.filter((_, index) => !q.correct.includes(index)),
    };
  };
  return {
    choices,
    /** First accepted text of a short answer, or text of the first right choice. */
    text: (id: string): string => {
      const q = question(id);
      if (q.type === 'short') return q.accepted[0] ?? '';
      return choices(id).right[0] ?? '';
    },
    /** Every text accepted for a short answer. */
    accepted: (id: string): readonly string[] => {
      const q = question(id);
      if (q.type !== 'short') throw new Error(`« ${id} » n’est pas une réponse courte`);
      return q.accepted;
    },
    /** The pairs of an association. */
    pairs: (id: string): readonly (readonly [string, string])[] => {
      const q = question(id);
      if (q.type !== 'match') throw new Error(`« ${id} » n’est pas une association`);
      return q.pairs;
    },
    prompt: (id: string): string => question(id).prompt,
    explanation: (id: string): string => question(id).explanation,
    /** Questions that no test has read, in the order of the activity. */
    unread: (): string[] => [...questions.keys()].filter((id) => !read.has(id)),
  };
}

/** What a command prints in the terminal of a host, once it has finished. */
function run(sim: Network, host: Host, command: string): string[] {
  const out: string[] = [];
  const terminal = new Terminal(host, { print: (line) => out.push(line), clear: () => undefined });
  let finished = false;
  terminal.execute(command, () => {
    finished = true;
  });
  runBounded(sim, () => finished, 120_000);
  return out;
}

/** What `ipconfig` shows on a host for a line: « Adresse IPv4 » → « 192.168.10.1 ». */
function shownByIpconfig(sim: Network, host: Host): (label: string) => string {
  const lines = run(sim, host, 'ipconfig');
  return (label) => lines.find((line) => line.includes(label))?.split(' : ')[1] ?? '';
}

/** The page a host receives from a web server, through the simulated network. */
function fetchPage(sim: Network, host: Host, url: string): HttpResponse {
  let page: HttpResult | null = null;
  httpGet(host, url, (result) => {
    page = result;
  });
  runBounded(sim, () => page !== null, 30_000);
  const result = page as HttpResult | null;
  if (result?.kind !== 'ok') throw new Error(`${url} : pas de réponse`);
  return result.response;
}

/** The rows of the table of measures of a page, cell by cell (the header row has none). */
const tableRows = (html: string): string[][] =>
  [...html.matchAll(/<tr>(.*?)<\/tr>/g)]
    .map(([, row = '']) => [...row.matchAll(/<td>(.*?)<\/td>/g)].map(([, cell = '']) => cell))
    .filter((cells) => cells.length > 0);

/** Where a router sends a packet for `to`: the next address, or null without a route. */
function nextHopOf(network: Network, router: string, to: string): string | null {
  const route = lookupRoute(network.router(find(network, router).id).stack.routes(), ip(to));
  return route ? formatIp(nextHop(route, ip(to))) : null;
}

/** Whether a device is a terminal (computer, server, tablet, object…) and not a switch or a router. */
const isTerminal = (network: Network, name: string) => find(network, name) instanceof Host;

/** Whether every terminal of the network `net`/24 is linked to the same switch `hub`: a star. */
function isStar(network: Network, hub: string, net: string): boolean {
  const centre = find(network, hub).id;
  const members = network.devices.filter(
    (d) => d instanceof Host && sameNetwork(d.config.ip, ip(net), MASK_24),
  );
  return (
    members.length > 3 &&
    members.every((d) => network.cables.some((c) => [c.a, c.b].includes(d.id) && [c.a, c.b].includes(centre)))
  );
}

/** What `traceroute 203.0.113.80` prints on a host: the last word of each hop line, or whole texts. */
function traceroute(sim: Network, host: Host, whole = false): string[] {
  return run(sim, host, 'traceroute 203.0.113.80')
    .filter((line) => /^\s*\d+\s/.test(line))
    .map((line) => {
      const words = line.trim().split(/\s+/);
      const text = words.slice(1).join(' ');
      return whole && !text.includes(' ms ') ? text : (words.at(-1) ?? '');
    });
}

/** Du collège au musée : la partie 1 réparée, et la passerelle sur chaque ordinateur du CDI. */
function repairLibrary(network: Network): void {
  const sw = find(network, 'Switch CDI').id;
  network.connect(find(network, 'Poste 3').id, sw);
  network.joinWifi(find(network, 'Tablette').id, 'CDI-College');
  network.host(find(network, 'Poste 2').id).updateConfig({ ip: ip('192.168.10.2') });
  const sensor = network.host(find(network, 'Capteur CO2').id);
  network.connect(sensor.id, sw);
  sensor.updateConfig({ ip: ip('192.168.10.50'), mask: MASK_24 });
  for (const name of ['Poste 1', 'Poste 2', 'Poste 3'])
    network.host(find(network, name).id).updateConfig({ gateway: ip('192.168.10.254') });
}

/** Du collège au musée : la route qui manque au Routeur Internet. */
function routeToDataCenter(network: Network): void {
  const core = network.router(find(network, 'Routeur Internet').id);
  core.setStaticRoutes([
    ...core.staticRoutes,
    { destination: ip('203.0.113.0'), mask: MASK_24, gateway: ip('192.0.2.2'), iface: 0 },
  ]);
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
  'college-musee': (network) => {
    const poste1 = find(network, 'Poste 1').id;
    repairLibrary(network);
    routeToDataCenter(network);
    network.host(poste1).updateConfig({ dns: ip('80.10.0.53') });
    // Deux objets qui communiquent : l'afficheur écoute le capteur.
    network.host(find(network, 'Afficheur').id).echoServer.setActive(true);
    // Bonus : relier la médiathèque au FAI.
    const fai = network.router(find(network, 'Routeur du FAI').id);
    network.addRouterInterface(fai.id);
    network.connect(fai.id, find(network, 'Routeur de la médiathèque').id);
    fai.setInterface(3, { ip: ip('82.64.13.1'), mask: MASK_24 });
    fai.setStaticRoutes([
      ...fai.staticRoutes,
      { destination: ip('192.168.20.0'), mask: MASK_24, gateway: ip('82.64.13.34'), iface: 3 },
    ]);
    const { activity } = BUILTIN_ACTIVITIES.find((a) => a.id === 'college-musee')?.build() ?? {};
    const work = {
      ...EMPTY_WORK,
      simulated: true,
      commands: ['ipconfig', 'ping', 'traceroute', 'nslookup'].map((c) => journalEntry(poste1, c)),
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

/**
 * Questions of knowledge: nothing in the simulator gives their answer (a
 * notion of the lesson, good practice, a reasoning, an exercise on paper, an
 * open answer), or the engine draws and corrects them itself (« même
 * réseau ? »). Every other question is confronted with the simulator by the
 * tests « ce que l’élève doit observer ».
 */
const KNOWLEDGE: Record<string, readonly string[]> = {
  'college-musee': [
    'q-lan',
    'q-cable-wifi',
    'q-usurpation',
    'q-octet',
    'q-meme-reseau',
    'q-demarche',
    'q-donnees-collectees',
    'q-internet',
    'q-role-routeur',
    'q-passerelle',
    'q-chemin-complet',
    'q-aller-retour',
    'q-protocole-routage',
    'q-role-dns',
    'q-client-serveur',
    'q-etapes-requete',
    'q-paquets',
    'q-protocole',
    'q-protocoles-roles',
    'q-classer-debits',
    'q-format-message',
    'q-convenir',
    'q-strategique',
    'q-bilan',
    'q-defi-trajet',
    'q-defi-retour',
    'q-defi-panne',
    'q-defi-nat',
    'q-defi-justifier',
  ],
  'salle-techno': [
    'q-usages',
    'q-lan',
    'q-serveur',
    'q-routeur',
    'q-carte',
    'q-wifi',
    'q-sans-adresse',
    'q-unique',
    'q-mot-de-passe',
    'q-session',
    'q-compte',
    'q-droit-auteur',
    'q-cyberviolence',
    'q-octet',
    'q-masque-role',
    'q-meme-reseau',
    'q-ping-echec',
    'q-demarche',
    'q-pannes',
    'q-adresse-fixe',
    'q-trajet',
    'q-dhcp',
    'q-cookie',
    'q-geolocalisation',
    'q-identite',
    'q-donnees-station',
    'q-bilan',
    'q-dhcp-fixe',
    'q-meme-reseau-2',
    'q-meme-reseau-3',
  ],
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

  test('Du collège au musée : vraies pannes au CDI, puis le chemin se répare route, DNS et site', () => {
    const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === 'college-musee');
    if (!builtin) throw new Error('college-musee');
    const { network, activity } = builtin.build();
    const status = (id: string) => evaluateAll(activity, network, EMPTY_WORK).get(id)?.status;
    for (const id of [
      'poste3-relie',
      'tablette-wifi',
      'poste2-repare',
      'ping-poste2',
      'cdi-sain',
      'capteur-joignable',
      'mesures-lues',
      'passerelles',
      'ping-fai',
      'ping-musee',
      'dns-regle',
      'nom-traduit',
      'site-affiche',
      'ping-mediatheque',
    ])
      expect(status(id), id).toBe('todo');
    expect(lintNetwork(network).map((f) => f.code)).toEqual(
      expect.arrayContaining(['not-cabled', 'wifi-not-joined', 'ip-missing']),
    );

    // Partie 1 et passerelles : le CDI est sain, le FAI répond, le musée pas encore.
    repairLibrary(network);
    for (const id of ['poste2-repare', 'ping-poste2', 'cdi-sain', 'mesures-lues', 'passerelles', 'ping-fai'])
      expect(status(id), id).toBe('done');
    const poste1 = find(network, 'Poste 1').id;
    expect(status('ping-musee')).toBe('todo');
    expect(tracePath(network, poste1, { kind: 'text', text: '203.0.113.80' }).findings[0]?.code).toBe(
      'trace-router-no-route',
    );

    // La route ajoutée : le musée répond, mais son nom n'est pas traduit sans DNS.
    routeToDataCenter(network);
    expect(status('ping-musee')).toBe('done');
    expect(status('site-affiche')).toBe('todo');
    network.host(poste1).updateConfig({ dns: ip('80.10.0.53') });
    expect(status('nom-traduit')).toBe('done');
    expect(status('site-affiche')).toBe('done');
    // La médiathèque reste à relier (bonus).
    expect(status('ping-mediatheque')).toBe('todo');
  });

  test('Du collège au musée : l’infrastructure est protégée, et la solution ne fait qu’y ajouter', () => {
    const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === 'college-musee');
    if (!builtin) throw new Error('college-musee');
    const { network, activity } = builtin.build();
    const guard = guardOf(activity);
    const protect = activity.protect;
    if (!protect) throw new Error('protect');
    // Tout ce qui est protégé existe dans le réseau de départ.
    for (const device of protect.devices) expect(network.device(device.id), device.id).toBeDefined();
    for (const id of protect.cables) expect(network.cable(id), id).toBeDefined();
    // Du collège au musée, plus aucun routeur ne peut perdre une route ou une interface de départ.
    for (const name of [
      'Routeur du collège',
      'Routeur du FAI',
      'Routeur Internet',
      'Routeur du data center',
    ]) {
      const router = network.router(find(network, name).id);
      expect(
        router.staticRoutes.every((_, i) => guard.route(router.id, i)),
        name,
      ).toBe(true);
      expect(
        router.interfaces.every((_, i) => guard.iface(router.id, i)),
        name,
      ).toBe(true);
      expect(protectedDevices(activity).has(router.id), name).toBe(true);
    }
    // Les postes que l'élève règle restent libres ; leurs câbles de départ, eux, sont gardés.
    for (const name of ['Poste 1', 'Poste 2', 'Poste 3', 'Tablette', 'Capteur CO2', 'Serveur'])
      expect(guard.device(find(network, name).id), name).toBe(false);
    const poste1Cable = network.cables.find((c) => c.a === find(network, 'Poste 1').id);
    expect(poste1Cable && guard.cable(poste1Cable.id)).toBe(true);

    // La solution complète (bonus compris) laisse intact tout ce qui est protégé.
    const before = protect.devices.map(({ id, routes, interfaces }) => {
      const device = network.device(id);
      const router = device?.kind === 'router' ? network.router(id) : null;
      return JSON.stringify({
        name: device?.name,
        routes: router?.staticRoutes.slice(0, routes),
        interfaces: router?.interfaces.slice(0, interfaces).map((i) => [i.ip, i.mask]),
      });
    });
    SOLUTIONS['college-musee']?.(network);
    const after = protect.devices.map(({ id, routes, interfaces }) => {
      const device = network.device(id);
      const router = device?.kind === 'router' ? network.router(id) : null;
      return JSON.stringify({
        name: device?.name,
        routes: router?.staticRoutes.slice(0, routes),
        interfaces: router?.interfaces.slice(0, interfaces).map((i) => [i.ip, i.mask]),
      });
    });
    expect(after).toEqual(before);
    for (const id of protect.cables) expect(network.cable(id), id).toBeDefined();
  });

  test('Du collège au musée : ce que l’élève doit observer est bien ce que montre le simulateur', () => {
    const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === 'college-musee');
    if (!builtin) throw new Error('college-musee');
    const { network, activity } = builtin.build();
    SOLUTIONS['college-musee']?.(network);
    const answers = expectedAnswers(activity);
    const expected = answers.text;

    // « Le réseau du CDI » : les équipements nommés sont bien ce que les questions en disent.
    const terminals = answers.choices('q-terminaux');
    expect(terminals.right.filter((name) => !isTerminal(network, name))).toEqual([]);
    expect(terminals.wrong.filter((name) => isTerminal(network, name))).toEqual([]);
    expect(answers.pairs('q-roles').map(([device]) => find(network, device).kind)).toEqual([
      'switch',
      'server',
      'router',
    ]);
    // Tout le CDI tient au même switch, une fois Poste 3, la tablette et le capteur reliés.
    expect(isStar(network, 'Switch CDI', '192.168.10.0')).toBe(true);
    expect(expected('q-topologie')).toBe('En étoile');
    expect(isStar(builtin.build().network, 'Switch CDI', '192.168.10.0')).toBe(false);

    // « Représenter des données » : la taille lue dans l'explorateur du Serveur.
    const server = network.host(find(network, 'Serveur').id);
    // « Fichiers et bons usages » : le fichier de Nora est bien là où la réponse le dit.
    expect(server.fs.list('/Documents/3A/Nora').map((e) => e.name)).toContain('carte-cables.png');
    for (const path of answers.accepted('q-chemin'))
      expect(server.fs.readFile(path.replaceAll('\\', '/').replace(/^(?!\/)/, '/')), path).not.toBeNull();
    const title = server.fs.list('/Documents/3A/Nora').find((e) => e.name === 'titre.txt');
    expect(String(title?.size)).toBe(expected('q-texte'));

    // « Fichiers et bons usages » : le dossier Commun refuse ce que la consigne fait essayer.
    expect(server.fs.isReadOnly('/Documents/Commun')).toBe(true);
    expect(() => {
      server.fs.mkdir('/Documents/Commun/essai');
    }).toThrow('Dossier en lecture seule : /Documents/Commun');
    expect(() => {
      server.fs.remove('/Documents/Commun/charte-informatique.pdf');
    }).toThrow('Dossier en lecture seule : /Documents/Commun');
    server.fs.writeFile('/Documents/3A/Nora/brouillon.txt', 'x');
    server.fs.remove('/Documents/3A/Nora/brouillon.txt');
    // … mais ses fichiers se consultent : c'est ce que dit la bonne réponse.
    expect(server.fs.readFile('/Documents/Commun/charte-informatique.pdf')).not.toBeNull();
    expect(expected('q-droits')).toMatch(/^Consulter ses fichiers, mais ni les modifier/);

    const { sim } = prepareProbe(network);
    // En simulation aussi : c'est là que l'élève ouvre l'explorateur.
    expect(sim.host(server.id).fs.isReadOnly('/Documents/Commun')).toBe(true);
    const poste1 = sim.host(find(network, 'Poste 1').id);
    const sensor = sim.host(find(network, 'Capteur CO2').id);
    const display = sim.host(find(network, 'Afficheur').id);

    // « Adresse IP et masque » : ce que ipconfig affiche sur Poste 1.
    const shown = shownByIpconfig(sim, poste1);
    expect(shown('Adresse IPv4')).toBe('192.168.10.1');
    expect(shown('Masque de sous-réseau')).toBe('255.255.255.0 (/24)');
    expect(shown('Adresse IPv4').split('.').slice(0, 3).join('.')).toBe(expected('q-partie-reseau'));
    expect(answers.prompt('q-partie-reseau')).toContain(shown('Masque de sous-réseau').split(' ')[0]);
    // Le routeur du collège a bien les deux adresses de la question ; une seule est publique.
    const school = network.router(find(network, 'Routeur du collège').id);
    const sides = school.interfaces.filter((i) => i.ip !== IP_ANY).map((i) => formatIp(i.ip));
    const isPrivate = (address: string) => address.startsWith('192.168.');
    expect(sides).toHaveLength(2);
    for (const side of sides) expect(answers.prompt('q-privee')).toContain(side);
    expect(answers.choices('q-privee').right).toEqual(sides.filter((side) => !isPrivate(side)));
    expect(answers.choices('q-privee').wrong).toEqual(expect.arrayContaining(sides.filter(isPrivate)));

    // Le fichier exporté par le capteur : du texte, une mesure par ligne, des points-virgules.
    const csv = { response: fetchPage(sim, poste1, 'http://192.168.10.50/mesures.csv') };
    expect(csv.response.status).toBe(200);
    expect(csv.response.headers['content-type']).toBe('text/csv');
    const lines = csv.response.body.trim().split('\n');
    expect(lines[0]).toBe('heure;co2_ppm;temperature_c');
    expect(lines).toHaveLength(10);
    expect(lines.every((line) => line.split(';').length === 3)).toBe(true);
    expect(expected('q-format')).toContain(';');
    // Les mêmes mesures que la page du capteur : premier dépassement de 1000 ppm à 10:00.
    const over = lines.slice(1).find((line) => Number(line.split(';')[1]) > 1000);
    expect(over?.split(';')[0]).toBe(expected('q-aerer'));
    // La page du capteur, lue dans le navigateur : mêmes mesures, et des CO2 en nombres entiers.
    const measures = tableRows(fetchPage(sim, poste1, 'http://192.168.10.50/').body);
    expect(measures.map((row) => row.join(';'))).toEqual(lines.slice(1));
    expect(measures.find((row) => Number(row[1]) > 1000)?.[0]).toBe(expected('q-aerer'));
    expect(measures.every((row) => /^\d+$/.test(row[1] ?? ''))).toBe(true);
    expect(expected('q-type-co2')).toBe('Nombre entier');

    // « Deux objets qui communiquent » : port 8 refusé, port 7 accepté, émetteur écrit au journal.
    const say = (port: number, message?: string): string[] => {
      const seen: string[] = [];
      let over = false;
      const client = new LineClient(sensor, {
        connected: (remote) => {
          seen.push(`Connecté à ${remote}`);
          if (message !== undefined) client.send(message);
        },
        line: (line) => {
          seen.push(`← ${line}`);
          client.disconnect();
        },
        closed: (text) => {
          seen.push(text);
          over = true;
        },
      });
      client.connect('192.168.10.51', port);
      runBounded(sim, () => over, 30_000);
      return seen;
    };
    expect(say(8)).toEqual([expected('q-mauvais-canal')]);
    expect(say(7, 'CO2:1150')).toEqual(['Connecté à 192.168.10.51:7', '← CO2:1150', 'Connexion fermée']);
    expect(display.echoServer.log.map((entry) => entry.text)).toContain(
      `${expected('q-expediteur')} : CO2:1150`,
    );

    // traceroute, une fois le chemin réparé : le dernier routeur avant le musée.
    const path = traceroute(sim, poste1);
    expect(path).toEqual(['192.168.10.254', '82.64.12.1', '198.51.100.2', '192.0.2.2', '203.0.113.80']);
    expect(path.at(-2)).toBe(expected('q-traceroute'));
    // « Internet, un réseau de réseaux » : autant de routeurs que de lignes avant le musée.
    expect(String(path.length - 1)).toBe(expected('q-nb-routeurs'));
    const owners = path
      .slice(0, -1)
      .map(
        (hop) =>
          network.devices.find(
            (d) => d.kind === 'router' && network.router(d.id).interfaces.some((i) => i.ip === ip(hop)),
          )?.name,
      );
    expect(owners).toEqual([
      'Routeur du collège',
      'Routeur du FAI',
      'Routeur Internet',
      'Routeur du data center',
    ]);

    // « Lire une table de routage » : chaque réponse est ce que la table du routeur décide.
    const museum = formatIp(network.host(find(network, 'Serveur du musée').id).config.ip);
    expect(formatIp(network.host(poste1.id).config.gateway)).toBe(expected('q-premier-saut'));
    expect(path[0]).toBe(expected('q-premier-saut'));
    expect(
      school.staticRoutes.map(
        (r) => `${formatIp(r.destination)} / ${formatIp(r.mask)} → ${formatIp(r.gateway)}`,
      ),
    ).toEqual(['0.0.0.0 / 0.0.0.0 → 82.64.12.1']);
    expect(answers.prompt('q-route-defaut')).toContain('0.0.0.0 / 0.0.0.0 → 82.64.12.1');
    expect(nextHopOf(network, 'Routeur du collège', museum)).toBe('82.64.12.1');
    expect(expected('q-route-defaut')).toContain(`routeur du FAI (${path[1] ?? ''})`);
    expect(answers.prompt('q-saut-fai')).toContain(museum);
    expect(nextHopOf(network, 'Routeur du FAI', museum)).toBe(expected('q-saut-fai'));
    expect(answers.prompt('q-saut-retour')).toContain(shown('Adresse IPv4'));
    expect(nextHopOf(network, 'Routeur du FAI', shown('Adresse IPv4'))).toBe(expected('q-saut-retour'));

    // « Du nom à l'adresse » : ce que nslookup répond, et c'est bien l'adresse du Serveur du musée.
    expect(run(sim, poste1, 'nslookup www.musee-des-reseaux.fr').at(-1)).toBe(
      `www.musee-des-reseaux.fr  A  ${expected('q-adresse-musee')}`,
    );
    expect(expected('q-adresse-musee')).toBe(museum);

    // « Paquets et protocoles » : les paquets de la requête, dans « Échanges de données » de Poste 1.
    poste1.capture.clear();
    const home = fetchPage(sim, poste1, 'http://www.musee-des-reseaux.fr/').body;
    const requests = poste1.capture.entries.flatMap((entry) => {
      const packet = entry.frame.payload;
      const sent = entry.direction === 'out' && packet.kind === 'ipv4' && packet.payload.kind === 'tcp';
      return sent && packet.payload.dstPort === 80
        ? [`${formatIp(packet.src)} → ${formatIp(packet.dst)}`]
        : [];
    });
    expect(requests.length).toBeGreaterThan(0);
    expect([...new Set(requests)]).toEqual([`192.168.10.1 → ${expected('q-adresse-destination')}`]);

    // « Les enjeux du numérique » : les réponses se lisent dans la page du musée.
    expect(home).toContain('<h1>Musée des réseaux</h1>');
    expect(home).toContain(expected('q-cables').replace(/^Des /, ''));
    expect(home).toContain('plus de 95 %');
    expect(answers.explanation('q-cables')).toContain('Plus de 95 %');
    expect(home).toMatch(/serveur est rangé avec des milliers d’autres dans un data center/);
    expect(expected('q-data-center')).toContain('rempli de serveurs');
    expect(home).toContain('la fabrication de nos appareils qui pèse le plus');
    expect(answers.explanation('q-empreinte')).toContain('La fabrication des appareils pèse plus');
    const jobs = answers.choices('q-metiers').right;
    expect(jobs).toHaveLength(3);
    for (const [index, word] of ['technicien réseau', 'installateur de fibre', 'cybersécurité'].entries()) {
      expect(home).toContain(word);
      expect(jobs[index]?.toLowerCase()).toContain(word.split(' ').at(-1));
    }

    // Les calculs : la réponse attendue est le résultat du calcul que la question pose.
    expect(Number(expected('q-image'))).toBe(100 * 100 * 3);
    expect(Number(expected('q-temps-photo'))).toBe((4 * 8) / 8);
    expect(Number(expected('q-temps-video'))).toBe((1500 * 8) / 100);
    expect(expected('q-debit-unite')).toBe(`${1000 / 8} Mo`);
    expect(Number(expected('q-binaire'))).toBe(0b1010);

    // Avant réparation (seule la passerelle est réglée) : l'élève trouve la panne lui-même.
    const broken = builtin.build().network;
    repairLibrary(broken);
    const probe = prepareProbe(broken).sim;
    const hops = traceroute(probe, probe.host(find(broken, 'Poste 1').id), true);
    expect(hops.at(-1)).toBe('198.51.100.2 : destination inaccessible');
    const last = expected('q-dernier-routeur');
    expect(hops.slice(0, -1)).toEqual(['192.168.10.254', '82.64.12.1', last]);
    // Le routeur qui porte cette adresse est celui que la question désigne…
    const owner = broken.devices.find(
      (d) => d.kind === 'router' && broken.router(d.id).interfaces.some((i) => i.ip === ip(last)),
    );
    expect(owner?.name).toBe('Routeur Internet');
    expect(expected('q-routeur-en-cause')).toBe(`Le ${owner?.name ?? ''}`);
    // … et sa table n'a ni ligne pour le réseau du musée, ni route par défaut.
    const routes = broken.router(owner?.id ?? '').staticRoutes;
    expect(routes.map((r) => formatIp(r.destination))).toEqual(['192.168.10.0', '82.64.12.0', '80.10.0.0']);
    expect(routes.some((r) => (ip('203.0.113.80') & r.mask) >>> 0 === r.destination)).toBe(false);
    expect(nextHopOf(broken, 'Routeur Internet', '203.0.113.80')).toBeNull();
    expect(expected('q-table-incomplete')).toBe(
      'Aucune ligne pour le réseau du musée, et pas de route par défaut',
    );

    // Toute autre question est une question de cours, sans rien à lire dans le simulateur.
    // Une question ajoutée à l'activité arrive ici : la confronter ci-dessus, ou la déclarer.
    expect(answers.unread()).toEqual(KNOWLEDGE['college-musee']);
  });

  test('La salle de techno : ce que l’élève doit observer est bien ce que montre le simulateur', () => {
    const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === 'salle-techno');
    if (!builtin) throw new Error('salle-techno');
    const { network, activity } = builtin.build();
    SOLUTIONS['salle-techno']?.(network);
    const answers = expectedAnswers(activity);
    const expected = answers.text;

    // Partie 1 : les équipements nommés, la topologie, les fichiers du serveur.
    const terminals = answers.choices('q-terminaux');
    expect(terminals.right.filter((name) => !isTerminal(network, name))).toEqual([]);
    expect(terminals.wrong.filter((name) => isTerminal(network, name))).toEqual([]);
    expect(find(network, 'Switch salle').kind).toBe('switch');
    expect(answers.prompt('q-switch')).toContain('« Switch salle »');
    expect(isStar(network, 'Switch salle', '192.168.10.0')).toBe(true);
    expect(expected('q-topologie')).toBe('En étoile');
    const server = network.host(find(network, 'Serveur').id);
    for (const path of answers.accepted('q-chemin'))
      expect(server.fs.readFile(path.replaceAll('\\', '/').replace(/^(?!\/)/, '/')), path).not.toBeNull();
    // Le plan de la salle, dans le dossier de Léa : son extension est celle que la réponse attend.
    const plans = server.fs.list('/Documents/4A/Lea').filter((e) => e.name.startsWith('plan'));
    expect(plans.map((e) => e.name.split('.').at(-1))).toEqual([expected('q-extension')]);
    expect(server.fs.isReadOnly('/Documents/Commun')).toBe(true);
    expect(() => {
      server.fs.mkdir('/Documents/Commun/essai');
    }).toThrow('Dossier en lecture seule : /Documents/Commun');
    expect(server.fs.readFile('/Documents/Commun/charte-informatique.pdf')).not.toBeNull();
    expect(expected('q-droits')).toMatch(/^Consulter ses fichiers, mais ni les modifier/);

    // Partie 2 : ce que ipconfig affiche sur Poste 1.
    const { sim } = prepareProbe(network);
    const poste1 = sim.host(find(network, 'Poste 1').id);
    const shown = shownByIpconfig(sim, poste1);
    expect(shown('Adresse IPv4')).toBe(expected('q-ip-poste1'));
    expect(shown('Masque de sous-réseau')).toBe(`${expected('q-masque-poste1')} (/24)`);
    expect(shown('Adresse IPv4').split('.').slice(0, 3).join('.')).toBe(expected('q-partie-reseau'));
    expect(answers.prompt('q-partie-reseau')).toContain(expected('q-masque-poste1'));
    // Une adresse est valide si le simulateur l'accepte.
    const addresses = answers.choices('q-ip-valides');
    expect(addresses.right.filter((text) => parseIp(text) === null)).toEqual([]);
    expect(addresses.wrong.filter((text) => parseIp(text) !== null)).toEqual([]);
    // 192.168.10.2 est déjà l'adresse de Poste 2.
    expect(answers.prompt('q-pas-deux')).toContain(
      formatIp(network.host(find(network, 'Poste 2').id).config.ip),
    );
    expect(expected('q-pas-deux')).toContain('Poste 2');

    // « Lire les mesures » : la table que la station sert au navigateur de Poste 1.
    const page = fetchPage(sim, poste1, 'http://192.168.10.50/').body;
    const rows = tableRows(page).map(([hour = '', temperature = '', humidity = '']) => ({
      hour,
      temperature: Number(temperature.replace(',', '.')),
      humidity: Number(humidity),
      decimal: temperature.includes(','),
    }));
    expect(rows).toHaveLength(9);
    const hottest = rows.reduce((best, row) => (row.temperature > best.temperature ? row : best));
    expect(hottest.hour).toBe(expected('q-maximum'));
    expect(rows.every((row) => row.decimal)).toBe(true);
    expect(expected('q-type')).toBe('Nombre décimal');
    expect(page).toContain(`<th>Humidité (${expected('q-unite')})</th>`);
    expect(answers.prompt('q-type')).toContain('« Température (°C) »');
    expect(page).toContain('<th>Température (°C)</th>');
    // D'une heure à la suivante, l'humidité baisse quand la température monte, et inversement.
    for (const [index, row] of rows.entries()) {
      const before = rows[index - 1];
      if (before)
        expect(Math.sign(row.humidity - before.humidity), row.hour).toBe(
          -Math.sign(row.temperature - before.temperature),
        );
    }
    expect(expected('q-tendance')).toBe('Elle baisse');

    // « Internet » : les deux côtés du routeur du collège.
    const router = network.router(find(network, 'Routeur du collège').id);
    const sides = router.interfaces.filter((i) => i.ip !== IP_ANY).map((i) => formatIp(i.ip));
    expect(sides.filter((side) => !side.startsWith('192.168.'))).toEqual([expected('q-ip-publique')]);
    expect(answers.prompt('q-fai')).toContain(expected('q-ip-publique'));
    expect(answers.prompt('q-privee')).toContain(`${shown('Adresse IPv4')} de Poste 1`);
    expect(expected('q-privee')).toContain('adresse privée');

    // Bonus « masques » : le calcul que fait le simulateur.
    expect(sameNetwork(ip('192.168.10.5'), ip('192.168.20.7'), ip('255.255.0.0'))).toBe(true);
    expect(answers.prompt('q-masque-16')).toContain('192.168.10.5 et 192.168.20.7');
    expect(expected('q-masque-16')).toMatch(/^Oui/);
    expect(Number(expected('q-bits'))).toBe(8);
    expect(Number(expected('q-valeurs'))).toBe(2 ** 8);

    expect(answers.unread()).toEqual(KNOWLEDGE['salle-techno']);
  });

  test('le plan d’adressage est vérifié : un poste réparé hors de sa plage n’est pas accepté', () => {
    for (const [id, poste, objective, object] of [
      ['college-musee', 'Poste 2', 'poste2-repare', 'Capteur CO2'],
      ['salle-techno', 'Poste 3', 'poste3-repare', 'Station météo'],
    ] as const) {
      const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === id);
      if (!builtin) throw new Error(id);
      const { network, activity } = builtin.build();
      const host = network.host(find(network, poste).id);
      const outcome = (address: string) => {
        host.updateConfig({ ip: ip(address) });
        return evaluateAll(activity, network, EMPTY_WORK).get(objective);
      };
      // .77 est dans le bon réseau mais hors du plan ; .50 est l'adresse réservée à l'objet connecté.
      for (const address of ['192.168.10.77', '192.168.10.50'])
        expect(outcome(address)).toEqual({
          status: 'todo',
          detail: 'Hors du plan d’adressage : de 192.168.10.1 à 192.168.10.9.',
        });
      expect(outcome('192.168.10.8')).toEqual({ status: 'done' });
      // L'objet connecté prendra .50 : l'adresse est restée libre pour lui.
      expect(formatIp(network.host(find(network, object).id).config.ip)).not.toBe('192.168.10.50');
    }
  });

  test('Du collège au musée : consigne courte, trois parties qui disent la séance et quand enregistrer', () => {
    const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === 'college-musee');
    if (!builtin) throw new Error('college-musee');
    const { activity } = builtin.build();
    // La consigne : la mission, le plan d'adressage, la règle des questions. Rien de plus.
    expect(activity.intro.split('\n\n')).toHaveLength(3);
    expect(activity.intro.length).toBeLessThan(900);
    expect(activity.intro).toContain('Plan d’adressage du CDI');
    expect(activity.intro).not.toContain('adresse publique');
    // L'explication « adresse privée remplacée par l'adresse publique » est là où la table du FAI la rend utile.
    const table = activity.steps.find((s) => s.id === 'lire-table');
    expect(table?.body).toContain('Le simulateur ne fait pas ce remplacement');
    expect(table?.notions).toContain('ip-privee-publique');
    expect(table?.body).not.toContain('1re séance');

    const parts = partsOf(activity);
    expect(parts.map((p) => [p.title, p.steps[0]?.id, p.steps.length])).toEqual([
      ['Séance 1 — Partie 1 : ce que je sais depuis la 5e et la 4e', 'reseau-cdi', 6],
      ['Séance 1 — Partie 2 : Internet, un réseau de réseaux', 'reseau-de-reseaux', 3],
      ['Séance 2 — Partie 3 : trouver la panne, atteindre le musée', 'trouver-panne', 10],
      ['Bonus', 'bonus-mediatheque', 2],
    ]);
    // Le repère de fin de séance est sous le titre de la partie suivante, pas au fond d'une consigne.
    expect(parts[2]?.note).toContain('La 1re séance s’arrête ici');
    expect(parts[2]?.note).toContain('[[ecran:enregistrer]]');
    expect(parts[2]?.note).toContain('[[ecran:ouvrir]]');
  });

  test('chaque appel construit un nouveau réseau de départ', () => {
    const [first] = BUILTIN_ACTIVITIES;
    expect(first?.build().network).not.toBe(first?.build().network);
  });
});
