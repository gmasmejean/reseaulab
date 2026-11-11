import { useRef, useState } from 'react';
import { MODE_LABEL, decimal, speedLabel } from '../../i18n/fr';
import { useFrame, useSession } from '../context';
import { downloadText } from '../files';
import { SPEEDS } from '../session';
import { ConfirmDialog } from './ConfirmDialog';
import { SaveDialog } from './SaveDialog';
import { PROFILE_LABEL } from '../../learn/profile/capabilities';
import { useLint } from '../learn/hooks';

/** Simulated time; alone to follow the animation frames. */
function Clock() {
  const session = useSession();
  useFrame();
  return (
    <span className="clock" title="Temps simulé">
      {decimal(session.network.scheduler.now / 1000, 1)} s
    </span>
  );
}

export function Toolbar() {
  const session = useSession();
  const fileInput = useRef<HTMLInputElement>(null);
  /** Action waiting for the user to accept losing the current network. */
  const [pendingReplace, setPendingReplace] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const replaceNetwork = (action: () => void) => {
    const { devices, notes } = session.network;
    if (devices.length === 0 && notes.length === 0) action();
    else setPendingReplace(() => action);
  };
  const simulation = session.mode === 'simulation';
  const problems = useLint().filter((f) => f.severity === 'error' || f.severity === 'warning').length;
  const speedIndex = Math.max(
    0,
    SPEEDS.findIndex((s) => s === session.speed),
  );

  return (
    <header className="toolbar">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
          <circle cx="5" cy="13" r="4" />
          <circle cx="21" cy="5" r="4" />
          <circle cx="21" cy="21" r="4" />
          <path d="M8.5 11.5 L17.5 6.5 M8.5 14.5 L17.5 19.5" />
        </svg>
        RéseauLab
      </div>
      <nav className="toolbar-group" aria-label="Projet">
        {/* Replacing the network is a design action: not offered during a simulation. */}
        {!simulation && (
          <>
            <button
              type="button"
              onClick={() => {
                replaceNetwork(() => {
                  session.newProject();
                });
              }}
            >
              Nouveau
            </button>
            <button type="button" onClick={() => fileInput.current?.click()}>
              Ouvrir…
            </button>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".json,.fls,application/json"
          hidden
          data-testid="open-project"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            replaceNetwork(() => {
              const open = file.name.toLowerCase().endsWith('.fls')
                ? file.arrayBuffer().then((buffer) => session.openFilius(new Uint8Array(buffer), file.name))
                : file.text().then((text) => session.openProject(text, file.name));
              open.catch(() => {
                session.notify('Lecture du fichier impossible.', 'error');
              });
            });
          }}
        />
        <button
          type="button"
          onClick={() => {
            session.commitEdit();
            setSaving(true);
          }}
        >
          Enregistrer
        </button>
        <button
          type="button"
          title="Compte rendu à imprimer : plan, table d’adressage, objectifs atteints"
          onClick={() => {
            session.commitEdit();
            session.openWindow({ type: 'report' });
          }}
        >
          Compte rendu
        </button>
        {!simulation && (
          <>
            <button
              type="button"
              onClick={() => {
                replaceNetwork(() => {
                  session.loadExample();
                });
              }}
            >
              Exemple
            </button>
            <button
              type="button"
              title="Activités guidées, avec des objectifs vérifiés automatiquement"
              onClick={() => {
                session.openWindow({ type: 'activities' });
              }}
            >
              Activités
            </button>
          </>
        )}
      </nav>
      {/* Each mode shows its own controls, so that the bar fits on a 1366 px screen. */}
      {!simulation && (
        <div className="toolbar-group" role="group" aria-label="Historique">
          <button
            type="button"
            className="icon-button"
            aria-label="Annuler"
            title="Annuler la dernière modification (Ctrl+Z)"
            disabled={!session.canUndo}
            onClick={() => {
              session.undo();
            }}
          >
            ↶
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Rétablir"
            title="Rétablir la modification annulée (Ctrl+Y)"
            disabled={!session.canRedo}
            onClick={() => {
              session.redo();
            }}
          >
            ↷
          </button>
        </div>
      )}
      <div className="mode-switch" role="radiogroup" aria-label="Mode">
        {(['design', 'simulation'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={session.mode === mode}
            className={session.mode === mode ? `active ${mode}` : ''}
            onClick={() => {
              session.setMode(mode);
            }}
          >
            {mode === 'design' ? '✎ ' : '▶ '}
            {MODE_LABEL[mode]}
          </button>
        ))}
      </div>
      {simulation && (
        <div className="toolbar-group sim-controls">
          <button
            type="button"
            onClick={() => {
              session.togglePause();
            }}
          >
            {session.paused ? 'Reprendre' : 'Pause'}
          </button>
          <button
            type="button"
            title="Avancer jusqu’à l’arrivée des trames en cours, puis s’arrêter"
            disabled={session.stepping}
            onClick={() => {
              session.stepFrame();
            }}
          >
            Trame suivante
          </button>
          <label className="speed">
            Vitesse
            <input
              type="range"
              min={0}
              max={SPEEDS.length - 1}
              value={speedIndex}
              onChange={(e) => {
                session.setSpeed(SPEEDS[Number(e.target.value)] ?? 1);
              }}
              aria-valuetext={speedLabel(session.speed)}
            />
            <span className="speed-value">{speedLabel(session.speed)}</span>
          </label>
          <Clock />
        </div>
      )}
      <button
        type="button"
        className="check-button"
        title="Tester une communication et repérer les erreurs de configuration"
        aria-label={
          problems === 0
            ? 'Vérifier'
            : `Vérifier : ${problems} ${problems === 1 ? 'point repéré' : 'points repérés'}`
        }
        onClick={() => {
          session.openWindow({ type: 'diagnose' });
        }}
      >
        Vérifier
        {problems > 0 && (
          <span className="count" aria-hidden>
            {problems}
          </span>
        )}
      </button>
      <button
        type="button"
        title="Prise en main de RéseauLab et fiches de connaissances (F1 : fiche de l’équipement sélectionné)"
        onClick={() => {
          session.openKnowledge();
        }}
      >
        Aide
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Réglages"
        title={`Réglages de la classe (niveau : ${PROFILE_LABEL[session.profile.base]})`}
        onClick={() => {
          session.openWindow({ type: 'settings' });
        }}
      >
        ⚙
      </button>
      {saving && (
        <SaveDialog
          fileName={session.fileName}
          onSave={(name) => {
            setSaving(false);
            session.setProjectName(name);
            downloadText(session.fileName, session.serialize());
            session.notify(`Projet enregistré dans vos téléchargements : ${session.fileName}`);
          }}
          onCancel={() => {
            setSaving(false);
          }}
        />
      )}
      {pendingReplace && (
        <ConfirmDialog
          title="Remplacer le réseau ?"
          message="Le réseau actuel sera remplacé. Pensez à l’enregistrer avant si vous voulez le garder."
          confirmLabel="Remplacer"
          danger
          onConfirm={() => {
            setPendingReplace(null);
            pendingReplace();
          }}
          onCancel={() => {
            setPendingReplace(null);
          }}
        />
      )}
    </header>
  );
}
