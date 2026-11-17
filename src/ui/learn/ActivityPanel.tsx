import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import type { Outcome } from '../../learn/activity/evaluate';
import {
  OPEN_MIN_WORDS,
  askQuestion,
  askRetry,
  canRetry,
  drawSalt,
  givenParts,
  isOpenAnswer,
  partsOf,
  questionsOf,
  scoreQuestions,
  type GivenPart,
} from '../../learn/activity/questions';
import {
  familyOf,
  isOptionalStep,
  objectivesOf,
  optionalObjectives,
  requiredObjectives,
  type ActivityQuestion,
  type Objective,
  type QuestionAnswer,
  type Step,
} from '../../learn/activity/schema';
import { useSession } from '../context';
import {
  ACTIVITY_DEFAULT_WIDTH,
  ACTIVITY_MIN_WIDTH,
  ACTIVITY_WIDTH_STEP,
  MIN_STAGE_WIDTH,
  clampActivityWidth,
} from '../panelWidth';
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
        if (!locked && isOpenAnswer(text)) onAnswer(text);
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
      {!locked && text.trim() !== '' && !isOpenAnswer(text) && (
        <p className="muted small">Rédige une phrase : au moins {OPEN_MIN_WORDS} mots.</p>
      )}
      {!locked && (
        <button type="submit" className="primary" disabled={!isOpenAnswer(text)}>
          Valider
        </button>
      )}
    </form>
  );
}

/**
 * After a wrong answer: a new try on a new draw. The first answer stays the
 * one that is marked; the new try shows the pupil — and the teacher — that
 * the correction was understood.
 */
function Retry({
  objective,
  question,
  answer,
}: {
  objective: Objective;
  question: ActivityQuestion;
  answer: QuestionAnswer;
}) {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const last = answer.retry;
  if (last?.right === true) {
    return (
      <p className="quiz-retry right" role="status">
        ✔ Corrigé au nouvel essai{last.tries > 1 ? ` (${last.tries} essais)` : ''}. Ta première réponse reste
        notée dans le compte rendu.
      </p>
    );
  }
  const retry = askRetry(objective.id, question, session.work);
  if (!retry) return null;
  if (open) {
    return (
      <div className="quiz-retry" role="group" aria-label="Nouvel essai">
        <p className="quiz-retry-title">Nouvel essai</p>
        <QuestionForm
          key={`${retry.tries}:${retry.item.prompt}`}
          item={retry.item}
          locked={false}
          onAnswer={(given) => {
            setOpen(false);
            session.retryQuestion(objective.id, given);
          }}
        />
      </div>
    );
  }
  return (
    <div className="quiz-retry">
      {last && (
        <p role="status">✘ Nouvel essai : ce n’est pas encore ça. Relis la correction, puis réessaie.</p>
      )}
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Réessayer
      </button>
      {session.activity?.requireCorrection === true && (
        <span className="muted small"> Il faut corriger cette réponse pour continuer.</span>
      )}
    </div>
  );
}

/** The answer given, each piece in green if right, in red if not (with ✔ / ✘, not by colour alone). */
function GivenAnswer({ parts, separator }: { parts: readonly GivenPart[]; separator: string }) {
  if (parts.length === 0) return <>—</>;
  return parts.map((part, i) => (
    <span key={i}>
      {i > 0 && separator}
      <span className={`given-part ${part.right ? 'right' : 'wrong'}`}>
        <span aria-hidden>{part.right ? '✔' : '✘'}</span>
        <span className="visually-hidden">{part.right ? '(juste)' : '(faux)'}</span>
        {'\u00a0'}
        {part.text}
      </span>
    </span>
  ));
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
          <b>Ta réponse :</b>{' '}
          <GivenAnswer parts={givenParts(answer)} separator={answer.item.kind === 'order' ? ' → ' : ' ; '} />
        </p>
        <Feedback item={answer.item} right={answer.right === true}>
          {readAgain}
        </Feedback>
        {answer.right === false && <Retry objective={objective} question={question} answer={answer} />}
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

/** Where a step is in the page, to bring it into view. */
const stepAnchor = (stepId: string) => `activity-step-${stepId}`;

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

/** Room shared by the plan and the panel (0 before any layout). */
function availableWidth(panel: HTMLElement | null): number {
  if (!panel) return 0;
  const stage = panel.previousElementSibling;
  return panel.getBoundingClientRect().width + (stage?.getBoundingClientRect().width ?? 0);
}

/**
 * The left edge of the panel, dragged to widen it for reading (or with the
 * arrow keys); a double click gives back the usual width. While dragging,
 * only the panel follows (`onDrag`); the width is kept when the button is released.
 */
function PanelResizer({
  panel,
  width,
  onDrag,
}: {
  panel: RefObject<HTMLElement | null>;
  width: number;
  onDrag: (width: number | null) => void;
}) {
  const session = useSession();
  const drag = useRef<{ x: number; width: number; available: number } | null>(null);
  /** Last room measured, for the maximum announced to screen readers. */
  const [room, setRoom] = useState(0);
  const measure = () => {
    const available = availableWidth(panel.current);
    setRoom(available);
    return available;
  };
  const widthAt = (clientX: number) => {
    const start = drag.current;
    return start ? clampActivityWidth(start.width + start.x - clientX, start.available) : width;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const wanted: Record<string, number> = {
      ArrowLeft: width + ACTIVITY_WIDTH_STEP,
      ArrowRight: width - ACTIVITY_WIDTH_STEP,
      Home: ACTIVITY_MIN_WIDTH,
      // As wide as the plan allows.
      End: Number.MAX_SAFE_INTEGER,
    };
    const target = wanted[e.key];
    if (e.key === 'Enter') session.setActivityWidth(null);
    else if (target !== undefined) {
      const available = measure();
      // Without a layout, there is no « as wide as possible ».
      if (available > 0 || e.key !== 'End') session.setActivityWidth(clampActivityWidth(target, available));
    } else return;
    e.preventDefault();
  };
  const end = (e: PointerEvent) => {
    if (!drag.current) return;
    session.setActivityWidth(widthAt(e.clientX));
    drag.current = null;
    onDrag(null);
  };
  const max = room > 0 ? Math.max(width, room - MIN_STAGE_WIDTH) : undefined;
  return (
    <div
      className="activity-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Largeur de l’activité"
      aria-valuenow={width}
      aria-valuemin={ACTIVITY_MIN_WIDTH}
      aria-valuemax={max}
      aria-valuetext={`${width} pixels`}
      tabIndex={0}
      title="Glisser pour élargir ou rétrécir l’activité (double-clic : largeur d’origine)"
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        session.setActivityWidth(null);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, width, available: measure() };
        onDrag(width);
      }}
      onPointerMove={(e) => {
        if (drag.current) onDrag(widthAt(e.clientX));
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <span aria-hidden />
    </div>
  );
}

/**
 * How the questions of a part were answered, as soon as one is marked: the
 * pupil sees the score while working, not only on the report, and goes back
 * to the answers still wrong.
 */
function PartScore({
  steps,
  toReview,
  onReview,
}: {
  steps: readonly Step[];
  toReview: (steps: readonly Step[]) => Step[];
  onReview: (steps: readonly Step[]) => void;
}) {
  const session = useSession();
  const score = scoreQuestions(steps, session.work);
  if (score.marked === 0) return null;
  const left = questionsOf(toReview(steps)).filter((o) => canRetry(session.work.answers[o.id])).length;
  return (
    <p className="part-score" role="status">
      <span>
        Questions : {score.right} juste{score.right > 1 ? 's' : ''} sur {score.marked}
        {score.corrected > 0 && ` · ${score.corrected} corrigée${score.corrected > 1 ? 's' : ''} ensuite`}
      </span>
      {left > 0 && (
        <button
          type="button"
          className="link"
          onClick={() => {
            onReview(steps);
          }}
        >
          Revoir mes erreurs ({left})
        </button>
      )}
    </p>
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
  const panel = useRef<HTMLElement>(null);
  /** Width followed while the edge is dragged; the session keeps it on release. */
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  if (!activity) return null;
  const width = dragWidth ?? session.activityWidth ?? ACTIVITY_DEFAULT_WIDTH;

  const outcomes = session.activityOutcomes();
  const all = requiredObjectives(activity);
  const isDone = (o: Objective) => outcomes.get(o.id)?.status === 'done';
  const done = all.filter(isDone).length;
  /** « Approfondissement » steps: in the course of the activity, but not needed to finish. */
  const extra = optionalObjectives(activity);
  const extraDone = extra.filter(isDone).length;
  const bonus = objectivesOf(activity).filter((o) => !all.includes(o) && !extra.includes(o));
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
  /** The parts of the activity, by their first step: each shows how its questions were answered. */
  const partStarting = new Map(partsOf(activity).map((part) => [part.steps[0]?.id, part]));
  /** Steps of a part with a wrong answer still to correct. */
  const toReview = (steps: readonly Step[]) =>
    steps.filter((step) => questionsOf([step]).some((o) => canRetry(session.work.answers[o.id])));
  const review = (steps: readonly Step[]) => {
    const wrong = toReview(steps);
    setToggled((before) => ({ ...before, ...Object.fromEntries(wrong.map((step) => [step.id, true])) }));
    const first = wrong[0];
    if (!first) return;
    // Once the steps are open.
    requestAnimationFrame(() => {
      const element = document.getElementById(stepAnchor(first.id));
      if (element && 'scrollIntoView' in element) element.scrollIntoView({ block: 'start' });
    });
  };

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
    const optional = isOptionalStep(step);
    const skipped = optional && !complete && session.work.skipped.includes(step.id);
    const open = toggled[step.id] ?? index === current;
    const shownHints = Math.min(session.work.hints[step.id] ?? 0, step.hints.length);
    const notions = step.notions.map((id) => session.notion(id)).filter((n) => n !== undefined);
    return (
      <li
        key={step.id}
        id={stepAnchor(step.id)}
        className={`activity-step ${locked ? 'locked' : complete ? 'complete' : skipped ? 'skipped' : 'current'}`}
      >
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
          {optional && <span className="step-tag"> — approfondissement{skipped && ', passée'}</span>}
        </button>
        {open && (
          <div className="step-body">
            {optional && !complete && (
              <p className="step-optional">
                {skipped
                  ? 'Tu as passé cette étape. Tu peux y revenir quand tu veux.'
                  : 'Étape d’approfondissement : si tu manques de temps, tu peux la passer.'}
                {!skipped && index === current && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={() => {
                        session.skipStep(step.id);
                      }}
                    >
                      Passer cette étape
                    </button>
                  </>
                )}
              </p>
            )}
            {step.body !== '' && <RichText source={step.body} onOpenNotion={openNotion} titleOf={titleOf} />}
            {notions.length > 0 && (
              // Right under the instructions, so that the pupil sees them before answering.
              <div className="step-notions" role="group" aria-label="Fiches pour t’aider">
                <span aria-hidden>Pour t’aider :</span>
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
            )}
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
            {shownHints < step.hints.length && (
              <div className="step-actions">
                <button
                  type="button"
                  onClick={() => {
                    session.revealHint(step.id);
                  }}
                >
                  {shownHints === 0 ? 'Un indice' : 'Un autre indice'} ({shownHints}/{step.hints.length})
                </button>
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <aside
      ref={panel}
      className={`activity${dragWidth === null ? '' : ' resizing'}`}
      aria-label="Activité"
      style={{ width }}
    >
      <PanelResizer panel={panel} width={width} onDrag={setDragWidth} />
      <header>
        <h2>{activity.title}</h2>
        {session.teacher && (
          <button
            type="button"
            title="Réponses attendues, explications et déroulement, à imprimer (professeur)"
            onClick={() => {
              session.openWindow({ type: 'answers' });
            }}
          >
            Corrigé
          </button>
        )}
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
        {extra.length > 0 &&
          (extraDone > 0 || finished) &&
          ` · approfondissement ${extraDone}/${extra.length}`}
        {bonus.length > 0 && finished && ` · bonus ${bonusDone}/${bonus.length}`}
      </p>
      {session.embed?.consultation === false && (
        <p className="activity-autosave">
          Ton travail est enregistré automatiquement : pas besoin d’Enregistrer ni d’Ouvrir.
        </p>
      )}
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
                {step.part !== undefined && (step.partNote ?? '') !== '' && (
                  <div className="part-note">
                    <RichText source={step.partNote ?? ''} onOpenNotion={openNotion} titleOf={titleOf} />
                  </div>
                )}
                <PartScore
                  steps={partStarting.get(step.id)?.steps ?? []}
                  toReview={toReview}
                  onReview={review}
                />
              </li>,
              view,
            ];
          })}
        </ol>
        {finished && (
          <p className="activity-finished" role="status">
            ✔ Tous les objectifs sont atteints. Bravo !{' '}
            {session.embed ? (
              'Ton travail est enregistré automatiquement.'
            ) : (
              <>
                Pensez à <b>Enregistrer</b> votre travail.
              </>
            )}
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
        {/* Embedded, the application chose the activity: it is not left from here. */}
        {!session.embed && (
          <button
            type="button"
            title="Garder le réseau et fermer l’activité"
            onClick={() => {
              session.quitActivity();
            }}
          >
            Quitter l’activité
          </button>
        )}
      </footer>
    </aside>
  );
}
