import { givenText, partsOf, scoreQuestions } from '../../learn/activity/questions';
import { requiredObjectives, type Objective, type Work } from '../../learn/activity/schema';
import { addressingTable } from '../../learn/report/addressing';
import { DEVICE_LABEL } from '../../i18n/fr';
import { useSession } from '../context';
import { PlanFigure } from './PlanFigure';
import { solution } from './Question';

const two = (n: number) => String(n).padStart(2, '0');

/** « 10/11/2026 à 09:42 ». */
function dateTime(time: number): string {
  const d = new Date(time);
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} à ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** « 09:42 ». */
function clockTime(time: number): string {
  const d = new Date(time);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** The answer given to a question, marked; nothing when it was not answered. */
function AnswerLine({ objective, work }: { objective: Objective; work: Work }) {
  const answer = work.answers[objective.id];
  if (objective.check.type !== 'question' || !answer) return null;
  return (
    <div className="report-answer">
      {answer.item ? answer.item.prompt : objective.check.question.prompt}
      <br />
      <i>Réponse :</i> {givenText(answer) || '—'}
      {answer.right === false && answer.item && (
        <>
          {' '}
          — <i>attendu :</i> {solution(answer.item)}
        </>
      )}
    </div>
  );
}

/**
 * The report of a pupil's work: who, what was built (plan and addressing
 * table), what was reached in the activity, what was learnt. Made to be
 * printed or saved as a PDF, and read by the teacher.
 */
export function Report({ printedAt }: { printedAt: number }) {
  const session = useSession();
  const { network, activity, work } = session;
  const outcomes = session.activityOutcomes();
  const rows = addressingTable(network);
  const objectives = activity ? requiredObjectives(activity) : [];
  const done = objectives.filter((o) => outcomes.get(o.id)?.status === 'done').length;
  const hints = Object.values(work.hints).reduce((sum, n) => sum + n, 0);
  const commands = work.commands.map((entry) => {
    const [deviceId = '', command = ''] = entry.split(':');
    return `${command} (${network.device(deviceId)?.name ?? 'équipement supprimé'})`;
  });
  return (
    <article className="report">
      <header>
        <h1>{activity ? activity.title : 'Compte rendu de réseau'}</h1>
        <dl className="report-identity">
          <div>
            <dt>Nom</dt>
            <dd>{work.student.name || '……………………………………'}</dd>
          </div>
          <div>
            <dt>Classe</dt>
            <dd>{work.student.className || '…………'}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{dateTime(printedAt)}</dd>
          </div>
        </dl>
      </header>

      <section>
        <h2>Plan du réseau</h2>
        <PlanFigure network={network} />
      </section>

      <section>
        <h2>Table d’adressage</h2>
        {rows.length === 0 ? (
          <p className="muted">Aucun équipement.</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr>
                <th>Équipement</th>
                <th>Type</th>
                <th>Relié à</th>
                <th>Adresse IP</th>
                <th>Masque</th>
                <th>Passerelle</th>
                <th>Serveur DNS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.deviceId}:${row.iface}`}>
                  <td>
                    {row.name}
                    {row.iface !== '' && ` (${row.iface})`}
                  </td>
                  <td>{DEVICE_LABEL[row.kind]}</td>
                  <td>{row.link}</td>
                  <td>{row.mode === 'automatique (DHCP)' ? 'automatique (DHCP)' : row.ip}</td>
                  <td>{row.mask}</td>
                  <td>{row.gateway}</td>
                  <td>{row.dns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {activity && (
        <section>
          <h2>
            Objectifs de l’activité : {done} sur {objectives.length}
          </h2>
          {partsOf(activity).map((part, p) => {
            const score = scoreQuestions(part.steps, work);
            const steps = part.steps.filter((step) => step.objectives.length > 0);
            if (steps.length === 0) return null;
            return (
              <div key={p} className="report-part">
                {part.title !== null && <h3 className="report-part-title">{part.title}</h3>}
                {score.total > 0 && (
                  <p className="report-facts">
                    Questions : {score.answered} répondue{score.answered > 1 ? 's' : ''} sur {score.total}
                    {score.marked > 0 &&
                      `, ${score.right} juste${score.right > 1 ? 's' : ''} sur ${score.marked} corrigée${score.marked > 1 ? 's' : ''}`}
                    .
                  </p>
                )}
                {steps.map((step) => (
                  <div key={step.id} className="report-step">
                    <h4>{step.title}</h4>
                    <ul>
                      {step.objectives.map((objective) => {
                        const reached = outcomes.get(objective.id)?.status === 'done';
                        const at = work.reachedAt[objective.id];
                        const right = work.answers[objective.id]?.right;
                        const sign = !reached ? '✘' : right === false ? '✘' : '✔';
                        const state = !reached
                          ? 'Non atteint : '
                          : right === false
                            ? 'Réponse fausse : '
                            : right === true
                              ? 'Réponse juste : '
                              : 'Atteint : ';
                        return (
                          <li
                            key={objective.id}
                            className={reached && right !== false ? 'reached' : 'missed'}
                          >
                            <span aria-hidden>{sign}</span> <span className="visually-hidden">{state}</span>
                            {objective.label}
                            {reached && at !== undefined && (
                              <span className="report-time"> ({clockTime(at)})</span>
                            )}
                            <AnswerLine objective={objective} work={work} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            );
          })}
          <p className="report-facts">
            {work.startedAt !== undefined && `Activité commencée le ${dateTime(work.startedAt)}. `}
            Indices demandés : {hints}.
            {commands.length > 0 && ` Commandes utilisées : ${commands.join(', ')}.`}
          </p>
        </section>
      )}

      {work.quizzes.length > 0 && (
        <section>
          <h2>Quiz d’entraînement</h2>
          <p className="report-facts">
            {work.quizzes.length === 1 ? 'Un quiz fait' : `${work.quizzes.length} quiz faits`} :{' '}
            {work.quizzes.map((q) => `${q.right} sur ${q.total}`).join(', ')}.
          </p>
        </section>
      )}

      <section>
        <h2>Ce que j’ai appris</h2>
        {work.conclusion.trim() === '' ? (
          <div className="report-lines" aria-label="À compléter" />
        ) : (
          <p className="report-conclusion">{work.conclusion}</p>
        )}
      </section>
      <footer>RéseauLab — {session.fileName}</footer>
    </article>
  );
}
