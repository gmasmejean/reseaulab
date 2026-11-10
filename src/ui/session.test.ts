import { IP_ANY } from '../engine/core/ipv4';
import { LINK_DELAY, Network } from '../engine/network';
import { MASK_24, ip } from '../engine/testing';
import { serializeProject } from '../project/serialize';
import fixture from '../project/filius/fixtures/konfiguration.xml?raw';
import { FILIUS_CONFIG_ENTRY } from '../project/filius';
import { ManualFrames, MemoryStorage } from '../test/doubles';
import { makeZip } from '../test/zip';
import {
  AUTOMATIC_PROTOCOLS,
  AUTOSAVE_DATE_KEY,
  AUTOSAVE_KEY,
  HIDE_AUTOMATIC_KEY,
  Session,
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
