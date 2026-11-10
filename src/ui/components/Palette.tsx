import type { DeviceKind } from '../../engine/devices/device';
import { DEVICE_ALIAS, DEVICE_LABEL } from '../../i18n/fr';
import { useSession } from '../context';
import { DEVICE_DRAG_TYPE } from './Canvas';
import { DeviceIcon } from './DeviceIcon';

const KINDS: readonly DeviceKind[] = ['computer', 'laptop', 'switch', 'router'];

function alias(kind: DeviceKind): string {
  const other = DEVICE_ALIAS[kind];
  return other ? `, aussi appelé ${other}` : '';
}

export function Palette() {
  const session = useSession();
  const disabled = session.mode === 'simulation';
  return (
    <aside className="palette" aria-label="Palette d’équipements">
      <h2>Équipements</h2>
      {KINDS.filter((kind) => session.can(`device:${kind}`)).map((kind) => (
        <button
          key={kind}
          type="button"
          className="palette-item"
          draggable={!disabled}
          disabled={disabled}
          title={`Ajouter : ${DEVICE_LABEL[kind]}${alias(kind)} (cliquer ou glisser sur le plan)`}
          onDragStart={(e) => {
            e.dataTransfer.setData(DEVICE_DRAG_TYPE, kind);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => {
            session.addDevice(kind);
          }}
        >
          <DeviceIcon kind={kind} size={40} />
          <span>{DEVICE_LABEL[kind]}</span>
        </button>
      ))}
      <h2>Outils</h2>
      <button
        type="button"
        className={`palette-item tool ${session.tool === 'cable' ? 'active' : ''}`}
        disabled={disabled}
        aria-pressed={session.tool === 'cable'}
        onClick={() => {
          session.setTool(session.tool === 'cable' ? 'select' : 'cable');
        }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="tool-icon">
          <path d="M6 34 C 14 10, 26 30, 34 6" />
          <circle cx="6" cy="34" r="3" />
          <circle cx="34" cy="6" r="3" />
        </svg>
        <span>Câble</span>
      </button>
      {session.can('feature:notes') && (
        <>
          <button
            type="button"
            className="palette-item tool"
            disabled={disabled}
            title="Ajouter un texte sur le plan"
            onClick={() => {
              session.addNote('text');
            }}
          >
            <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="tool-icon">
              <path d="M10 10 H30 M20 10 V32 M15 32 H25" />
            </svg>
            <span>Texte</span>
          </button>
          <button
            type="button"
            className="palette-item tool"
            disabled={disabled}
            title="Ajouter une zone colorée (pour regrouper des équipements)"
            onClick={() => {
              session.addNote('zone');
            }}
          >
            <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden className="tool-icon">
              <rect x="6" y="10" width="28" height="20" rx="3" />
            </svg>
            <span>Zone</span>
          </button>
        </>
      )}
      {session.tool === 'cable' && !disabled && (
        <p className="palette-hint">
          {session.cableStart ? 'Cliquez sur le second équipement.' : 'Cliquez sur le premier équipement.'}
          <br />
          Échap pour annuler.
        </p>
      )}
    </aside>
  );
}
