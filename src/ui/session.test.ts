import { IP_ANY } from '../engine/core/ipv4';
import { LINK_DELAY, Network } from '../engine/network';
import { MASK_24, ip } from '../engine/testing';
import { BUILTIN_ACTIVITIES } from '../learn/activity/builtin';
import { EMPTY_STEP, emptyDraft, type Draft } from '../learn/activity/draft';
import { askQuestion, askRetry, drawSalt } from '../learn/activity/questions';
import { EMPTY_WORK } from '../learn/activity/schema';
import { suggestObjectives } from '../learn/activity/suggest';
import { serializePack } from '../learn/content/schema';
import { parseLearnFile } from '../learn/file';
import { rightAnswer } from '../learn/quiz/quiz';
import { serializeProject } from '../project/serialize';
import fixture from '../project/filius/fixtures/konfiguration.xml?raw';
import { FILIUS_CONFIG_ENTRY } from '../project/filius';
import { OPTIONAL_BUILTIN, QUESTIONS_BUILTIN } from '../test/activities';
import { ManualFrames, MemoryStorage } from '../test/doubles';
import { makeZip } from '../test/zip';
import {
  AUTOMATIC_PROTOCOLS,
  AUTOSAVE_DATE_KEY,
  AUTOSAVE_KEY,
  DROP_MARK_MS,
  HIDE_AUTOMATIC_KEY,
  HISTORY_DELAY_MS,
  HISTORY_LIMIT,
  Session,
  ZOOM_STEPS,
  contentSize,
  isTeacherAddress,
  labelScale,
  projectBaseName,
} from './session';

function lan(session: Session): { a: string; b: string } {
  const a = session.addDevice('computer');
  const b = session.addDevice('computer');
  const sw = session.addDevice('switch');
  session.network.host(a).updateConfig({ ip: ip('10.0.0.1'), mask: MASK_24 });
  session.network.host(b).updateConfig({ ip: ip('10.0.0.2'), mask: MASK_24 });
  session.setTool('cable');
  session.cableClick(a);
  session.cableClick(sw);
  session.cableClick(b);
  session.cableClick(sw);
  return { a, b };
}

describe('Session', () => {
  test('ajoute des équipements à des positions distinctes et les sélectionne', () => {
    const session = new Session();
    const ids = Array.from({ length: 9 }, () => session.addDevice('computer'));
    expect(session.selection).toEqual({ kind: 'device', id: ids[8] });
    const positions = session.network.devices.map((d) => `${String(d.position.x)},${String(d.position.y)}`);
    expect(new Set(positions).size).toBe(9);
  });

  test('pose des câbles avec l’outil câble et signale les erreurs', () => {
    const session = new Session();
    const a = session.addDevice('computer');
    const b = session.addDevice('computer');
    session.setTool('cable');
    session.cableClick(a);
    expect(session.cableStart).toBe(a);
    session.cableClick(a); // même équipement : annule
    expect(session.cableStart).toBeNull();
    session.cableClick(a);
    session.cableClick(b);
    expect(session.network.cables).toHaveLength(1);
    expect(session.selection?.kind).toBe('cable');
    session.cableClick(a);
    session.cableClick(b); // un ordinateur n’a qu’une carte réseau
    expect(session.notice?.kind).toBe('error');
  });

  test('supprime la sélection en mode conception uniquement', () => {
    const session = new Session(null, new ManualFrames());
    const { a } = lan(session);
    session.select({ kind: 'device', id: a });
    session.setMode('simulation');
    session.deleteSelection();
    expect(session.network.device(a)).toBeDefined();
    session.setMode('design');
    session.deleteSelection();
    expect(session.network.device(a)).toBeUndefined();
    expect(session.network.cables).toHaveLength(1);
    session.select({ kind: 'cable', id: session.network.cables[0]?.id ?? '' });
    session.deleteSelection();
    expect(session.network.cables).toHaveLength(0);
  });

  test('la simulation avance avec l’horloge, au rythme de la vitesse choisie', () => {
    const frames = new ManualFrames();
    const session = new Session(null, frames);
    lan(session);
    session.setMode('simulation');
    expect(session.network.running).toBe(true);
    expect(frames.active).toBe(true);
    session.setSpeed(1);
    frames.step(0);
    frames.step(50);
    frames.step(500); // plafonné à 100 ms par image
    expect(session.network.scheduler.now).toBe(150);
    session.togglePause();
    expect(frames.active).toBe(false);
    session.togglePause();
    expect(frames.active).toBe(true);
    session.setMode('design');
    expect(frames.active).toBe(false);
    expect(session.network.running).toBe(false);
  });

  test('mémorise les trames en vol pour l’animation puis les oublie', () => {
    const frames = new ManualFrames();
    const session = new Session(null, frames);
    const { a } = lan(session);
    session.setMode('simulation');
    session.setSpeed(1);
    frames.step(0);
    const results: string[] = [];
    session.network.host(a).stack.icmp.ping(ip('10.0.0.2'), {}, (r) => results.push(r.kind));
    expect(session.inFlight.length).toBeGreaterThan(0);
    expect(session.inFlight[0]?.protocol).toBe('arp');
    // Ralenti : chaque traversée de câble dure HOP_MS (400 ms) à × 1.
    frames.step(100);
    expect(session.network.scheduler.now).toBeLessThan(LINK_DELAY);
    for (let i = 0; i < 60; i++) frames.step(100);
    expect(session.inFlight).toHaveLength(0);
    expect(results).toEqual(['reply']);
  });

  test('masque le trafic automatique (DHCP, RIP) : ni animé ni ralenti, mais bien échangé', () => {
    const storage = new MemoryStorage();
    const frames = new ManualFrames();
    const session = new Session(storage, frames);
    session.loadExample();
    session.setHideAutomatic(true);
    expect(storage.getItem(HIDE_AUTOMATIC_KEY)).toBe('oui');
    session.setMode('simulation');
    session.setSpeed(1);
    frames.step(0);
    const shown = new Set<string>();
    for (let i = 0; i < 30; i++) {
      frames.step(100);
      for (const f of session.inFlight) shown.add(f.protocol);
    }
    expect(shown).toEqual(new Set());
    // Pas de ralenti : 3 s réelles = 3 s simulées.
    expect(session.network.scheduler.now).toBe(3000);
    const laptopId = session.network.devices.find((d) => d.name === 'Portable')?.id ?? '';
    const laptop = session.network.host(laptopId);
    expect(laptop.stack.interfaces[0]?.ip).not.toBe(IP_ANY);
    // Le trafic de l’élève reste animé.
    laptop.stack.icmp.ping(ip('192.168.1.1'), {}, () => undefined);
    expect(session.inFlight.length).toBeGreaterThan(0);
    // Préférence mémorisée pour la prochaine visite.
    expect(new Session(storage).hideAutomatic).toBe(true);
  });

  test('par défaut, le trafic automatique est animé ; le masquer efface les trames en vol', () => {
    const frames = new ManualFrames();
    const session = new Session(null, frames);
    expect(session.hideAutomatic).toBe(false);
    session.loadExample();
    session.setMode('simulation');
    frames.step(0);
    expect(session.inFlight.some((f) => f.protocol === 'dhcp')).toBe(true);
    session.setHideAutomatic(true);
    expect(session.inFlight.some((f) => AUTOMATIC_PROTOCOLS.has(f.protocol))).toBe(false);
  });

  test('gère les fenêtres : unicité, premier plan, déplacement, fermeture', () => {
    const session = new Session(null, new ManualFrames());
    const { a, b } = lan(session);
    session.setMode('simulation');
    session.openWindow({ type: 'desktop', deviceId: a });
    session.openWindow({ type: 'desktop', deviceId: b });
    session.openWindow({ type: 'desktop', deviceId: a });
    expect(session.windows).toHaveLength(2);
    const top = session.windows.reduce((x, y) => (x.z > y.z ? x : y));
    expect(top.id).toBe(`desktop:${a}`);
    session.moveWindow(top.id, 10, 20);
    expect(session.windows.find((w) => w.id === top.id)).toMatchObject({ x: 10, y: 20 });
    session.openWindow({ type: 'help' });
    session.setMode('design');
    expect(session.windows.map((w) => w.id)).toEqual(['help']);
    session.closeWindow('help');
    expect(session.windows).toHaveLength(0);
  });

  test('sauvegarde automatiquement et restaure le projet', () => {
    vi.useFakeTimers();
    try {
      const storage = new MemoryStorage();
      const session = new Session(storage);
      session.addDevice('router');
      expect(storage.data.has(AUTOSAVE_KEY)).toBe(false);
      vi.advanceTimersByTime(1000);
      expect(storage.data.has(AUTOSAVE_KEY)).toBe(true);
      const restored = new Session(storage);
      expect(restored.network.devices.map((d) => d.kind)).toEqual(['router']);
    } finally {
      vi.useRealTimers();
    }
  });

  test('ignore une sauvegarde corrompue et un stockage plein', () => {
    const storage = new MemoryStorage();
    storage.setItem(AUTOSAVE_KEY, '{pas du json');
    const session = new Session(storage);
    expect(session.network.devices).toHaveLength(0);
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => {
      session.saveNow();
    }).not.toThrow();
  });

  test('ouvre un projet valide et refuse un fichier invalide', () => {
    const session = new Session();
    const net = new Network();
    net.addSwitch({ name: 'Cœur' });
    expect(session.openProject(serializeProject(net), 'cours.reseaulab.json')).toBe(true);
    expect(session.fileName).toBe('cours.reseaulab.json');
    expect(session.network.devices[0]?.name).toBe('Cœur');
    expect(session.openProject('{"format":"autre"}', 'x.json')).toBe(false);
    expect(session.notice?.kind).toBe('error');
    expect(session.network.devices[0]?.name).toBe('Cœur');
    session.loadExample();
    expect(session.network.devices.length).toBeGreaterThan(5);
    session.newProject();
    expect(session.network.devices).toHaveLength(0);
    session.dismissNotice();
    expect(session.notice).toBeNull();
  });

  test('prévient les abonnés à chaque changement', () => {
    const session = new Session();
    const listener = vi.fn();
    const off = session.subscribe(listener);
    const before = session.getVersion();
    session.addDevice('switch');
    expect(listener).toHaveBeenCalled();
    expect(session.getVersion()).toBeGreaterThan(before);
    off();
  });
});

describe('Session : saisie, reprise et nom du projet', () => {
  test('un champ en cours de saisie est appliqué avant de changer de sélection', () => {
    const session = new Session();
    const id = session.addDevice('computer');
    let accepted = true;
    const commit = vi.fn(() => accepted);
    session.setPendingEdit(commit);
    session.select(null);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(session.selection).toBeNull();

    // Valeur refusée : la sélection ne change pas, le champ reste à l'écran.
    session.select({ kind: 'device', id });
    accepted = false;
    session.select(null);
    expect(session.selection).toEqual({ kind: 'device', id });

    // Le champ qui a perdu le focus ne compte plus ; un autre ne le désinscrit pas.
    session.clearPendingEdit(() => true);
    expect(session.commitEdit()).toBe(false);
    session.clearPendingEdit(commit);
    expect(session.commitEdit()).toBe(true);
    session.select(null);
    expect(session.selection).toBeNull();
  });

  test('le champ en cours est appliqué avant un ajout et un changement de mode, oublié au remplacement', () => {
    const session = new Session(null, new ManualFrames());
    const commit = vi.fn(() => true);
    session.setPendingEdit(commit);
    session.addDevice('computer');
    session.addNote('text');
    session.setMode('simulation');
    expect(commit).toHaveBeenCalledTimes(3);
    session.newProject();
    expect(session.commitEdit()).toBe(true);
    expect(commit).toHaveBeenCalledTimes(3);
  });

  test('en simulation, seul un équipement reste sélectionné', () => {
    const session = new Session(null, new ManualFrames());
    const { a } = lan(session);
    expect(session.selection?.kind).toBe('cable');
    session.setMode('simulation');
    expect(session.selection).toBeNull();
    session.setMode('design');
    session.select({ kind: 'device', id: a });
    session.setMode('simulation');
    expect(session.selection).toEqual({ kind: 'device', id: a });
  });

  test('signale le travail retrouvé au démarrage, avec sa date quand elle est connue', () => {
    const storage = new MemoryStorage();
    const session = new Session(storage, undefined, () => 1_700_000_000_000);
    expect(session.resumed).toBeNull();
    session.addNote('text');
    session.saveNow();
    expect(storage.getItem(AUTOSAVE_DATE_KEY)).toBe('1700000000000');

    const second = new Session(storage);
    expect(second.resumed).toEqual({ savedAt: 1_700_000_000_000 });
    second.keepResumedWork();
    expect(second.resumed).toBeNull();
    expect(second.network.notes).toHaveLength(1);

    // Sauvegarde d'une ancienne version : pas de date.
    storage.data.delete(AUTOSAVE_DATE_KEY);
    const third = new Session(storage);
    expect(third.resumed).toEqual({ savedAt: null });
    third.loadExample();
    expect(third.resumed).toBeNull();
  });

  test('un plan vide retrouvé au démarrage n’est pas signalé', () => {
    const storage = new MemoryStorage();
    new Session(storage).saveNow();
    expect(new Session(storage).resumed).toBeNull();
  });

  test('nettoie le nom du fichier de projet', () => {
    expect(projectBaseName('cours.reseaulab.json')).toBe('cours');
    expect(projectBaseName('Salle 101.FLS')).toBe('Salle 101');
    expect(projectBaseName('  a/b\\c:d*e?f"g<h>i|j  ')).toBe('a b c d e f g h i j');
    expect(projectBaseName('..caché')).toBe('caché');
    expect(projectBaseName('   ')).toBe('reseau');
    expect(projectBaseName('x'.repeat(200))).toHaveLength(80);
    const session = new Session();
    session.setProjectName('Dupont – activité 1');
    expect(session.fileName).toBe('Dupont – activité 1.reseaulab.json');
    session.setProjectName('');
    expect(session.fileName).toBe('reseau.reseaulab.json');
  });
});

describe('Session : annuler et rétablir', () => {
  test('annule et rétablit les modifications du plan, y compris un remplacement du réseau', () => {
    const session = new Session();
    expect(session.canUndo).toBe(false);
    const a = session.addDevice('computer');
    expect(session.canUndo).toBe(true); // modification en attente d'enregistrement
    session.commitHistory();
    session.network.host(a).updateConfig({ ip: ip('10.0.0.1'), mask: MASK_24 });
    session.commitHistory();
    session.loadExample();
    expect(session.network.devices.length).toBeGreaterThan(5);

    session.undo();
    expect(session.network.devices.map((d) => d.name)).toEqual(['Ordinateur 1']);
    expect(session.network.host(a).config.ip).toBe(ip('10.0.0.1'));
    session.undo();
    expect(session.network.host(a).config.ip).toBe(IP_ANY);
    expect(session.canRedo).toBe(true);
    session.undo();
    expect(session.network.devices).toHaveLength(0);
    expect(session.canUndo).toBe(false);
    session.undo(); // plus rien à annuler
    expect(session.network.devices).toHaveLength(0);

    session.redo();
    session.redo();
    expect(session.network.host(a).config.ip).toBe(ip('10.0.0.1'));
    // Une nouvelle modification efface ce qui pouvait être rétabli.
    session.addDevice('switch');
    session.commitHistory();
    expect(session.canRedo).toBe(false);
    session.redo();
    expect(session.network.devices).toHaveLength(2);
  });

  test('regroupe une rafale de modifications et garde la sélection quand elle existe encore', () => {
    vi.useFakeTimers();
    try {
      const session = new Session();
      const a = session.addDevice('computer');
      vi.advanceTimersByTime(HISTORY_DELAY_MS);
      // Glisser un équipement : beaucoup de petits déplacements, une seule annulation.
      for (let x = 200; x <= 400; x += 20) {
        session.network.move(a, { x, y: 300 });
        vi.advanceTimersByTime(16);
      }
      const b = session.addDevice('computer');
      expect(session.selection).toEqual({ kind: 'device', id: b });
      session.undo(); // enregistre d'abord la rafale en cours
      expect(session.network.devices).toHaveLength(1);
      expect(session.network.device(a)?.position).toEqual({ x: 400, y: 300 });
      expect(session.selection).toBeNull();
      session.select({ kind: 'device', id: a });
      session.undo();
      expect(session.network.device(a)?.position.x).not.toBe(400);
      expect(session.selection).toEqual({ kind: 'device', id: a });
    } finally {
      vi.useRealTimers();
    }
  });

  test('ne fait rien en simulation ; ce que la simulation a changé forme une étape', () => {
    const session = new Session(null, new ManualFrames());
    const { a } = lan(session);
    session.commitHistory();
    session.setMode('simulation');
    expect(session.canUndo).toBe(false);
    session.undo();
    expect(session.network.cables).toHaveLength(2);
    session.network.host(a).install('webserver');
    session.setMode('design');
    expect(session.network.host(a).isInstalled('webserver')).toBe(true);
    session.undo();
    expect(session.network.host(a).isInstalled('webserver')).toBe(false);
    expect(session.network.cables).toHaveLength(2);
  });

  test('garde au plus HISTORY_LIMIT étapes', () => {
    const session = new Session();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      session.addNote('text');
      session.commitHistory();
    }
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) session.undo();
    expect(session.network.notes).toHaveLength(5);
  });
});

describe('Session : zoom du plan et fenêtres', () => {
  test('ajuste le plan à la zone visible tant que l’élève n’a pas choisi de zoom', () => {
    const session = new Session();
    expect(session.planSize).toEqual({ width: 1400, height: 900 });
    session.loadExample();
    expect(session.fitZoom()).toBe(1); // taille de la zone inconnue
    const content = contentSize(session.network);
    session.setViewport(Math.round(content.width / 2), 2000);
    expect(session.zoom).toBe(0.5);
    // Le plan remplit au moins la zone visible.
    expect(session.planSize.height).toBe(4000);
    session.setViewport(4000, 2000);
    expect(session.zoom).toBe(1); // jamais agrandi au-delà de la taille réelle

    session.setZoom(1.5);
    expect(session.autoFit).toBe(false);
    session.setViewport(400, 300);
    expect(session.zoom).toBe(1.5);
    session.fitPlan();
    expect(session.zoom).toBeLessThan(0.5);
    expect(session.zoom).toBeGreaterThanOrEqual(ZOOM_STEPS[0]);
    session.setViewport(10, 10);
    expect(session.zoom).toBe(ZOOM_STEPS[0]);
  });

  test('les textes du plan restent lisibles quand le plan est réduit', () => {
    // À 100 % et au-delà, rien ne change.
    expect(labelScale(1)).toBe(1);
    expect(labelScale(1.5)).toBe(1);
    expect(labelScale(0.85)).toBe(1);
    // « Du collège au musée » sur un écran de 1366 px s'ajuste à 58 % : un nom
    // écrit en 13 px y ferait 7,5 px ; il en garde 11.
    expect(13 * 0.58).toBeLessThan(8);
    expect(13 * 0.58 * labelScale(0.58)).toBeCloseTo(11, 0);
    // Plan très réduit : l'agrandissement est borné, les noms ne se recouvrent pas tous.
    expect(labelScale(0.3)).toBe(2);
  });

  test('change de zoom par paliers, dans les limites', () => {
    const session = new Session();
    session.zoomStep(1);
    expect(session.zoom).toBe(1.25);
    session.setZoom(0.85);
    session.zoomStep(-1);
    expect(session.zoom).toBe(0.8);
    session.setZoom(0.01);
    expect(session.zoom).toBe(ZOOM_STEPS[0]);
    session.zoomStep(-1);
    expect(session.zoom).toBe(ZOOM_STEPS[0]);
    session.setZoom(9);
    expect(session.zoom).toBe(2);
    session.zoomStep(1);
    expect(session.zoom).toBe(2);
  });

  test('ajuste de nouveau le plan quand on ajoute un équipement ou qu’on annule', () => {
    const session = new Session();
    session.setViewport(800, 600);
    expect(session.zoom).toBe(1);
    session.addDevice('computer', { x: 1500, y: 100 });
    expect(session.zoom).toBe(0.5);
    session.commitHistory();
    session.undo();
    expect(session.zoom).toBe(1);
  });

  test('ouvre une fenêtre du côté opposé à son équipement, sans sortir de la zone', () => {
    const session = new Session(null, new ManualFrames());
    session.setViewport(1200, 600);
    const left = session.addDevice('computer', { x: 100, y: 100 });
    const right = session.addDevice('computer', { x: 1000, y: 100 });
    session.setMode('simulation');
    session.openWindow({ type: 'desktop', deviceId: left });
    session.openWindow({ type: 'capture', deviceId: right });
    const [first, second] = session.windows;
    // Bureau : 560 × 360, calé à droite, sous l'autre ordinateur qu'il aurait caché en haut.
    expect(first).toMatchObject({ x: 1200 - 560 - 8, y: 8 + 7 * 26, width: 560, height: 360 });
    // Capture : limitée à 55 % de la largeur, à gauche ; elle s'ouvre sous le premier
    // ordinateur, moins haute que ses 520 px, plutôt que de le recouvrir.
    expect(second).toMatchObject({ x: 8, y: 8 + 7 * 26, width: 660, height: 600 - 8 - 190 });
    expect(session.topWindow?.id).toBe(`capture:${right}`);

    session.moveWindow(`desktop:${left}`, 5000, -40);
    expect(session.windows[0]).toMatchObject({ x: 1200 - 120, y: 0 });
    // La zone rétrécit : les fenêtres restent attrapables.
    session.setViewport(600, 300);
    expect(session.windows[0]).toMatchObject({ x: 600 - 120 });

    session.arrangeWindows();
    expect(session.windows.every((w) => w.x + w.width <= 600 - 8 && w.x >= 8)).toBe(true);
    session.closeAllWindows();
    expect(session.windows).toHaveLength(0);
    expect(session.topWindow).toBeNull();
  });

  test('« Du collège au musée » sur un écran de classe : le terminal laisse voir le chemin du paquet', () => {
    const session = new Session(null, new ManualFrames());
    const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === 'college-musee');
    if (!builtin) throw new Error('activité introuvable');
    session.startActivity(builtin);
    session.setMode('simulation');
    // Zone du plan en simulation sur un écran de 1366 × 768, activité ouverte.
    session.setViewport(1046, 667);
    expect(session.zoom).toBe(0.68);
    const device = (name: string) => {
      const found = session.network.devices.find((d) => d.name === name);
      if (!found) throw new Error(name);
      return found;
    };
    const hidden = () =>
      session.network.devices
        .filter((d) => {
          const x = d.position.x * session.zoom - session.planScroll.x;
          const y = d.position.y * session.zoom - session.planScroll.y;
          return session.windows.some((w) => x > w.x && x < w.x + w.width && y > w.y && y < w.y + w.height);
        })
        .map((d) => d.name);
    const poste = device('Poste 1').id;
    session.openWindow({ type: 'desktop', deviceId: poste });
    session.openWindow({ type: 'app', deviceId: poste, app: 'terminal' });
    const [desktop, terminal] = session.windows;
    if (!desktop || !terminal) throw new Error('fenêtres');
    // Tout le chemin vers le musée reste visible ; seule la médiathèque, hors du chemin, est cachée.
    expect(hidden().sort()).toEqual([
      'Portable médiathèque',
      'Routeur de la médiathèque',
      'Switch médiathèque',
    ]);
    // Les deux fenêtres tiennent dans la zone, la barre de titre du bureau dépasse au-dessus du terminal.
    for (const w of session.windows) expect(w.y + w.height).toBeLessThanOrEqual(667 - 8);
    expect(terminal.y).toBe(desktop.y + 26);
    // Le terminal a cédé un peu de sa hauteur (400 px) plutôt que de recouvrir les routeurs.
    expect(terminal.height).toBeLessThan(400);
    expect(terminal.height).toBeGreaterThanOrEqual(300);

    // Plan agrandi et descendu de 250 px : la fenêtre se place d'après ce qui est
    // réellement à l'écran. Sous la médiathèque, il reste de quoi l'ouvrir sans rien cacher.
    session.closeAllWindows();
    session.setZoom(1);
    session.setPlanScroll(0, 250);
    session.openWindow({ type: 'desktop', deviceId: poste });
    expect(session.windows[0]).toMatchObject({ x: 478, y: 372, height: 287 });
    expect(hidden()).toEqual([]);

    // « Ranger » remet chaque fenêtre là où elle s'ouvrirait.
    session.closeAllWindows();
    session.fitPlan();
    session.setPlanScroll(0, 0);
    session.openWindow({ type: 'desktop', deviceId: poste });
    session.openWindow({ type: 'app', deviceId: poste, app: 'terminal' });
    const before = session.windows.map(({ x, y, width, height }) => ({ x, y, width, height }));
    session.moveWindow(`desktop:${poste}`, 20, 20);
    session.arrangeWindows();
    expect(session.windows.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual(before);
  });

  test('une fiche demandée s’ouvre seule, à toute sa hauteur ; la liste élargit la fenêtre', () => {
    const session = new Session(null, new ManualFrames());
    const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === 'college-musee');
    if (!builtin) throw new Error('activité introuvable');
    session.startActivity(builtin);
    // Zone du plan en conception sur un écran de 1366 × 768, activité ouverte.
    session.setViewport(900, 678);
    const help = () => session.windows.find((w) => w.id === 'help');
    // Une fiche se lit pour elle-même : en haut du bord droit, quels que soient les équipements dessous.
    session.openKnowledge('routeur');
    expect(help()).toMatchObject({
      spec: { type: 'help', notion: 'routeur', alone: true },
      x: 332,
      y: 8,
      width: 560,
      height: 662,
    });
    // La liste revient : la fenêtre s'élargit vers la gauche, sans changer de hauteur ni de fiche.
    session.setHelpList(true);
    expect(help()).toMatchObject({
      spec: { notion: 'routeur', alone: false },
      x: 127,
      y: 8,
      width: 765,
      height: 662,
    });
    // Une autre fiche demandée : la fenêtre ouverte garde l'allure que l'élève lui a donnée.
    session.openKnowledge('passerelle');
    expect(help()).toMatchObject({ spec: { notion: 'passerelle', alone: false }, width: 765 });
    session.setHelpList(false);
    expect(help()).toMatchObject({ spec: { notion: 'passerelle', alone: true }, x: 332, width: 560 });
    // Le bouton Aide ramène la liste, sur la fiche en cours.
    session.openKnowledge();
    expect(help()).toMatchObject({ spec: { alone: false }, x: 127, width: 765 });
    // Fermée puis redemandée : de nouveau seule.
    session.closeWindow('help');
    session.openKnowledge('passerelle');
    expect(help()).toMatchObject({ spec: { alone: true }, width: 560 });
    // Sans fenêtre d'aide, rien à replier.
    session.closeWindow('help');
    session.setHelpList(true);
    expect(session.windows).toEqual([]);
  });

  test('renumérote l’empilement des fenêtres plutôt que de le laisser croître', () => {
    const session = new Session(null, new ManualFrames());
    const { a, b } = lan(session);
    session.setMode('simulation');
    session.openWindow({ type: 'desktop', deviceId: a });
    session.openWindow({ type: 'desktop', deviceId: b });
    for (let i = 0; i < 600; i++) session.focusWindow(i % 2 === 0 ? `desktop:${a}` : `desktop:${b}`);
    expect(Math.max(...session.windows.map((w) => w.z))).toBeLessThanOrEqual(500);
    expect(session.topWindow?.id).toBe(`desktop:${b}`);
  });
});

describe('Session : lecture de la simulation', () => {
  test('l’animation a son propre signal : l’interface n’est pas redessinée à chaque image au repos', () => {
    const frames = new ManualFrames();
    const session = new Session(null, frames);
    lan(session);
    session.setMode('simulation');
    const ticks = vi.fn();
    const off = session.subscribeFrame(ticks);
    const before = session.getVersion();
    const frame = session.getFrame();
    for (let i = 0; i < 10; i++) frames.step(16);
    expect(ticks).toHaveBeenCalledTimes(10);
    expect(session.getFrame()).toBe(frame + 10);
    // Rien ne circule : aucun changement à afficher.
    expect(session.getVersion()).toBe(before);
    off();
    frames.step(16);
    expect(ticks).toHaveBeenCalledTimes(10);
  });

  test('les trames portent le nom de leur protocole', () => {
    const frames = new ManualFrames();
    const session = new Session(null, frames);
    const { a } = lan(session);
    session.setMode('simulation');
    frames.step(0);
    const labels = new Set<string>();
    session.network.host(a).stack.icmp.ping(ip('10.0.0.2'), {}, () => undefined);
    for (let i = 0; i < 60; i++) {
      for (const f of session.inFlight) labels.add(`${f.protocol}:${f.label}`);
      frames.step(100);
    }
    expect(labels).toEqual(new Set(['arp:ARP', 'icmp:ICMP']));
  });

  test('marque un moment l’équipement qui abandonne un paquet', () => {
    const frames = new ManualFrames();
    let clock = 1000;
    const session = new Session(null, frames, () => clock);
    const { a } = lan(session);
    // En conception, rien n'est marqué (rien ne circule).
    session.network.host(a).stack.icmp.ping(ip('172.16.0.1'), {}, () => undefined);
    expect(session.dropMarks).toEqual([]);

    session.setMode('simulation');
    frames.step(0);
    session.network.host(a).stack.icmp.ping(ip('172.16.0.1'), {}, () => undefined);
    expect(session.dropMarks).toEqual([{ deviceId: a, reason: 'no-route', until: 1000 + DROP_MARK_MS }]);
    // Un seul repère par équipement : le dernier abandon remplace le précédent.
    clock += 500;
    session.network.host(a).updateConfig({ ip: IP_ANY });
    session.network.host(a).stack.icmp.ping(ip('172.16.0.1'), {}, () => undefined);
    expect(session.dropMarks).toEqual([{ deviceId: a, reason: 'no-address', until: 1500 + DROP_MARK_MS }]);
    clock += DROP_MARK_MS - 1;
    frames.step(16);
    expect(session.dropMarks).toHaveLength(1);
    clock += 1;
    frames.step(16);
    expect(session.dropMarks).toEqual([]);

    session.network.host(a).stack.icmp.ping(ip('172.16.0.1'), {}, () => undefined);
    session.setMode('design');
    expect(session.dropMarks).toEqual([]);
  });

  test('l’abandon d’un trafic automatique masqué n’est pas marqué', () => {
    const frames = new ManualFrames();
    const session = new Session(null, frames);
    const { a } = lan(session);
    session.setHideAutomatic(true);
    session.setMode('simulation');
    frames.step(0);
    // Un datagramme RIP sans route : trafic automatique.
    const rip = { kind: 'rip', msg: { command: 'request', routes: [] } } as const;
    session.network.host(a).udp.send(520, ip('172.16.0.1'), 520, rip);
    expect(session.dropMarks).toEqual([]);
    session.setHideAutomatic(false);
    session.network.host(a).udp.send(520, ip('172.16.0.1'), 520, rip);
    expect(session.dropMarks).toHaveLength(1);
  });

  test('pas à pas : un clic fait traverser un câble aux trames, puis la simulation se remet en pause', () => {
    const frames = new ManualFrames();
    const session = new Session(null, frames);
    const { a } = lan(session);
    session.setMode('simulation');
    frames.step(0);
    session.togglePause();
    const results: string[] = [];
    session.network.host(a).stack.icmp.ping(ip('10.0.0.2'), {}, (r) => results.push(r.kind));
    const run = () => {
      session.stepFrame();
      expect(session.stepping).toBe(true);
      expect(session.paused).toBe(false);
      for (let i = 0; i < 200 && frames.active; i++) frames.step(50);
      expect(frames.active).toBe(false);
      expect(session.paused).toBe(true);
      expect(session.stepping).toBe(false);
    };
    // Demande ARP : A → switch.
    run();
    const first = session.network.scheduler.now;
    expect(first).toBeGreaterThanOrEqual(LINK_DELAY);
    expect(first).toBeLessThan(2 * LINK_DELAY);
    expect(results).toEqual([]);
    // switch → B, B → switch, switch → A (ARP) ; puis l'écho en quatre câbles.
    for (let i = 0; i < 7; i++) run();
    expect(results).toEqual(['reply']);
    expect(session.network.scheduler.now).toBeLessThan(9 * LINK_DELAY);

    // Sans trame en route, le pas à pas attend la prochaine ; Pause l'interrompt.
    session.stepFrame();
    frames.step(50);
    expect(session.stepping).toBe(true);
    session.togglePause();
    expect(session.stepping).toBe(false);
    expect(session.paused).toBe(true);
    session.setMode('design');
    session.stepFrame();
    expect(session.stepping).toBe(false);
  });
});

describe('Session : activités', () => {
  const builtin = (id: string) => {
    const found = BUILTIN_ACTIVITIES.find((a) => a.id === id);
    if (!found) throw new Error(id);
    return found;
  };
  const statusOf = (session: Session, id: string) => session.activityOutcomes().get(id)?.status;

  test('commence une activité : réseau de départ, profil, progression', () => {
    const session = new Session(null, new ManualFrames());
    session.addDevice('router');
    session.startActivity(builtin('premier-reseau'));
    expect(session.activity?.title).toBe('Mon premier réseau');
    expect(session.network.devices).toHaveLength(0);
    expect(session.fileName).toBe('premier-reseau.reseaulab.json');
    // L'activité vient avec son niveau : pas de routeur en 4e.
    expect(session.profile.base).toBe('4e');
    expect(session.can('device:router')).toBe(false);
    expect(session.activityStep).toBe(0);
    expect(session.objectivesDone().size).toBe(0);

    session.addDevice('computer');
    session.addDevice('computer');
    expect(statusOf(session, 'deux-ordinateurs')).toBe('done');
    expect(statusOf(session, 'cable-1')).toBe('locked');
    session.addDevice('switch');
    expect(session.activityStep).toBe(1);
    expect(statusOf(session, 'cable-1')).toBe('todo');
    // Ouvrir un autre réseau quitte l'activité et rend le niveau du poste.
    session.newProject();
    expect(session.activity).toBeNull();
    expect(session.profile.base).toBe('complet');
    expect(session.activityOutcomes().size).toBe(0);
  });

  test('« Vérifier mon travail » teste les communications ; un changement du réseau périme le résultat', () => {
    const session = new Session(null, new ManualFrames());
    session.startActivity(builtin('deux-reseaux'));
    const net = session.network;
    const id = (name: string) => net.devices.find((d) => d.name === name)?.id ?? '';
    net.connect(id('Routeur'), id('Switch salle A'));
    net.connect(id('Routeur'), id('Switch salle B'));
    net.router(id('Routeur')).setInterface(0, { ip: ip('192.168.1.1'), mask: MASK_24 });
    net.router(id('Routeur')).setInterface(1, { ip: ip('192.168.2.1'), mask: MASK_24 });
    for (const [name, gateway] of [
      ['Poste A1', '192.168.1.1'],
      ['Poste A2', '192.168.1.1'],
      ['Poste B1', '192.168.2.1'],
    ] as const) {
      net.host(id(name)).updateConfig({ gateway: ip(gateway) });
    }
    expect(session.activityStep).toBe(3);
    expect(session.activityOutcomes().get('a-vers-b')).toEqual({
      status: 'todo',
      detail: 'Se vérifie avec le bouton « Vérifier mon travail ».',
    });
    expect(session.checkReport).toBeNull();
    session.checkWork();
    expect(statusOf(session, 'a-vers-b')).toBe('done');
    expect(session.mode).toBe('design');
    // Le bouton répond : un objectif validé, plus rien à tester à cette étape.
    expect(session.checkReport).toMatchObject({ validated: 1, pending: [] });
    // Un second clic ne valide rien de plus, et le dit : c'est une autre réponse.
    const first = session.checkReport?.id;
    session.checkWork();
    expect(session.checkReport).toMatchObject({ validated: 0, pending: [] });
    expect(session.checkReport?.id).not.toBe(first);

    // L'élève casse ensuite son réseau : le test est à refaire, la réponse ne vaut plus.
    net.host(id('Poste B1')).updateConfig({ gateway: IP_ANY });
    expect(session.checkReport).toBeNull();
    expect(session.activityOutcomes().get('a-vers-b')).toEqual({ status: 'locked' });
    net.host(id('Poste B1')).updateConfig({ gateway: ip('192.168.2.1') });
    expect(session.activityOutcomes().get('a-vers-b')).toEqual({
      status: 'todo',
      detail: 'Le réseau a changé : cliquez de nouveau sur « Vérifier mon travail ».',
    });
    session.checkWork();
    expect(statusOf(session, 'a-vers-b')).toBe('done');
  });

  test('« Vérifier mon travail » dit ce qui n’est pas encore atteint, parmi ce qu’il teste à l’étape en cours', () => {
    const session = new Session(null, new ManualFrames());
    session.startActivity(builtin('depannage'));
    const poste = session.network.devices.find((d) => d.name === 'Poste 1')?.id ?? '';
    // Première étape : rien ne se teste encore, les communications sont pour les étapes suivantes.
    session.checkWork();
    expect(session.checkReport).toMatchObject({ validated: 0, pending: [] });
    session.setMode('simulation');
    session.recordCommand(poste, 'ping');
    expect(session.activityStep).toBe(1);
    // Étape « réparer » : la panne est toujours là. Le site, à l'étape d'après, n'est pas encore cité.
    session.checkWork();
    expect(session.checkReport).toMatchObject({
      validated: 0,
      pending: ['Poste 1 communique avec le serveur web'],
    });
    // Sans activité, pas de réponse.
    session.quitActivity();
    expect(session.checkReport).toBeNull();
  });

  test('un objectif validé en simulation le reste au retour en conception, sauf si le réseau a changé', () => {
    const session = new Session(null, new ManualFrames());
    session.startActivity(builtin('premier-reseau'));
    const a = session.addDevice('computer');
    const b = session.addDevice('computer');
    const sw = session.addDevice('switch');
    session.network.host(a).updateConfig({ ip: ip('192.168.1.1'), mask: MASK_24 });
    session.network.host(b).updateConfig({ ip: ip('192.168.1.2'), mask: MASK_24 });
    session.network.connect(a, sw);
    session.network.connect(b, sw);
    session.setMode('simulation');
    session.recordCommand(a, 'ping');
    expect(session.objectivesDone().size).toBe(8);
    session.checkWork();
    expect(session.objectivesDone().size).toBe(9);

    // Arrêter la simulation n'est pas modifier le réseau : rien à vérifier de nouveau.
    session.setMode('design');
    expect(session.objectivesDone().size).toBe(9);
    expect(session.checkReport).toMatchObject({ validated: 1, pending: [] });

    // Ce que la simulation a changé pour de bon (ici un fichier écrit sur un poste)
    // est une modification : le test est à refaire.
    session.setMode('simulation');
    session.network.host(b).fs.writeFile('/note.txt', 'essai');
    session.setMode('design');
    expect(session.objectivesDone().size).toBe(8);
    expect(session.checkReport).toBeNull();
  });

  test('note la simulation et les commandes tapées ; donne les indices un par un', () => {
    const session = new Session(null, new ManualFrames());
    session.recordCommand('n1', 'ping');
    session.revealHint('constater');
    expect(session.work).toEqual(EMPTY_WORK);

    session.startActivity(builtin('depannage'));
    const poste = session.network.devices.find((d) => d.name === 'Poste 1')?.id ?? '';
    expect(statusOf(session, 'simulation')).toBe('todo');
    session.setMode('simulation');
    expect(statusOf(session, 'simulation')).toBe('done');
    session.recordCommand(poste, 'ping');
    session.recordCommand(poste, 'ping');
    expect(session.work.commands).toEqual([`${poste}:ping`]);
    expect(statusOf(session, 'ping-essaye')).toBe('done');
    expect(session.activityStep).toBe(1);
    session.revealHint('reparer');
    session.revealHint('reparer');
    expect(session.work.hints).toEqual({ reparer: 2 });
  });

  const objectiveQuestion = (session: Session, id: string) => {
    const objective = session.activity?.steps.flatMap((step) => step.objectives).find((o) => o.id === id);
    if (objective?.check.type !== 'question') throw new Error(id);
    return objective.check.question;
  };

  test('questions : une réponse par question, corrigée ; pas avant que l’étape soit ouverte', () => {
    const session = new Session(null, new ManualFrames(), () => 42_000);
    session.startActivity(QUESTIONS_BUILTIN);
    const check = (id: string) => {
      const objective = session.activity?.steps.flatMap((s) => s.objectives).find((o) => o.id === id);
      if (objective?.check.type !== 'question') throw new Error(id);
      return askQuestion(id, objective.check.question, drawSalt(session.work));
    };
    // L'étape 2 n'est pas encore ouverte : la réponse est refusée.
    session.answerQuestion('q-reseau', '192.168.10');
    expect(session.work.answers['q-reseau']).toBeUndefined();

    const item = check('q-switch');
    if (item?.kind !== 'choice') throw new Error('choix attendu');
    const wrong = item.correct.includes(0) ? 1 : 0;
    session.answerQuestion('q-switch', [wrong]);
    expect(session.work.answers['q-switch']).toMatchObject({ right: false, given: [wrong], at: 42_000 });
    expect(session.work.reachedAt['q-switch']).toBe(42_000);
    // Un seul essai : une seconde réponse ne remplace pas la première.
    session.answerQuestion('q-switch', item.correct);
    expect(session.work.answers['q-switch']?.right).toBe(false);
    // Un nouvel essai, lui, se tente : autre tirage, première réponse gardée telle quelle.
    const retry = askRetry('q-switch', objectiveQuestion(session, 'q-switch'), session.work);
    if (retry?.item.kind !== 'choice') throw new Error('nouvel essai attendu');
    session.retryQuestion('q-switch', 'pas la bonne forme');
    expect(session.work.answers['q-switch']?.retry).toBeUndefined();
    session.retryQuestion('q-switch', retry.item.correct);
    expect(session.work.answers['q-switch']).toMatchObject({
      right: false,
      given: [wrong],
      retry: { right: true, tries: 1, at: 42_000 },
    });
    expect(statusOf(session, 'q-switch')).toBe('done');
    // Corrigée : plus rien à réessayer.
    session.retryQuestion('q-switch', [0]);
    expect(session.work.answers['q-switch']?.retry?.tries).toBe(1);
    // Une réponse libre vide, ou d'un seul mot, ne compte pas.
    session.answerQuestion('q-pourquoi', '   ');
    session.answerQuestion('q-pourquoi', 'ok');
    expect(statusOf(session, 'q-pourquoi')).toBe('todo');
    // Pas de nouvel essai sans première réponse.
    session.retryQuestion('q-pourquoi', 'Une phrase assez longue.');
    expect(session.work.answers['q-pourquoi']).toBeUndefined();
    session.answerQuestion('q-pourquoi', 'Pour trouver le bon destinataire.');
    expect(statusOf(session, 'q-pourquoi')).toBe('done');
    expect(session.activityStep).toBe(1);
    session.answerQuestion('q-reseau', '192.168.10');
    expect(session.work.answers['q-reseau']?.right).toBe(true);
    // Un objectif qui n'est pas une question n'accepte pas de réponse.
    session.answerQuestion('inconnu', 'texte');
    expect(session.work.answers.inconnu).toBeUndefined();
  });

  test('passer une étape d’approfondissement : seulement celle en cours, et la suite s’ouvre', () => {
    const session = new Session(null, new ManualFrames(), () => 42_000);
    session.startActivity(OPTIONAL_BUILTIN);
    // Pas encore arrivé à l'étape : rien ne se passe. Une étape ordinaire ne se passe jamais.
    session.skipStep('plus');
    session.skipStep('base');
    expect(session.work.skipped).toEqual([]);
    const item = askQuestion('q-switch', objectiveQuestion(session, 'q-switch'), drawSalt(session.work));
    session.answerQuestion('q-switch', item === null ? '' : rightAnswer(item));
    expect(session.activityStep).toBe(1);
    expect(statusOf(session, 'q-roles')).toBe('locked');

    session.skipStep('plus');
    session.skipStep('plus');
    expect(session.work.skipped).toEqual(['plus']);
    expect(session.activityStep).toBe(2);
    expect(statusOf(session, 'q-roles')).toBe('todo');
    // L'étape passée reste ouverte : l'élève peut y revenir et y répondre.
    expect(statusOf(session, 'q-combien')).toBe('todo');
    session.answerQuestion('q-combien', '4 routeurs');
    expect(statusOf(session, 'q-combien')).toBe('done');

    // Rouvert, le fichier reprend après l'étape passée.
    const other = new Session(null, new ManualFrames());
    expect(other.openProject(session.serialize(), 'eleve.reseaulab.json')).toBe(true);
    expect(other.work.skipped).toEqual(['plus']);
    expect(other.activityStep).toBe(2);
  });

  test('le corrigé ne s’ouvre que pour le professeur (« ?prof » dans l’adresse)', () => {
    expect(isTeacherAddress('?prof')).toBe(true);
    expect(isTeacherAddress('?integre&prof=1')).toBe(true);
    expect(isTeacherAddress('')).toBe(false);
    expect(isTeacherAddress('?professeur')).toBe(false);

    const session = new Session(null, new ManualFrames());
    expect(session.teacher).toBe(false);
    session.openWindow({ type: 'answers', builtin: 'college-musee' });
    expect(session.windows).toEqual([]);
    session.setTeacher(true);
    session.openWindow({ type: 'answers', builtin: 'college-musee' });
    expect(session.windows.map((w) => w.spec)).toEqual([{ type: 'answers', builtin: 'college-musee' }]);
    // Une seule fenêtre de corrigé : demander celui d'une autre activité la remplace.
    session.openWindow({ type: 'answers', builtin: 'salle-techno' });
    expect(session.windows.map((w) => w.spec)).toEqual([{ type: 'answers', builtin: 'salle-techno' }]);
    session.setTeacher(false);
    expect(session.windows).toEqual([]);
  });

  test('les réponses voyagent dans le fichier rendu : rouvert, il reprend à la même étape', () => {
    const session = new Session(null, new ManualFrames(), () => 42_000);
    session.startActivity(QUESTIONS_BUILTIN);
    session.answerQuestion('q-pourquoi', 'Pour trouver le bon destinataire.');
    session.answerQuestion('q-switch', 'ignoré : ce n’est pas une question ouverte');
    expect(session.work.answers['q-switch']).toBeUndefined();
    const objective = session.activity?.steps[0]?.objectives[0];
    if (objective?.check.type !== 'question') throw new Error('question attendue');
    const item = askQuestion('q-switch', objective.check.question, drawSalt(session.work));
    session.answerQuestion('q-switch', item?.kind === 'choice' ? item.correct : []);
    expect(session.work.answers['q-switch']?.right).toBe(true);
    const text = session.serialize();

    const other = new Session(null, new ManualFrames());
    expect(other.openProject(text, 'eleve.reseaulab.json')).toBe(true);
    expect(other.work.answers).toEqual(session.work.answers);
    expect(other.activityStep).toBe(1);
    expect(statusOf(other, 'q-switch')).toBe('done');
  });

  test('un équipement cité par l’activité ne peut pas être supprimé', () => {
    const session = new Session(null, new ManualFrames());
    session.startActivity(builtin('objet-connecte'));
    const first = session.network.devices.find((d) => d.name === 'Ordinateur 1')?.id ?? '';
    const second = session.network.devices.find((d) => d.name === 'Ordinateur 2')?.id ?? '';
    session.select({ kind: 'device', id: first });
    session.deleteSelection();
    expect(session.network.device(first)).toBeDefined();
    expect(session.notice).toMatchObject({ kind: 'error' });
    expect(session.notice?.text).toContain('fait partie de l’activité');
    // Les autres équipements restent libres.
    session.select({ kind: 'device', id: second });
    session.deleteSelection();
    expect(session.network.device(second)).toBeUndefined();
    session.quitActivity();
    session.select({ kind: 'device', id: first });
    session.deleteSelection();
    expect(session.network.device(first)).toBeUndefined();
  });

  test('le réseau de départ protégé : ni câble ni équipement supprimé, pas de bureau, mais on y ajoute', () => {
    const session = new Session(null, new ManualFrames());
    session.startActivity(builtin('college-musee'));
    const id = (name: string) => session.network.devices.find((d) => d.name === name)?.id ?? '';
    const fai = id('Routeur du FAI');
    const core = id('Routeur Internet');
    const link = session.network.cables.find((c) => [c.a, c.b].includes(fai) && [c.a, c.b].includes(core));
    if (!link) throw new Error('câble FAI — Internet');
    expect(session.guard.cable(link.id)).toBe(true);
    // Suppr sur le câble, puis sur un routeur que plus aucun objectif ne cite.
    session.select({ kind: 'cable', id: link.id });
    session.deleteSelection();
    expect(session.network.cable(link.id)).toBeDefined();
    expect(session.notice?.text).toContain('réseau de départ');
    session.select({ kind: 'device', id: core });
    session.deleteSelection();
    expect(session.network.device(core)).toBeDefined();
    // « Supprimer tous les câbles » ne retire que ceux de l'élève.
    expect(session.disconnect([link.id])).toBe(false);
    expect(session.network.cable(link.id)).toBeDefined();
    const added = session.network.connect(id('Poste 3'), id('Switch CDI'));
    expect(session.guard.cable(added.id)).toBe(false);
    expect(session.disconnect([added.id, link.id])).toBe(false);
    expect(session.network.cable(added.id)).toBeUndefined();
    expect(session.network.cable(link.id)).toBeDefined();
    session.undo();
    expect(session.network.cable(added.id)).toBeDefined();

    // En simulation, le bureau du serveur du musée ne s'ouvre pas ; celui de Poste 1, si.
    session.setMode('simulation');
    session.openWindow({ type: 'desktop', deviceId: id('Serveur du musée') });
    expect(session.windows).toHaveLength(0);
    expect(session.notice?.text).toContain('son bureau ne s’ouvre pas');
    session.openWindow({ type: 'capture', deviceId: id('Serveur du musée') });
    session.openWindow({ type: 'desktop', deviceId: id('Poste 1') });
    expect(session.windows.map((w) => w.spec.type)).toEqual(['capture', 'desktop']);
    session.setMode('design');

    // L'activité quittée, le réseau redevient libre.
    session.quitActivity();
    session.select({ kind: 'cable', id: link.id });
    session.deleteSelection();
    expect(session.network.cable(link.id)).toBeUndefined();
  });

  test('le fichier enregistré garde l’activité et le travail ; il se rouvre et se retrouve au démarrage', () => {
    const storage = new MemoryStorage();
    const session = new Session(storage, new ManualFrames());
    session.startActivity(builtin('premier-reseau'));
    session.addDevice('computer');
    session.addDevice('computer');
    session.addDevice('switch');
    session.revealHint('relier');
    const text = session.serialize();
    const file = JSON.parse(text) as { activity: { id: string }; work: { done: string[]; hints: unknown } };
    expect(file.activity.id).toBe('premier-reseau');
    expect(file.work.done).toEqual(['deux-ordinateurs', 'un-switch']);
    expect(file.work.hints).toEqual({ relier: 1 });

    const other = new Session(null, new ManualFrames());
    expect(other.openProject(text, 'dupont.reseaulab.json')).toBe(true);
    expect(other.notice?.text).toBe('Activité « Mon premier réseau » ouverte.');
    expect(other.activity?.id).toBe('premier-reseau');
    expect(other.work.hints).toEqual({ relier: 1 });
    expect(other.objectivesDone()).toEqual(new Set(['deux-ordinateurs', 'un-switch']));

    session.saveNow();
    const restored = new Session(storage, new ManualFrames());
    expect(restored.activity?.id).toBe('premier-reseau');
    expect(restored.resumed).not.toBeNull();
    expect(restored.activityStep).toBe(1);
  });

  test('note le nom de l’élève, sa conclusion et l’heure où chaque objectif est atteint', () => {
    let clock = 1_000_000;
    const session = new Session(null, new ManualFrames(), () => clock);
    // Sans activité, le nom accompagne quand même le réseau rendu.
    session.setStudent('Camille Dupont', '4e B');
    session.addDevice('computer');
    const plain = JSON.parse(session.serialize()) as { activity?: unknown; work?: { student: unknown } };
    expect(plain.activity).toBeUndefined();
    expect(plain.work?.student).toEqual({ name: 'Camille Dupont', className: '4e B' });

    session.startActivity(builtin('premier-reseau'));
    expect(session.work.startedAt).toBe(1_000_000);
    // Une nouvelle activité repart d'un travail vierge.
    expect(session.work.student.name).toBe('');
    session.setStudent('Camille Dupont', '4e B');
    session.setConclusion('Un switch relie les ordinateurs d’un même réseau.');
    clock += 60_000;
    session.addDevice('computer');
    session.addDevice('computer');
    clock += 30_000;
    session.addDevice('switch');
    expect(session.work.reachedAt).toEqual({ 'deux-ordinateurs': 1_060_000, 'un-switch': 1_090_000 });
    // Un objectif perdu puis retrouvé garde l'heure de sa première réussite.
    session.undo();
    clock += 10_000;
    session.redo();
    expect(session.work.reachedAt['un-switch']).toBe(1_090_000);

    const file = JSON.parse(session.serialize()) as { work: { conclusion: string; reachedAt: object } };
    expect(file.work.conclusion).toContain('Un switch relie');
    expect(Object.keys(file.work.reachedAt)).toHaveLength(2);
    // Quitter l'activité garde le nom, pas le reste.
    session.quitActivity();
    expect(session.work).toEqual({ ...EMPTY_WORK, student: { name: 'Camille Dupont', className: '4e B' } });
  });

  test('annuler ne touche ni à l’activité ni au travail déjà noté', () => {
    const session = new Session(null, new ManualFrames());
    session.startActivity(builtin('premier-reseau'));
    session.addDevice('computer');
    session.commitHistory();
    session.revealHint('poser');
    session.addDevice('computer');
    session.commitHistory();
    expect(statusOf(session, 'deux-ordinateurs')).toBe('done');
    session.undo();
    expect(session.network.devices).toHaveLength(1);
    expect(session.activity?.id).toBe('premier-reseau');
    expect(session.work.hints).toEqual({ poser: 1 });
    expect(statusOf(session, 'deux-ordinateurs')).toBe('todo');
    // Un indice demandé n'est pas une modification du plan : rien de plus à annuler.
    session.undo();
    expect(session.network.devices).toHaveLength(0);
  });
});

describe('Session : espace enseignant', () => {
  const custom = serializePack({
    notions: [
      {
        id: 'vlan',
        title: 'VLAN',
        aliases: [],
        level: '3e',
        category: 'materiel',
        short: 'Un réseau virtuel dans un switch.',
        body: '',
        remember: [],
        related: [],
      },
    ],
    hidden: ['box'],
    messages: { 'ip-missing': { title: '{device} : adresse à compléter' } },
  });

  test('installe un pack sur le poste, le résume, puis revient au contenu d’origine', () => {
    const storage = new MemoryStorage();
    const session = new Session(storage);
    expect(session.localPackSummary).toBeNull();
    expect(session.importPack('{"format":"autre"}')).toBe(false);
    expect(session.notice?.kind).toBe('error');
    expect(session.notion('box')).toBeDefined();

    expect(session.importPack(custom)).toBe(true);
    expect(session.localPackSummary).toEqual({ notions: 1, questions: 0, messages: 1, hidden: 1 });
    expect(session.notion('vlan')?.title).toBe('VLAN');
    expect(session.notion('box')).toBeUndefined();
    // Les questions de la fiche masquée partent avec elle.
    expect(session.pack.questions.some((q) => q.notion === 'box')).toBe(false);
    expect(new Session(storage).notion('vlan')).toBeDefined();

    session.resetPack();
    expect(session.localPackSummary).toBeNull();
    expect(session.notion('box')).toBeDefined();
    expect(new Session(storage).notion('vlan')).toBeUndefined();
  });

  test('écrit un fichier d’activité : réseau de départ, activité, pack joint ; rien de la solution', () => {
    const session = new Session(new MemoryStorage(), new ManualFrames());
    session.importPack(custom);
    const { a, b } = lan(session);
    const proposals = suggestObjectives(session.network);
    const draft: Draft = {
      ...emptyDraft(),
      title: 'Deux postes',
      steps: [
        { ...EMPTY_STEP, title: 'Adresser', objectives: proposals.filter((p) => p.check.type === 'config') },
      ],
    };
    expect(session.activityFile({ ...draft, title: '' }, true)).toEqual({
      error: 'Donnez un titre à l’activité.',
    });

    const file = session.activityFile(draft, true);
    if ('error' in file) throw new Error(file.error);
    expect(file.fileName).toBe('deux-postes.activite.reseaulab.json');
    const read = parseLearnFile(file.text);
    expect(read.activity?.title).toBe('Deux postes');
    expect(read.work).toBeNull();
    expect(read.pack?.notions?.[0]?.id).toBe('vlan');
    // Départ sans adresses : la solution de l'enseignant n'est pas dans le fichier.
    expect(read.network.host(a).config.ip).toBe(IP_ANY);
    expect(file.text).not.toContain('10.0.0.1');
    expect(session.network.host(a).config.ip).toBe(ip('10.0.0.1'));
    const without = session.activityFile(draft, false);
    expect('text' in without && parseLearnFile(without.text).pack).toBeNull();

    // Un élève qui ouvre ce fichier sur un autre poste reçoit le pack avec l'activité.
    const pupil = new Session(null, new ManualFrames());
    expect(pupil.openProject(file.text, file.fileName)).toBe(true);
    expect(pupil.notion('vlan')).toBeDefined();
    expect(pupil.objectivesDone().size).toBe(0);
    pupil.network.host(a).updateConfig({ ip: ip('10.0.0.1'), mask: MASK_24 });
    pupil.network.host(b).updateConfig({ ip: ip('10.0.0.2'), mask: MASK_24 });
    expect(pupil.objectivesDone().size).toBe(2);
    // Le pack reste dans le fichier que l'élève enregistre ; il part avec un autre projet.
    expect(parseLearnFile(pupil.serialize()).pack?.notions).toHaveLength(1);
    pupil.newProject();
    expect(pupil.notion('vlan')).toBeUndefined();
  });

  test('essayer l’activité l’ouvre comme pour un élève ; annuler ramène la solution', () => {
    const session = new Session(null, new ManualFrames());
    const { a } = lan(session);
    session.commitHistory();
    const [first] = suggestObjectives(session.network).filter((p) => p.check.type === 'config');
    const draft: Draft = {
      ...emptyDraft(),
      title: 'Essai',
      steps: [{ ...EMPTY_STEP, title: 'Adresser', objectives: first ? [first] : [] }],
    };
    session.setAuthorDraft(draft);
    expect(session.tryActivity({ ...draft, title: '' })).toBe('Donnez un titre à l’activité.');
    expect(session.tryActivity(draft)).toBeNull();
    expect(session.activity?.title).toBe('Essai');
    expect(session.network.host(a).config.ip).toBe(IP_ANY);
    // Le brouillon est gardé pendant l'essai.
    expect(session.authorDraft).toEqual(draft);
    session.quitActivity();
    session.undo();
    expect(session.network.host(a).config.ip).toBe(ip('10.0.0.1'));
  });
});

describe('Session : import Filius et annotations', () => {
  test('importe un fichier .fls et garde le rapport d’import', async () => {
    const session = new Session();
    const zip = await makeZip({ [FILIUS_CONFIG_ENTRY]: fixture });
    expect(await session.openFilius(zip, 'cours.fls')).toBe(true);
    expect(session.fileName).toBe('cours.reseaulab.json');
    expect(session.network.devices.length).toBe(6);
    expect(session.importReport?.warnings.length).toBeGreaterThan(0);
    session.dismissImportReport();
    expect(session.importReport).toBeNull();
    expect(await session.openFilius(new Uint8Array([1, 2, 3]), 'abime.fls')).toBe(false);
    expect(session.notice?.kind).toBe('error');
    expect(session.network.devices.length).toBe(6);
  });

  test('un fichier .fls sans avertissement affiche un simple message', async () => {
    const session = new Session();
    const xml = `<java><object class="java.util.LinkedList"><void method="add">
      <object class="filius.gui.netzwerksicht.GUIKnotenItem"><void property="knoten">
        <object class="filius.hardware.knoten.Switch"/></void></object></void></object></java>`;
    expect(await session.openFilius(await makeZip({ [FILIUS_CONFIG_ENTRY]: xml }), 'a.FLS')).toBe(true);
    expect(session.importReport).toBeNull();
    expect(session.notice?.text).toContain('importé');
  });

  test('ajoute, sélectionne et supprime des annotations', () => {
    const session = new Session();
    const text = session.addNote('text');
    const zone = session.addNote('zone');
    expect(session.network.note(text)?.text).toBe('Texte');
    expect(session.network.note(zone)?.kind).toBe('zone');
    expect(session.selection).toEqual({ kind: 'note', id: zone });
    session.deleteSelection();
    expect(session.network.notes.map((n) => n.id)).toEqual([text]);
  });
});
