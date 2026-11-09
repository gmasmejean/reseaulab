import { LINK_DELAY, Network } from '../engine/network';
import { MASK_24, ip } from '../engine/testing';
import { serializeProject } from '../project/serialize';
import fixture from '../project/filius/fixtures/konfiguration.xml?raw';
import { FILIUS_CONFIG_ENTRY } from '../project/filius';
import { ManualFrames, MemoryStorage } from '../test/doubles';
import { makeZip } from '../test/zip';
import { AUTOSAVE_KEY, Session } from './session';

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
