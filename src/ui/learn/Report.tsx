import { objectivesOf } from '../../learn/activity/schema';
import { addressingTable } from '../../learn/report/addressing';
import { DEVICE_LABEL } from '../../i18n/fr';
import { useSession } from '../context';
import { PlanFigure } from './PlanFigure';

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
  const objectives = activity ? objectivesOf(activity) : [];
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
          {activity.steps
            .filter((step) => step.objectives.length > 0)
            .map((step) => (
              <div key={step.id} className="report-step">
                <h3>{step.title}</h3>
                <ul>
                  {step.objectives.map((objective) => {
                    const reached = outcomes.get(objective.id)?.status === 'done';
                    const at = work.reachedAt[objective.id];
                    return (
                      <li key={objective.id} className={reached ? 'reached' : 'missed'}>
                        <span aria-hidden>{reached ? '✔' : '✘'}</span>{' '}
                        <span className="visually-hidden">{reached ? 'Atteint : ' : 'Non atteint : '}</span>
                        {objective.label}
                        {reached && at !== undefined && (
                          <span className="report-time"> ({clockTime(at)})</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
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
