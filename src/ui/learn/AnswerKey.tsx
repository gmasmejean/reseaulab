import type { Network } from '../../engine/network';
import {
  answerKey,
  type KeyObjective,
  type KeyPart,
  type KeyQuestion,
  type KeyStep,
} from '../../learn/activity/answerKey';
import type { Activity } from '../../learn/activity/schema';
import { useSession } from '../context';
import { PlanFigure } from './PlanFigure';
import { RichText } from './RichText';

/**
 * Who reads the answer key: the teacher gets all of it (how the lesson
 * unfolds, what the pupils are asked, hints, how each thing is checked); the
 * pupils get the correction alone, to be handed out.
 */
export type Audience = 'teacher' | 'pupils';

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** « ≈ 12 min », or nothing when the activity gives no duration. */
const minutesText = (minutes: number | null) => (minutes === null ? '' : `≈ ${minutes} min`);

/** Colours of the parts, in turn (see styles.css); the bonus has its own. */
const TONES = 4;
const toneOf = (part: KeyPart, index: number) =>
  part.bonus ? 'key-tone-bonus' : `key-tone-${index % TONES}`;

/** « Séance 1 — Partie 1 » of « Séance 1 — Partie 1 : ce que je sais » : what fits in a narrow box. */
const shortTitle = (title: string | null) => title?.split(' : ')[0] ?? 'Activité';

function Expected({ question }: { question: KeyQuestion }) {
  const label = (text: string) => (
    <b className="key-answer-label">
      <span aria-hidden="true">✔ </span>
      {text}
    </b>
  );
  if (question.pairs.length > 0) {
    return (
      <>
        <p>{label('Réponse attendue :')}</p>
        <ul className="key-pairs">
          {question.pairs.map(([left, right]) => (
            <li key={left}>
              <b>{left}</b>
              <span> → </span>
              <span>{right}</span>
            </li>
          ))}
        </ul>
      </>
    );
  }
  if (question.expected.length === 1) {
    return (
      <p>
        {label('Réponse attendue :')} {question.expected[0]}
      </p>
    );
  }
  const lines = question.expected.map((line) => <li key={line}>{line}</li>);
  return (
    <>
      <p>{label(question.ordered ? 'Ordre attendu :' : 'Réponses attendues :')}</p>
      {question.ordered ? (
        <ol className="key-expected">{lines}</ol>
      ) : (
        <ul className="key-expected">{lines}</ul>
      )}
    </>
  );
}

function ObjectiveKey({
  objective,
  number,
  teacher,
}: {
  objective: KeyObjective;
  /** Rank of the question among those of its step. */
  number: number;
  teacher: boolean;
}) {
  const question = objective.question;
  if (!question) {
    return (
      <li className="key-item key-check">
        <span className="key-badge key-badge-check">À faire</span> {objective.label}
        {teacher && objective.how !== undefined && <span className="key-how"> — {objective.how}.</span>}
      </li>
    );
  }
  return (
    <li className="key-item key-question">
      <p className="key-prompt">
        <span className="key-badge key-badge-question">Question {number}</span> {question.prompt}
        {teacher && <span className="key-how"> — {question.kind}</span>}
      </p>
      {question.expected.length > 0 && (
        <div className="key-answer">
          <Expected question={question} />
          {question.notes.map((note) => (
            <p key={note} className="key-note">
              {note}
            </p>
          ))}
        </div>
      )}
      {question.explanation !== '' && (
        <p className="key-why">
          <b>
            {!question.marked
              ? 'Éléments de réponse :'
              : teacher
                ? 'Explication donnée à l’élève :'
                : 'Explication :'}
          </b>{' '}
          {question.explanation}
        </p>
      )}
      {teacher &&
        question.marking.map((note) => (
          <p key={note} className="key-note">
            {note}
          </p>
        ))}
    </li>
  );
}

function StepKey({ step, teacher }: { step: KeyStep; teacher: boolean }) {
  const session = useSession();
  const notions = step.notions.map((id) => session.notion(id)).filter((n) => n !== undefined);
  const asked = step.objectives.filter((objective) => objective.question !== undefined);
  return (
    <div className="key-step">
      <div className="key-step-head">
        <h3>
          <span className="key-number">{step.number}.</span> {step.title}
          {step.optional && (
            <span className="key-tag"> — approfondissement{teacher && ', peut être passée'}</span>
          )}
          {teacher && step.minutes !== null && (
            <span className="key-minutes"> {minutesText(step.minutes)}</span>
          )}
        </h3>
        {teacher && step.body !== '' && (
          <div className="key-box key-instructions">
            <h4>Consigne donnée aux élèves</h4>
            <RichText source={step.body} />
          </div>
        )}
        {step.solution !== '' && (
          <div className="key-box key-solution">
            <h4>Ce qu’il fallait faire ou trouver</h4>
            <RichText source={step.solution} />
          </div>
        )}
        {teacher && step.teacherNote !== '' && (
          <div className="key-box key-teacher-note">
            <h4>Note pour le professeur</h4>
            <RichText source={step.teacherNote} />
          </div>
        )}
      </div>
      {step.objectives.length > 0 && (
        <ol className="key-objectives" aria-label="Objectifs et réponses">
          {step.objectives.map((objective) => (
            <ObjectiveKey
              key={objective.id}
              objective={objective}
              number={asked.indexOf(objective) + 1}
              teacher={teacher}
            />
          ))}
        </ol>
      )}
      {teacher && step.hints.length > 0 && (
        <div className="key-box key-hints-box">
          <h4>Indices, donnés un par un à la demande</h4>
          <ol className="key-hints">
            {step.hints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ol>
        </div>
      )}
      {notions.length > 0 && (
        <p className="key-notions">
          <b>{teacher ? 'Fiches :' : 'Fiches à relire :'}</b>{' '}
          {notions.map((notion, index) => (
            <span key={notion.id}>
              {index > 0 && ' ; '}
              {notion.title}
              {teacher && notion.curriculum !== undefined && ` (programme : ${notion.curriculum})`}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** How the lesson may unfold: the share of each part, then step by step. One page of its own on paper. */
function Schedule({ parts }: { parts: readonly KeyPart[] }) {
  const steps = parts.flatMap((part) => part.steps);
  const timed = steps.some((step) => step.minutes !== null);
  const longest = Math.max(1, ...steps.map((step) => step.minutes ?? 0));
  const columns = timed ? 5 : 3;
  /** Minutes gone by at the end of each timed step. */
  const elapsed = new Map<string, number>();
  steps.reduce((sum, step) => {
    if (step.minutes === null) return sum;
    elapsed.set(step.id, sum + step.minutes);
    return sum + step.minutes;
  }, 0);
  return (
    <section className="key-schedule">
      <h2>Déroulement</h2>
      {timed && (
        <div className="key-timeline" role="img" aria-label="Durée estimée de chaque partie">
          {parts.map(
            (part, index) =>
              part.minutes !== null &&
              part.minutes > 0 && (
                <div
                  key={index}
                  className={`key-timeline-part ${toneOf(part, index)}`}
                  style={{ flexGrow: part.minutes }}
                >
                  <b>{shortTitle(part.title)}</b>
                  <span>{minutesText(part.minutes)}</span>
                </div>
              ),
          )}
        </div>
      )}
      <table className="report-table key-plan">
        <thead>
          <tr>
            <th>Étape</th>
            <th>À faire</th>
            <th>Questions</th>
            {timed && <th>Durée estimée</th>}
            {timed && <th>Temps écoulé</th>}
          </tr>
        </thead>
        {parts.map((part, index) => (
          <tbody key={index} className={toneOf(part, index)}>
            {part.title !== null && (
              <tr className="key-plan-part">
                <th colSpan={columns} scope="rowgroup">
                  {part.title}
                  {part.bonus && ' — pour ceux qui ont fini'}
                  {part.minutes !== null && ` (${minutesText(part.minutes)})`}
                </th>
              </tr>
            )}
            {part.steps.map((step) => (
              <tr key={step.id}>
                <td>
                  {step.number}. {step.title}
                  {step.optional && ' (approfondissement)'}
                </td>
                <td className="key-count">{step.checks}</td>
                <td className="key-count">{step.questions}</td>
                {timed && (
                  <td className="key-duration">
                    {step.minutes !== null && (
                      <>
                        <span className="key-bar" aria-hidden="true">
                          <span style={{ width: `${(100 * step.minutes) / longest}%` }} />
                        </span>
                        {minutesText(step.minutes)}
                      </>
                    )}
                  </td>
                )}
                {timed && (
                  <td className="key-count">
                    {elapsed.has(step.id) ? `${elapsed.get(step.id) ?? 0} min` : ''}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {timed && (
        <p className="key-note">
          Durées : une estimation, pas une mesure. La durée indicative de l’activité est répartie entre les
          étapes selon ce que chacune demande (une manipulation compte double d’une question). « Temps écoulé
          » : depuis le début de l’activité, à la fin de l’étape.
        </p>
      )}
    </section>
  );
}

/**
 * The answer key of an activity. For the teacher: how the lesson may unfold,
 * then each step with what the pupils are asked, what there is to do, the
 * right answer and the explanation of every question. For the pupils: the
 * correction alone. Made to be printed (see styles.css): the plan has a page
 * in landscape, the unfolding a page of its own, each part begins a page, and
 * nothing is cut in the middle of a question.
 */
export function AnswerKey({
  activity,
  network = null,
  planCaption = '',
  audience = 'teacher',
}: {
  activity: Activity;
  /** The network drawn under the title; none, or an empty one, draws nothing. */
  network?: Network | null;
  planCaption?: string;
  audience?: Audience;
}) {
  const teacher = audience === 'teacher';
  const parts = answerKey(activity);
  const steps = parts.flatMap((part) => part.steps);
  const checks = steps.reduce((sum, step) => sum + step.checks, 0);
  const questions = steps.reduce((sum, step) => sum + step.questions, 0);
  const optional = steps.filter((step) => step.optional).length;
  const drawn = network !== null && network.devices.length > 0;
  const word = teacher ? 'Corrigé' : 'Correction';
  return (
    <article className={`report answer-key key-${audience}`}>
      <div className={drawn ? 'key-front key-front-plan' : 'key-front'}>
        <header className="key-cover">
          <p className="key-kicker">{teacher ? 'Document pour le professeur' : 'Correction de l’activité'}</p>
          <h1>
            {word} — {activity.title}
          </h1>
          <ul className="key-chips" aria-label="En bref">
            <li>Niveau {activity.level}</li>
            {teacher && activity.duration !== undefined && (
              <li>durée indicative : {activity.duration} min</li>
            )}
            <li>{plural(steps.length, 'étape', 'étapes')}</li>
            <li>{plural(checks, 'manipulation vérifiée', 'manipulations vérifiées')}</li>
            <li>{plural(questions, 'question', 'questions')}</li>
          </ul>
          {teacher && (
            <p className="key-note">
              Construit à partir de l’activité elle-même : les réponses sont celles que RéseauLab attend. Les
              choix d’une question sont mélangés pour chaque élève.
              {activity.requireCorrection === true &&
                ' Correction obligatoire : une réponse fausse doit être reprise avec succès pour passer à l’étape suivante.'}
              {optional > 0 &&
                ` ${plural(optional, 'étape d’approfondissement peut être passée', 'étapes d’approfondissement peuvent être passées')} par les élèves qui manquent de temps.`}
            </p>
          )}
          <p className="key-legend">
            <span className="key-badge key-badge-check">À faire</span> une manipulation, vérifiée par
            RéseauLab
            {' · '}
            <span className="key-badge key-badge-question">Question</span> avec sa réponse
            <span className="key-legend-answer">
              <span aria-hidden="true">✔ </span>attendue
            </span>
          </p>
        </header>
        {drawn && (
          <section className="key-overview">
            <h2>Le réseau de l’activité</h2>
            <figure className="key-plan-figure">
              <PlanFigure network={network} />
              {planCaption !== '' && <figcaption>{planCaption}</figcaption>}
            </figure>
          </section>
        )}
      </div>

      {teacher && <Schedule parts={parts} />}

      {teacher && activity.intro !== '' && (
        <section className="key-intro">
          <h2>Consigne générale donnée aux élèves</h2>
          <div className="key-box key-instructions">
            <RichText source={activity.intro} />
          </div>
        </section>
      )}

      {parts.map((part, index) => (
        <section
          key={index}
          className={`key-part ${toneOf(part, index)}${index === 0 ? ' key-part-first' : ''}`}
        >
          {part.title !== null && (
            <h2 className="key-part-title">
              {part.title}
              {part.bonus && ' — pour ceux qui ont fini'}
              {teacher && part.minutes !== null && (
                <span className="key-minutes"> {minutesText(part.minutes)}</span>
              )}
            </h2>
          )}
          {teacher && part.note !== '' && (
            <div className="key-box key-instructions">
              <RichText source={part.note} />
            </div>
          )}
          {part.steps.map((step) => (
            <StepKey key={step.id} step={step} teacher={teacher} />
          ))}
        </section>
      ))}
      <footer>
        RéseauLab — {word.toLowerCase()} de « {activity.title} »
      </footer>
    </article>
  );
}
