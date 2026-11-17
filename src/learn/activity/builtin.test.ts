import { formatIp } from '../../engine/core/ipv4';
import type { Host } from '../../engine/devices/host';
import type { Network } from '../../engine/network';
import { LineClient } from '../../engine/services/echo';
import { httpGet, type HttpResult } from '../../engine/services/http';
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
    const given = item === null ? 'Une réponse rédigée.' : rightAnswer(item);
    answers[objective.id] = markAnswer(item, given, 0);
  }
  return { ...work, answers };
}

/** What `traceroute 203.0.113.80` prints on a host: the last word of each hop line, or whole texts. */
function traceroute(sim: Network, host: Host, whole = false): string[] {
  const out: string[] = [];
  const terminal = new Terminal(host, { print: (line) => out.push(line), clear: () => undefined });
  let finished = false;
  terminal.execute('traceroute 203.0.113.80', () => {
    finished = true;
  });
  runBounded(sim, () => finished, 120_000);
  return out
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
    /** Première réponse acceptée, ou texte du bon choix, d'une question de l'activité. */
    const expected = (id: string): string => {
      const check = objectivesOf(activity).find((o) => o.id === id)?.check;
      if (check?.type !== 'question') throw new Error(id);
      const q = check.question;
      if (q.type === 'short') return q.accepted[0] ?? '';
      if (q.type === 'mcq') return q.choices[q.correct[0] ?? -1] ?? '';
      throw new Error(id);
    };

    // « Représenter des données » : la taille lue dans l'explorateur du Serveur.
    const server = network.host(find(network, 'Serveur').id);
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

    const { sim } = prepareProbe(network);
    // En simulation aussi : c'est là que l'élève ouvre l'explorateur.
    expect(sim.host(server.id).fs.isReadOnly('/Documents/Commun')).toBe(true);
    const poste1 = sim.host(find(network, 'Poste 1').id);
    const sensor = sim.host(find(network, 'Capteur CO2').id);
    const display = sim.host(find(network, 'Afficheur').id);

    // Le fichier exporté par le capteur : du texte, une mesure par ligne, des points-virgules.
    let page: HttpResult | null = null;
    httpGet(poste1, 'http://192.168.10.50/mesures.csv', (result) => {
      page = result;
    });
    runBounded(sim, () => page !== null, 30_000);
    const csv = page as HttpResult | null;
    if (csv?.kind !== 'ok') throw new Error('mesures.csv');
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
    expect(traceroute(sim, poste1)).toEqual([
      '192.168.10.254',
      '82.64.12.1',
      '198.51.100.2',
      '192.0.2.2',
      '203.0.113.80',
    ]);
    expect(traceroute(sim, poste1).at(-2)).toBe(expected('q-traceroute'));

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
