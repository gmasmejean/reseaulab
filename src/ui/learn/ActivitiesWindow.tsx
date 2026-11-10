import { useState } from 'react';
import { BUILTIN_ACTIVITIES, type BuiltinActivity } from '../../learn/activity/builtin';
import { teaches } from '../../learn/profile/capabilities';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useSession } from '../context';

/** Activities shipped with RéseauLab; a teacher's own activity opens with « Ouvrir… ». */
export function ActivitiesWindow() {
  const session = useSession();
  const [pending, setPending] = useState<BuiltinActivity | null>(null);
  const start = (activity: BuiltinActivity) => {
    session.closeWindow('activities');
    session.startActivity(activity);
  };
  const choose = (activity: BuiltinActivity) => {
    const { devices, notes } = session.network;
    if (devices.length === 0 && notes.length === 0) start(activity);
    else setPending(activity);
  };
  // The level of the class decides what is listed first, not what is allowed.
  const ordered = [...BUILTIN_ACTIVITIES].sort(
    (a, b) => Number(teaches(session.profile, b.level)) - Number(teaches(session.profile, a.level)),
  );
  return (
    <div className="activities">
      <p className="muted">
        Une activité propose un réseau de départ, des consignes et des objectifs que RéseauLab vérifie
        lui-même. Un fichier d’activité donné par votre professeur s’ouvre avec <b>Ouvrir…</b>
      </p>
      <ul>
        {ordered.map((activity) => (
          <li key={activity.id}>
            <div>
              <p className="activity-name">
                {activity.title} <span className="level-badge">{activity.level}</span>
              </p>
              <p className="muted">{activity.summary}</p>
            </div>
            <button
              type="button"
              className="primary"
              aria-label={`Commencer : ${activity.title}`}
              onClick={() => {
                choose(activity);
              }}
            >
              Commencer
            </button>
          </li>
        ))}
      </ul>
      <p className="muted">
        Enseignant ?{' '}
        <button
          type="button"
          className="link"
          onClick={() => {
            session.openWindow({ type: 'author' });
          }}
        >
          Créer une activité
        </button>
      </p>
      {pending && (
        <ConfirmDialog
          title="Remplacer le réseau ?"
          message="L’activité commence sur son propre réseau : le réseau actuel sera remplacé. Pensez à l’enregistrer avant si vous voulez le garder."
          confirmLabel="Commencer l’activité"
          onConfirm={() => {
            const activity = pending;
            setPending(null);
            start(activity);
          }}
          onCancel={() => {
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
