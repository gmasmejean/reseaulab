import { IP_ANY, formatIp } from '../../engine/core/ipv4';
import type { Device } from '../../engine/devices/device';
import { Host } from '../../engine/devices/host';
import { NetworkNode } from '../../engine/devices/node';
import type { Note } from '../../engine/network';
import { interfaceLabel } from '../../i18n/fr';
import type { Session } from '../session';
import type { MenuEntry } from './ContextMenu';

/* Right-click menus of the plan, after those of Filius:
 * - design mode, device: Configurer / Supprimer le(s) câble(s) / Supprimer;
 * - design mode, cable: Supprimer le câble;
 * - design mode, text or zone: size, style, colour, Supprimer;
 * - simulation mode: Afficher le bureau, then the data exchanges of each
 *   interface (plus the tables of switches and routers). */

/** Colours offered by Filius for text labels. */
export const TEXT_COLORS = [
  '#000000',
  '#666666',
  '#999999',
  '#b2b2b2',
  '#ffffff',
  '#ff0000',
  '#b2a3c7',
  '#4f82bd',
  '#9cba59',
  '#948a54',
  '#943836',
  '#5e4a7a',
  '#1f4a7d',
  '#6e8738',
  '#595430',
] as const;

/** Colours offered by Filius for zones. */
export const ZONE_COLORS = [
  '#cccccc',
  '#ebebeb',
  '#ffffff',
  '#ffc9c9',
  '#fcc9a3',
  '#ffffe3',
  '#d4cfb5',
  '#ded4ff',
  '#d1e8ff',
  '#bfffdb',
  '#ccdead',
  '#e3eafc',
] as const;

/** Font sizes of Filius: Normal, Grande, Plus grande. */
export const FONT_SIZES = [
  { label: 'Normale', size: 12 },
  { label: 'Grande', size: 18 },
  { label: 'Très grande', size: 24 },
] as const;

export function deviceMenu(session: Session, device: Device, configure: () => void): MenuEntry[] {
  const net = session.network;
  if (session.mode === 'simulation') return simulationMenu(session, device);
  const cables = device.ports.flatMap((p) => (p.cable ? [p.cable.id] : []));
  const singlePort = device instanceof Host;
  const wifi = singlePort && device.wifi;
  return [
    { kind: 'action', label: 'Configurer', onSelect: configure },
    {
      kind: 'action',
      label: wifi ? 'Déconnecter le Wi-Fi' : singlePort ? 'Supprimer le câble' : 'Supprimer tous les câbles',
      disabled: cables.length === 0,
      onSelect: () => {
        for (const id of cables) net.disconnect(id);
      },
    },
    {
      kind: 'action',
      label: 'Supprimer',
      danger: true,
      onSelect: () => {
        session.select({ kind: 'device', id: device.id });
        session.deleteSelection();
      },
    },
  ];
}

function simulationMenu(session: Session, device: Device): MenuEntry[] {
  const entries: MenuEntry[] = [];
  const open = (spec: Parameters<Session['openWindow']>[0]) => () => {
    session.select({ kind: 'device', id: device.id });
    session.openWindow(spec);
  };
  if (device instanceof Host) {
    entries.push({
      kind: 'action',
      label: 'Afficher le bureau',
      onSelect: open({ type: 'desktop', deviceId: device.id }),
    });
  } else if (device.kind === 'switch') {
    if (session.can('feature:mac-table'))
      entries.push({
        kind: 'action',
        label: 'Afficher la table des adresses MAC',
        onSelect: open({ type: 'switch', deviceId: device.id }),
      });
  } else if (
    session.can('feature:tables') ||
    // The addresses a box hands out are of interest before routing tables are.
    (device.kind === 'box' && session.can('feature:mac-table'))
  ) {
    entries.push({
      kind: 'action',
      label: device.kind === 'box' ? 'Afficher les tables de la box' : 'Afficher les tables du routeur',
      onSelect: open({ type: 'router', deviceId: device.id }),
    });
  }
  if (device instanceof NetworkNode && session.can('feature:capture')) {
    device.stack.interfaces.forEach((iface, index) => {
      const address = iface.ip === IP_ANY ? 'sans adresse' : formatIp(iface.ip);
      const name = device instanceof Host ? address : `${interfaceLabel(device.kind, index)} – ${address}`;
      entries.push({
        kind: 'action',
        label: `Afficher les échanges de données (${name})`,
        onSelect: open({
          type: 'capture',
          deviceId: device.id,
          ...(device instanceof Host ? {} : { iface: index }),
        }),
      });
    });
  }
  return entries;
}

export function cableMenu(session: Session, cableId: string): MenuEntry[] {
  if (session.mode === 'simulation') return [];
  return [
    {
      kind: 'action',
      label: session.network.cable(cableId)?.wireless ? 'Déconnecter le Wi-Fi' : 'Supprimer le câble',
      danger: true,
      onSelect: () => {
        session.network.disconnect(cableId);
        if (session.selection?.kind === 'cable' && session.selection.id === cableId) session.select(null);
      },
    },
  ];
}

export function noteMenu(session: Session, note: Note): MenuEntry[] {
  if (session.mode === 'simulation') return [];
  const net = session.network;
  const update = (patch: Parameters<typeof net.updateNote>[1]) => () => {
    net.updateNote(note.id, patch);
  };
  const remove: MenuEntry[] = [
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Supprimer',
      danger: true,
      onSelect: () => {
        session.select({ kind: 'note', id: note.id });
        session.deleteSelection();
      },
    },
  ];
  if (note.kind === 'zone') {
    return [
      {
        kind: 'colors',
        label: 'Couleur',
        colors: ZONE_COLORS,
        value: note.color,
        onSelect: (color) => {
          net.updateNote(note.id, { color });
        },
      },
      ...remove,
    ];
  }
  return [
    { kind: 'heading', label: 'Taille du texte' },
    ...FONT_SIZES.map(({ label, size }): MenuEntry => ({
      kind: 'radio',
      label,
      checked: note.fontSize === size,
      onSelect: update({ fontSize: size }),
    })),
    { kind: 'separator' },
    { kind: 'heading', label: 'Style du texte' },
    {
      kind: 'radio',
      label: 'Normal',
      checked: !note.bold && !note.italic,
      onSelect: update({ bold: false, italic: false }),
    },
    {
      kind: 'radio',
      label: 'Italique',
      checked: !note.bold && note.italic,
      onSelect: update({ bold: false, italic: true }),
    },
    {
      kind: 'radio',
      label: 'Gras',
      checked: note.bold && !note.italic,
      onSelect: update({ bold: true, italic: false }),
    },
    { kind: 'separator' },
    {
      kind: 'colors',
      label: 'Couleur',
      colors: TEXT_COLORS,
      value: note.color,
      onSelect: (color) => {
        net.updateNote(note.id, { color });
      },
    },
    ...remove,
  ];
}
