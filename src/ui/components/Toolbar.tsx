import { useRef, useState } from 'react';
import { MODE_LABEL } from '../../i18n/fr';
import { useSession } from '../context';
import { downloadText } from '../files';
import { SPEEDS } from '../session';
import { ConfirmDialog } from './ConfirmDialog';

export function Toolbar() {
  const session = useSession();
  const fileInput = useRef<HTMLInputElement>(null);
  /** Action waiting for the user to accept losing the current network. */
  const [pendingReplace, setPendingReplace] = useState<(() => void) | null>(null);
  const replaceNetwork = (action: () => void) => {
    if (session.network.devices.length === 0) action();
    else setPendingReplace(() => action);
  };
  const simulation = session.mode === 'simulation';
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
            const open = file.name.toLowerCase().endsWith('.fls')
              ? file.arrayBuffer().then((buffer) => session.openFilius(new Uint8Array(buffer), file.name))
              : file.text().then((text) => session.openProject(text, file.name));
            open.catch(() => {
              session.notify('Lecture du fichier impossible.', 'error');
            });
          }}
        />
        <button
          type="button"
          onClick={() => {
            downloadText(session.fileName, session.serialize());
            session.notify(`Projet enregistré dans vos téléchargements : ${session.fileName}`);
          }}
        >
          Enregistrer
        </button>
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
      </nav>
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
      <div className="toolbar-group sim-controls" aria-hidden={!simulation}>
        <button
          type="button"
          disabled={!simulation}
          onClick={() => {
            session.togglePause();
          }}
        >
          {session.paused ? 'Reprendre' : 'Pause'}
        </button>
        <label className="speed">
          Vitesse
          <input
            type="range"
            min={0}
            max={SPEEDS.length - 1}
            value={speedIndex}
            onChange={(e) => {
              session.setSpeed(SPEEDS[Number(e.target.value)] ?? 0.5);
            }}
            aria-valuetext={`× ${session.speed}`}
          />
          <span className="speed-value">× {session.speed}</span>
        </label>
        <span className="clock" title="Temps simulé">
          {(session.network.scheduler.now / 1000).toFixed(1)} s
        </span>
      </div>
      <button
        type="button"
        className="help-button"
        onClick={() => {
          session.openWindow({ type: 'help' });
        }}
      >
        Aide
      </button>
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
