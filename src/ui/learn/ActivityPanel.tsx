import { useState } from 'react';
import type { Outcome } from '../../learn/activity/evaluate';
import { askQuestion, drawSalt, givenText } from '../../learn/activity/questions';
import {
  familyOf,
  objectivesOf,
  requiredObjectives,
  type ActivityQuestion,
  type Objective,
  type QuestionAnswer,
  type Step,
} from '../../learn/activity/schema';
import { useSession } from '../context';
import { Feedback, QuestionForm } from './Question';
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

/** An open question: a text the teacher reads; not marked. */
function OpenQuestion({
  question,
  answer,
  locked,
  onAnswer,
}: {
  question: ActivityQuestion;
  answer: QuestionAnswer | undefined;
  locked: boolean;
  onAnswer: (text: string) => void;
}) {
  const [text, setText] = useState('');
  if (answer) {
    return (
      <>
        <p className="quiz-prompt">{question.prompt}</p>
        <div className="quiz-feedback open" role="status">
          <p className="quiz-verdict">✔ Réponse enregistrée</p>
          <p className="open-answer">{typeof answer.given === 'string' ? answer.given : ''}</p>
          <p className="muted">Ton professeur la lira sur ton compte rendu.</p>
          {question.explanation !== '' && <p>{question.explanation}</p>}
        </div>
      </>
    );
  }
  return (
    <form
      className="quiz-question"
      onSubmit={(e) => {
        e.preventDefault();
        if (!locked && text.trim() !== '') onAnswer(text);
      }}
    >
      <label>
        <span className="quiz-prompt">{question.prompt}</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={text}
          disabled={locked}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      </label>
      {!locked && (
        <button type="submit" className="primary" disabled={text.trim() === ''}>
          Valider
        </button>
      )}
    </form>
  );
}

/** A question of the activity: asked, then corrected on the spot (one try). */
function QuestionBlock({
  objective,
  locked,
  onAnswered,
}: {
  objective: Objective;
  locked: boolean;
  /** Called after an answer, so that the step stays open while the correction is read. */
  onAnswered: () => void;
}) {
  const session = useSession();
  if (objective.check.type !== 'question') return null;
  const question = objective.check.question;
  const answer = session.work.answers[objective.id];
  const notion = question.notion === undefined ? undefined : session.notion(question.notion);
  const readAgain = notion && answer?.right !== true && answer !== undefined && (
    <button
      type="button"
      className="link"
      onClick={() => {
        session.openKnowledge(notion.id);
      }}
    >
      Relire la fiche : {notion.title}
    </button>
  );
  let content;
  if (question.type === 'open') {
    content = (
      <OpenQuestion
        question={question}
        answer={answer}
        locked={locked}
        onAnswer={(text) => {
          onAnswered();
          session.answerQuestion(objective.id, text);
        }}
      />
    );
  } else if (answer?.item) {
    content = (
      <>
        <p className="quiz-prompt">{answer.item.prompt}</p>
        <p className="given-answer">
          <b>Ta réponse :</b> {givenText(answer)}
        </p>
        <Feedback item={answer.item} right={answer.right === true}>
          {readAgain}
        </Feedback>
      </>
    );
  } else {
    const item = askQuestion(objective.id, question, drawSalt(session.work));
    content = item && (
      <QuestionForm
        key={item.prompt}
        item={item}
        locked={locked}
        onAnswer={(given) => {
          onAnswered();
          session.answerQuestion(objective.id, given);
        }}
      />
    );
  }
  return (
    <section
      className={`activity-question${answer ? ' answered' : ''}`}
      aria-label={`Question : ${objective.label}`}
    >
      {content}
    </section>
  );
}

/** Objectives in their order: checks grouped in lists, questions in their own blocks. */
function groupObjectives<T extends { o: Objective }>(objectives: readonly T[]): (T | T[])[] {
  const groups: (T | T[])[] = [];
  for (const entry of objectives) {
    if (entry.o.check.type === 'question') groups.push(entry);
    else {
      const last = groups.at(-1);
      if (Array.isArray(last)) last.push(entry);
      else groups.push([entry]);
    }
  }
  return groups;
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
  const all = requiredObjectives(activity);
  const isDone = (o: Objective) => outcomes.get(o.id)?.status === 'done';
  const done = all.filter(isDone).length;
  const bonus = objectivesOf(activity).filter((o) => !all.includes(o));
  const bonusDone = bonus.filter(isDone).length;
  const current = session.activityStep;
  const finished = all.length > 0 && done === all.length;
  const hasProbes = objectivesOf(activity).some((o) => familyOf(o.check) === 'probe');
  /** « 3 », or « B1 » for the first bonus step. */
  const numberOf = (index: number) => {
    const step = activity.steps[index];
    if (step?.bonus !== true) return String(index + 1);
    return `B${activity.steps.slice(0, index + 1).filter((s) => s.bonus === true).length}`;
  };
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
            {complete && !locked && objectives.length > 0 ? '✔' : numberOf(index)}
          </span>
          {step.title}
        </button>
        {open && (
          <div className="step-body">
            {step.body !== '' && <RichText source={step.body} onOpenNotion={openNotion} titleOf={titleOf} />}
            {groupObjectives(objectives).map((group) =>
              Array.isArray(group) ? (
                <ul key={group[0]?.o.id} className="objectives" aria-label={`Objectifs : ${step.title}`}>
                  {group.map(({ o, outcome }) => (
                    <ObjectiveLine key={o.id} objective={o} outcome={outcome} />
                  ))}
                </ul>
              ) : (
                <QuestionBlock
                  key={group.o.id}
                  objective={group.o}
                  locked={locked}
                  onAnswered={() => {
                    setToggled((before) => ({ ...before, [step.id]: true }));
                  }}
                />
              ),
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
        {bonus.length > 0 && finished && ` · bonus ${bonusDone}/${bonus.length}`}
      </p>
      <div className="activity-scroll">
        {activity.intro !== '' && (
          <details className="activity-intro" open={done === 0}>
            <summary>Consigne</summary>
            <RichText source={activity.intro} onOpenNotion={openNotion} titleOf={titleOf} />
          </details>
        )}
        <ol className="activity-steps">
          {activity.steps.map((step, index) => {
            const view = stepView(step, index);
            const previous = activity.steps[index - 1];
            const heading =
              step.part ?? (step.bonus === true && previous?.bonus !== true ? 'Bonus' : undefined);
            if (heading === undefined) return view;
            return [
              <li key={`part-${step.id}`} className={`activity-part${step.bonus === true ? ' bonus' : ''}`}>
                <h3>
                  {heading}
                  {step.bonus === true && previous?.bonus !== true && (
                    <span className="muted"> — pour ceux qui ont fini</span>
                  )}
                </h3>
              </li>,
              view,
            ];
          })}
        </ol>
        {finished && (
          <p className="activity-finished" role="status">
            ✔ Tous les objectifs sont atteints. Bravo ! Pensez à <b>Enregistrer</b> votre travail.
            {bonus.length > 0 && bonusDone < bonus.length && ' Tu peux maintenant faire le bonus.'}
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
