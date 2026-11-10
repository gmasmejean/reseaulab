import { useState } from 'react';
import type { Outcome } from '../../learn/activity/evaluate';
import { familyOf, objectivesOf, type Objective, type Step } from '../../learn/activity/schema';
import { useSession } from '../context';
import { RichText } from './RichText';

const SIGN: Record<Outcome['status'], string> = { done: '✔', todo: '○', unknown: '?', locked: '·' };
const STATE: Record<Outcome['status'], string> = {
  done: 'Atteint',
  todo: 'À faire',
  unknown: 'Pas encore vérifiable',
  locked: 'Étape suivante',
};

function ObjectiveLine({ objective, outcome }: { objective: Objective; outcome: Outcome }) {
  const detail = 'detail' in outcome ? outcome.detail : undefined;
  return (
    <li className={`objective ${outcome.status}`}>
      <span className="objective-sign" aria-hidden>
        {SIGN[outcome.status]}
      </span>
      <span>
        <span className="visually-hidden">{STATE[outcome.status]} : </span>
        {objective.label}
        {detail !== undefined && outcome.status !== 'done' && (
          <span className="objective-detail"> {detail}</span>
        )}
      </span>
    </li>
  );
}

/**
 * The activity being done, next to the plan: instructions step by step,
 * objectives that tick themselves, hints on request.
 */
export function ActivityPanel() {
  const session = useSession();
  const activity = session.activity;
  const [folded, setFolded] = useState(false);
  /** Steps opened or closed by hand; the others follow the progress. */
  const [toggled, setToggled] = useState<Readonly<Record<string, boolean>>>({});
  if (!activity) return null;

  const outcomes = session.activityOutcomes();
  const all = objectivesOf(activity);
  const done = all.filter((o) => outcomes.get(o.id)?.status === 'done').length;
  const current = session.activityStep;
  const finished = all.length > 0 && done === all.length;
  const hasProbes = all.some((o) => familyOf(o.check) === 'probe');
  const openNotion = (id: string) => {
    session.openKnowledge(id);
  };
  const titleOf = (id: string) => session.notion(id)?.title ?? null;

  if (folded) {
    return (
      <aside className="activity folded" aria-label="Activité">
        <button
          type="button"
          title="Afficher l’activité"
          onClick={() => {
            setFolded(false);
          }}
        >
          ◂ Activité ({done}/{all.length})
        </button>
      </aside>
    );
  }

  const stepView = (step: Step, index: number) => {
    const objectives = step.objectives.map((o) => ({
      o,
      outcome: outcomes.get(o.id) ?? { status: 'todo' as const },
    }));
    const complete = objectives.every((x) => x.outcome.status === 'done');
    const locked = index > current;
    const open = toggled[step.id] ?? index === current;
    const shownHints = Math.min(session.work.hints[step.id] ?? 0, step.hints.length);
    const notions = step.notions.map((id) => session.notion(id)).filter((n) => n !== undefined);
    return (
      <li key={step.id} className={`activity-step ${locked ? 'locked' : complete ? 'complete' : 'current'}`}>
        <button
          type="button"
          className="step-title"
          aria-expanded={open}
          onClick={() => {
            setToggled({ ...toggled, [step.id]: !open });
          }}
        >
          <span className="step-number" aria-hidden>
            {complete && !locked && objectives.length > 0 ? '✔' : index + 1}
          </span>
          {step.title}
        </button>
        {open && (
          <div className="step-body">
            {step.body !== '' && <RichText source={step.body} onOpenNotion={openNotion} titleOf={titleOf} />}
            {objectives.length > 0 && (
              <ul className="objectives" aria-label={`Objectifs : ${step.title}`}>
                {objectives.map(({ o, outcome }) => (
                  <ObjectiveLine key={o.id} objective={o} outcome={outcome} />
                ))}
              </ul>
            )}
            {step.hints.slice(0, shownHints).map((hint, i) => (
              <p key={i} className="hint">
                <b>Indice {i + 1}.</b> {hint}
              </p>
            ))}
            <div className="step-actions">
              {shownHints < step.hints.length && (
                <button
                  type="button"
                  onClick={() => {
                    session.revealHint(step.id);
                  }}
                >
                  {shownHints === 0 ? 'Un indice' : 'Un autre indice'} ({shownHints}/{step.hints.length})
                </button>
              )}
              {notions.map((notion) => (
                <button
                  key={notion.id}
                  type="button"
                  className="link"
                  title="Ouvrir la fiche de connaissances"
                  onClick={() => {
                    openNotion(notion.id);
                  }}
                >
                  Fiche : {notion.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <aside className="activity" aria-label="Activité">
      <header>
        <h2>{activity.title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Réduire l’activité"
          title="Réduire pour agrandir le plan"
          onClick={() => {
            setFolded(true);
          }}
        >
          ▸
        </button>
      </header>
      <p className="activity-progress" role="status">
        <progress value={done} max={Math.max(1, all.length)} aria-label="Avancement" />
        {done} objectif{done > 1 ? 's' : ''} sur {all.length}
      </p>
      <div className="activity-scroll">
        {activity.intro !== '' && (
          <details className="activity-intro" open={done === 0}>
            <summary>Consigne</summary>
            <RichText source={activity.intro} onOpenNotion={openNotion} titleOf={titleOf} />
          </details>
        )}
        <ol className="activity-steps">{activity.steps.map(stepView)}</ol>
        {finished && (
          <p className="activity-finished" role="status">
            ✔ Tous les objectifs sont atteints. Bravo ! Pensez à <b>Enregistrer</b> votre travail.
          </p>
        )}
      </div>
      <footer>
        {hasProbes && (
          <button
            type="button"
            className="primary"
            title="Teste sur une copie du réseau ce qui ne se lit pas sur le plan (communications, pages web)"
            onClick={() => {
              session.checkWork();
            }}
          >
            Vérifier mon travail
          </button>
        )}
        <button
          type="button"
          title="Garder le réseau et fermer l’activité"
          onClick={() => {
            session.quitActivity();
          }}
        >
          Quitter l’activité
        </button>
      </footer>
    </aside>
  );
}
