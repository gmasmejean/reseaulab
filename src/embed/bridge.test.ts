import { ManualFrames, MemoryStorage } from '../test/doubles';
import { AUTOSAVE_KEY, Session } from '../ui/session';
import {
  READY_INTERVAL_MS,
  SEND_DELAY_MS,
  isEmbedded,
  parseInit,
  startEmbed,
  summarize,
  type EmbedHost,
  type EmbedMessage,
} from './bridge';
import { withoutAutosave } from './storage';

const ORIGIN = 'https://classe.example';

/** The page around RéseauLab: keeps what is sent, and plays the parent's messages. */
class FakeHost implements EmbedHost {
  readonly sent: { message: EmbedMessage; origin: string }[] = [];
  private listener: ((data: unknown, origin: string, fromParent: boolean) => void) | null = null;
  private leave: (() => void) | null = null;
  send(message: EmbedMessage, origin: string): void {
    this.sent.push({ message, origin });
  }
  onMessage(listener: (data: unknown, origin: string, fromParent: boolean) => void): void {
    this.listener = listener;
  }
  onLeave(listener: () => void): void {
    this.leave = listener;
  }
  post(data: unknown, { origin = ORIGIN, fromParent = true } = {}): void {
    this.listener?.(data, origin, fromParent);
  }
  init(fields: Record<string, unknown>, options?: { origin?: string; fromParent?: boolean }): void {
    this.post({ reseaulab: 1, type: 'init', ...fields }, options);
  }
  leavePage(): void {
    this.leave?.();
  }
  of(type: EmbedMessage['type']) {
    return this.sent.filter((s) => s.message.type === type);
  }
  /** The work sent last. */
  lastState(): Extract<EmbedMessage, { type: 'etat' }> {
    const states = this.of('etat');
    const last = states[states.length - 1]?.message;
    if (last?.type !== 'etat') throw new Error('Aucun état envoyé');
    return last;
  }
}

/** The project file sent, with the parts the tests look at. */
function file(projet: string) {
  return JSON.parse(projet) as { devices: unknown[]; work: { student: unknown; startedAt?: number } };
}

function setup() {
  const session = new Session(null, new ManualFrames());
  const host = new FakeHost();
  startEmbed(session, host);
  return { session, host };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('mode intégré', () => {
  test('reconnaît l’adresse du mode intégré', () => {
    expect(isEmbedded('?integre=1')).toBe(true);
    expect(isEmbedded('?integre')).toBe(true);
    expect(isEmbedded('')).toBe(false);
    expect(isEmbedded('?autre=1')).toBe(false);
  });

  test('se dit prêt jusqu’à l’init, et cache les commandes de fichier tout de suite', () => {
    const { session, host } = setup();
    expect(session.embed).toEqual({ consultation: false });
    expect(host.of('pret')).toHaveLength(1);
    vi.advanceTimersByTime(READY_INTERVAL_MS * 3);
    expect(host.of('pret')).toHaveLength(4);
    expect(host.sent.every((s) => s.origin === '*')).toBe(true);
    host.init({ activite: 'salle-techno' });
    vi.advanceTimersByTime(READY_INTERVAL_MS * 3);
    expect(host.of('pret')).toHaveLength(4);
  });

  test('ignore les messages qui ne viennent pas du parent, ou qui ne sont pas un init', () => {
    const { session, host } = setup();
    host.init({ activite: 'salle-techno' }, { fromParent: false });
    host.post({ type: 'init', activite: 'salle-techno' });
    host.post('init');
    host.post(null);
    expect(session.activity).toBeNull();
    host.init({ activite: 'salle-techno' });
    expect(session.activity?.id).toBe('salle-techno');
    // Only the first init counts.
    host.init({ activite: 'premier-reseau' });
    expect(session.activity?.id).toBe('salle-techno');
  });

  test('commence l’activité demandée et envoie aussitôt le travail, à l’origine du parent', () => {
    const { session, host } = setup();
    host.init({ activite: 'salle-techno', nom: 'Groupe 3' });
    expect(session.activity?.id).toBe('salle-techno');
    expect(session.fileName).toBe('Groupe 3.reseaulab.json');
    expect(host.of('etat')).toHaveLength(1);
    expect(host.of('etat')[0]?.origin).toBe(ORIGIN);
    const state = host.lastState();
    expect(JSON.parse(state.projet)).toMatchObject({ format: 'reseaulab', activity: { id: 'salle-techno' } });
    expect(state.progression).toBe(0);
    expect(state.resume).toMatch(/^Étape 1\/\d+ · 0\/\d+ objectifs$/);
  });

  test('le travail de « La salle de techno » tient largement dans un enregistrement', () => {
    const { host } = setup();
    host.init({ activite: 'salle-techno' });
    expect(new TextEncoder().encode(host.lastState().projet).length).toBeLessThan(300_000);
  });

  test('envoie le travail une fois, peu après une série de changements, et seulement s’il a changé', () => {
    const { session, host } = setup();
    host.init({ activite: 'salle-techno' });
    session.addDevice('computer');
    session.addDevice('computer');
    vi.advanceTimersByTime(SEND_DELAY_MS - 1);
    expect(host.of('etat')).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(host.of('etat')).toHaveLength(2);
    expect(file(host.lastState().projet).devices.length).toBeGreaterThan(0);
    session.select(null);
    vi.advanceTimersByTime(SEND_DELAY_MS * 2);
    expect(host.of('etat')).toHaveLength(2);
  });

  test('envoie le dernier changement en quittant la page', () => {
    const { session, host } = setup();
    host.init({ activite: 'salle-techno' });
    session.setStudent('Léa', '4A');
    host.leavePage();
    expect(host.of('etat')).toHaveLength(2);
    expect(file(host.lastState().projet).work.student).toEqual({ name: 'Léa', className: '4A' });
  });

  test('reprend le travail reçu, avec la date de début qui tire les questions', () => {
    const first = setup();
    first.host.init({ activite: 'salle-techno' });
    first.session.setStudent('Léa', '4A');
    first.host.leavePage();
    const projet = first.host.lastState().projet;

    const { session, host } = setup();
    host.init({ projet, eleve: { name: 'Autre', className: '4B' } });
    expect(session.activity?.id).toBe('salle-techno');
    expect(session.work.startedAt).toBe(first.session.work.startedAt);
    // The name already written is kept.
    expect(session.work.student).toEqual({ name: 'Léa', className: '4A' });
    expect(file(host.lastState().projet).work.startedAt).toBe(first.session.work.startedAt);
  });

  test('propose le nom des élèves quand le compte rendu n’est pas encore signé', () => {
    const { session, host } = setup();
    host.init({ activite: 'salle-techno', eleve: { name: 'Léa, Tom' } });
    expect(session.work.student).toEqual({ name: 'Léa, Tom', className: '' });
  });

  test('en consultation, n’envoie jamais rien', () => {
    const first = setup();
    first.host.init({ activite: 'salle-techno' });
    const projet = first.host.lastState().projet;

    const { session, host } = setup();
    host.init({ projet, consultation: true });
    expect(session.embed).toEqual({ consultation: true });
    session.addDevice('computer');
    vi.advanceTimersByTime(SEND_DELAY_MS * 3);
    host.leavePage();
    expect(host.of('etat')).toHaveLength(0);
  });

  test('signale un travail illisible et ne l’écrase pas', () => {
    const { session, host } = setup();
    host.init({ projet: '{"format":"autre"}' });
    expect(host.of('erreur')).toHaveLength(1);
    session.addDevice('computer');
    vi.advanceTimersByTime(SEND_DELAY_MS * 3);
    host.leavePage();
    expect(host.of('etat')).toHaveLength(0);
  });

  test('signale une activité inconnue', () => {
    const { host } = setup();
    host.init({ activite: 'nulle-part' });
    expect(host.of('erreur')[0]?.message).toMatchObject({ message: 'Activité inconnue : nulle-part' });
  });

  test('répond à toutes les origines quand la page parente est un fichier', () => {
    const { host } = setup();
    host.init({ activite: 'salle-techno' }, { origin: 'null' });
    expect(host.of('etat')[0]?.origin).toBe('*');
  });
});

describe('résumé pour le professeur', () => {
  test('sans activité : le nombre d’équipements', () => {
    const session = new Session(null, new ManualFrames());
    expect(summarize(session)).toEqual({ progression: 0, resume: 'Réseau libre : 0 équipement' });
    session.addDevice('computer');
    session.addDevice('switch');
    expect(summarize(session).resume).toBe('Réseau libre : 2 équipements');
  });

  test('compte les bonnes réponses données', () => {
    const { session, host } = setup();
    host.init({ activite: 'salle-techno' });
    session.work = {
      ...session.work,
      answers: {
        a: { given: [0], right: true, at: 1 },
        b: { given: [1], right: false, at: 2 },
        c: { given: 'texte libre', right: null, at: 3 },
      },
    };
    expect(summarize(session).resume).toMatch(/ · 1\/2 bonnes réponses$/);
  });
});

describe('message init', () => {
  test('ne garde que les champs attendus, du bon type', () => {
    expect(
      parseInit({
        reseaulab: 1,
        type: 'init',
        projet: 1,
        activite: 'salle-techno',
        consultation: 'oui',
        eleve: { name: 'Léa', className: 4 },
        autre: true,
      }),
    ).toEqual({ activite: 'salle-techno', eleve: { name: 'Léa' } });
    expect(parseInit({ reseaulab: 2, type: 'init' })).toBeNull();
  });
});

describe('stockage du navigateur en mode intégré', () => {
  test('garde les préférences mais jamais le travail', () => {
    const storage = new MemoryStorage();
    storage.setItem(AUTOSAVE_KEY, 'travail d’un autre élève');
    const filtered = withoutAutosave(storage);
    expect(filtered?.getItem(AUTOSAVE_KEY)).toBeNull();
    filtered?.setItem(AUTOSAVE_KEY, 'nouveau');
    expect(storage.getItem(AUTOSAVE_KEY)).toBe('travail d’un autre élève');
    filtered?.setItem('reseaulab:fiches-lues', '["ip"]');
    expect(filtered?.getItem('reseaulab:fiches-lues')).toBe('["ip"]');
    expect(withoutAutosave(null)).toBeNull();
  });

  test('une session intégrée ne reprend pas le travail laissé sur le poste', () => {
    const storage = new MemoryStorage();
    const previous = new Session(storage, new ManualFrames());
    previous.addDevice('computer');
    previous.saveNow();
    const session = new Session(withoutAutosave(storage), new ManualFrames());
    expect(session.resumed).toBeNull();
    expect(session.network.devices).toHaveLength(0);
  });
});
