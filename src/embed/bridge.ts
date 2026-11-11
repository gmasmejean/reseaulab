/**
 * Mode intégré : RéseauLab dans une autre application (une iframe), qui lui
 * donne le travail à reprendre et garde ce qu'il envoie. RéseauLab ne sait rien
 * de cette application : le protocole tient en trois messages, tous marqués
 * `reseaulab: 1`.
 *
 * - RéseauLab → parent `pret` : répété jusqu'à l'`init`.
 * - parent → RéseauLab `init` : `projet` (fichier .reseaulab.json à reprendre)
 *   ou `activite` (identifiant d'une activité intégrée, à commencer) ;
 *   `consultation` (le professeur regarde : rien n'est renvoyé) ; `eleve`
 *   (nom et classe proposés pour le compte rendu) ; `nom` (nom du fichier).
 * - RéseauLab → parent `etat` : le fichier complet (`projet`), l'avancement
 *   (`progression`, de 0 à 1) et un `resume` d'une ligne ; envoyé peu après
 *   chaque changement, et en quittant la page. `erreur` : le travail reçu est
 *   illisible ; rien n'est alors envoyé, pour ne pas l'écraser.
 */
import { BUILTIN_ACTIVITIES } from '../learn/activity/builtin';
import { progressOf } from '../learn/activity/evaluate';
import { objectivesOf, requiredObjectives } from '../learn/activity/schema';
import { PROJECT_EXTENSION, type Session } from '../ui/session';

/** How often RéseauLab says it is ready, until the parent answers. */
export const READY_INTERVAL_MS = 500;
/** Changes closer than this are sent together. */
export const SEND_DELAY_MS = 1000;

export interface EmbedInit {
  readonly projet?: string;
  readonly activite?: string;
  readonly consultation?: boolean;
  readonly eleve?: { readonly name?: string; readonly className?: string };
  readonly nom?: string;
}

export type EmbedMessage =
  | { readonly reseaulab: 1; readonly type: 'pret' }
  | {
      readonly reseaulab: 1;
      readonly type: 'etat';
      readonly projet: string;
      readonly progression: number;
      readonly resume: string;
    }
  | { readonly reseaulab: 1; readonly type: 'erreur'; readonly message: string };

/** The page around RéseauLab, reduced to what the bridge needs (a window, or a double in the tests). */
export interface EmbedHost {
  send(message: EmbedMessage, origin: string): void;
  onMessage(listener: (data: unknown, origin: string, fromParent: boolean) => void): void;
  onLeave(listener: () => void): void;
}

/** True when the address asks for the integrated mode (`?integre`). */
export function isEmbedded(search: string): boolean {
  return new URLSearchParams(search).has('integre');
}

export function windowHost(win: Window): EmbedHost {
  return {
    send: (message, origin) => {
      win.parent.postMessage(message, origin);
    },
    onMessage: (listener) => {
      win.addEventListener('message', (e) => {
        listener(e.data, e.origin, e.source === win.parent);
      });
    },
    onLeave: (listener) => {
      win.addEventListener('pagehide', listener);
    },
  };
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

/** The `init` message, or null when the data is something else. */
export function parseInit(data: unknown): EmbedInit | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  if (m.reseaulab !== 1 || m.type !== 'init') return null;
  const eleve = typeof m.eleve === 'object' && m.eleve !== null ? (m.eleve as Record<string, unknown>) : null;
  const projet = text(m.projet, Infinity);
  const activite = text(m.activite, 80);
  const nom = text(m.nom, 120);
  const name = text(eleve?.name, 80);
  const className = text(eleve?.className, 40);
  return {
    ...(projet !== undefined && { projet }),
    ...(activite !== undefined && { activite }),
    ...(m.consultation === true && { consultation: true }),
    ...(eleve && {
      eleve: { ...(name !== undefined && { name }), ...(className !== undefined && { className }) },
    }),
    ...(nom !== undefined && { nom }),
  };
}

/** Share of the required objectives reached, and a one-line summary for the teacher. */
export function summarize(session: Session): { progression: number; resume: string } {
  const activity = session.activity;
  if (!activity) {
    const count = session.network.devices.length;
    return { progression: 0, resume: `Réseau libre : ${count} équipement${count > 1 ? 's' : ''}` };
  }
  const done = session.objectivesDone();
  const required = requiredObjectives(activity);
  const requiredIds = new Set(required.map((o) => o.id));
  const bonus = objectivesOf(activity).filter((o) => !requiredIds.has(o.id));
  const reached = required.filter((o) => done.has(o.id)).length;
  const steps = activity.steps.filter((s) => s.bonus !== true).length;
  const step = Math.min(session.activityStep + 1, steps);
  const parts = [
    reached === required.length ? 'Terminé' : `Étape ${step}/${steps}`,
    `${reached}/${required.length} objectifs`,
  ];
  const bonusDone = bonus.filter((o) => done.has(o.id)).length;
  if (bonusDone > 0) parts.push(`bonus ${bonusDone}/${bonus.length}`);
  const answers = Object.values(session.work.answers).filter((a) => a.right !== null);
  if (answers.length > 0) {
    parts.push(`${answers.filter((a) => a.right === true).length}/${answers.length} bonnes réponses`);
  }
  return { progression: progressOf(required, done), resume: parts.join(' · ') };
}

/** Loads what the parent asks for; false when the work given cannot be read. */
function load(session: Session, init: EmbedInit): boolean {
  if (init.projet !== undefined) {
    if (!session.openProject(init.projet, `travail${PROJECT_EXTENSION}`)) return false;
  } else if (init.activite !== undefined) {
    const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === init.activite);
    if (!builtin) return false;
    session.startActivity(builtin);
  }
  if (init.nom !== undefined) session.setProjectName(init.nom);
  const { student } = session.work;
  if (init.eleve && student.name === '' && student.className === '') {
    session.setStudent(init.eleve.name ?? '', init.eleve.className ?? '');
  }
  return true;
}

/**
 * Starts the integrated mode: says it is ready, loads the work sent by the
 * parent, then sends the work back after each change (never when the teacher
 * is only looking at it).
 */
export function startEmbed(session: Session, host: EmbedHost): void {
  session.setEmbed({ consultation: false });
  let origin: string | null = null;
  let sending = false;
  let last: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!sending || origin === null) return;
    const projet = session.serialize();
    if (projet === last) return;
    last = projet;
    host.send({ reseaulab: 1, type: 'etat', projet, ...summarize(session) }, origin);
  };
  const schedule = () => {
    if (sending && timer === null) timer = setTimeout(flush, SEND_DELAY_MS);
  };

  const ready = setInterval(() => {
    host.send({ reseaulab: 1, type: 'pret' }, '*');
  }, READY_INTERVAL_MS);
  host.send({ reseaulab: 1, type: 'pret' }, '*');

  host.onMessage((data, from, fromParent) => {
    if (!fromParent || origin !== null) return;
    const init = parseInit(data);
    if (!init) return;
    clearInterval(ready);
    // A page opened from a file has no origin to answer to.
    origin = from === '' || from === 'null' ? '*' : from;
    const consultation = init.consultation === true;
    session.setEmbed({ consultation });
    if (!load(session, init)) {
      host.send(
        {
          reseaulab: 1,
          type: 'erreur',
          message:
            init.projet !== undefined
              ? 'Le travail enregistré n’a pas pu être relu.'
              : `Activité inconnue : ${init.activite ?? ''}`,
        },
        origin,
      );
      return;
    }
    if (consultation) return;
    sending = true;
    // The work as loaded (with the date it began, which draws the questions) is kept at once.
    flush();
    session.subscribe(schedule);
  });
  host.onLeave(flush);
}
