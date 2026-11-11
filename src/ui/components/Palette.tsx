import { useState } from 'react';
import type { DeviceKind } from '../../engine/devices/device';
import { DEVICE_ALIAS, DEVICE_KINDS, DEVICE_LABEL } from '../../i18n/fr';
import { useSession } from '../context';
import { DEVICE_DRAG_TYPE } from './Canvas';
import { explainEntries } from './canvasMenus';
import { ContextMenu, anchorOf, isMenuKey } from './ContextMenu';
import { DeviceIcon } from './DeviceIcon';

/** Right-click menu of a palette item. */
interface PaletteMenu {
  readonly kind: DeviceKind;
  readonly x: number;
  readonly y: number;
  readonly opener: HTMLElement;
}

function alias(kind: DeviceKind): string {
  const other = DEVICE_ALIAS[kind];
  return other ? `, aussi appelé ${other}` : '';
}

export function Palette() {
  const session = useSession();
  const disabled = session.mode === 'simulation';
  const [menu, setMenu] = useState<PaletteMenu | null>(null);
  return (
    <aside className="palette" data-ui="palette" aria-label="Palette d’équipements">
      <h2>Équipements</h2>
      {DEVICE_KINDS.filter((kind) => session.can(`device:${kind}`)).map((kind) => (
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
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ kind, x: e.clientX, y: e.clientY, opener: e.currentTarget });
          }}
          onKeyDown={(e) => {
            if (!isMenuKey(e)) return;
            e.preventDefault();
            setMenu({ kind, ...anchorOf(e.currentTarget), opener: e.currentTarget });
          }}
        >
          <DeviceIcon kind={kind} size={30} />
          <span>{DEVICE_LABEL[kind]}</span>
        </button>
      ))}
      {menu && (
        <ContextMenu
          label={DEVICE_LABEL[menu.kind]}
          x={menu.x}
          y={menu.y}
          entries={[
            {
              kind: 'action',
              label: 'Ajouter au plan',
              onSelect: () => {
                session.addDevice(menu.kind);
              },
            },
            ...explainEntries(session, menu.kind),
          ]}
          onClose={(reason) => {
            if (reason === 'cancel') menu.opener.focus();
            setMenu(null);
          }}
        />
      )}
      <h2>Outils</h2>
      <button
        type="button"
        className={`palette-item tool ${session.tool === 'cable' ? 'active' : ''}`}
        data-ui="cable"
        disabled={disabled}
        aria-pressed={session.tool === 'cable'}
        onClick={() => {
          session.setTool(session.tool === 'cable' ? 'select' : 'cable');
        }}
      >
        <svg width="30" height="30" viewBox="0 0 40 40" aria-hidden className="tool-icon">
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
            data-ui="texte"
            title="Ajouter un texte sur le plan"
            onClick={() => {
              session.addNote('text');
            }}
          >
            <svg width="30" height="30" viewBox="0 0 40 40" aria-hidden className="tool-icon">
              <path d="M10 10 H30 M20 10 V32 M15 32 H25" />
            </svg>
            <span>Texte</span>
          </button>
          <button
            type="button"
            className="palette-item tool"
            disabled={disabled}
            data-ui="zone"
            title="Ajouter une zone colorée (pour regrouper des équipements)"
            onClick={() => {
              session.addNote('zone');
            }}
          >
            <svg width="30" height="30" viewBox="0 0 40 40" aria-hidden className="tool-icon">
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
          Échap ou clic droit pour annuler.
        </p>
      )}
    </aside>
  );
}
