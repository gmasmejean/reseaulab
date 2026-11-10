import type { DeviceKind } from '../engine/devices/device';
import type { AppId } from '../engine/services/catalog';

/** Shared user-interface vocabulary (French). */
export const DEVICE_LABEL: Record<DeviceKind, string> = {
  computer: 'Ordinateur',
  laptop: 'Portable',
  switch: 'Switch',
  router: 'Routeur',
};

export interface AppInfo {
  readonly name: string;
  readonly description: string;
  /** Short badge shown on the desktop icon. */
  readonly badge: string;
  readonly color: string;
}

export const APP_INFO: Record<AppId, AppInfo> = {
  terminal: {
    name: 'Ligne de commande',
    description: 'ipconfig, ping, traceroute…',
    badge: '>_',
    color: '#1f2937',
  },
  browser: {
    name: 'Navigateur web',
    description: 'Affiche des pages web (HTTP)',
    badge: 'www',
    color: '#2563eb',
  },
  texteditor: {
    name: 'Éditeur de texte',
    description: 'Crée et modifie des fichiers',
    badge: 'Txt',
    color: '#0f766e',
  },
  fileexplorer: {
    name: 'Explorateur de fichiers',
    description: 'Gère les fichiers du poste',
    badge: 'Dos',
    color: '#a16207',
  },
  imageviewer: {
    name: 'Visionneuse d’images',
    description: 'Affiche les images du poste',
    badge: 'Img',
    color: '#9333ea',
  },
  mailclient: {
    name: 'Messagerie',
    description: 'Envoie et reçoit des courriels',
    badge: '@',
    color: '#db2777',
  },
  echoclient: {
    name: 'Client écho',
    description: 'Envoie des lignes de texte à un serveur écho',
    badge: 'Cli',
    color: '#4b5563',
  },
  firewall: {
    name: 'Pare-feu',
    description: 'Filtre les connexions entrantes',
    badge: 'FW',
    color: '#b91c1c',
  },
  webserver: {
    name: 'Serveur web',
    description: 'Publie /webserver (port 80)',
    badge: 'Web',
    color: '#1d4ed8',
  },
  dnsserver: {
    name: 'Serveur DNS',
    description: 'Associe noms et adresses (port 53)',
    badge: 'DNS',
    color: '#047857',
  },
  dhcpserver: {
    name: 'Serveur DHCP',
    description: 'Distribue des adresses IP (port 67)',
    badge: 'DHCP',
    color: '#7c3aed',
  },
  mailserver: {
    name: 'Serveur de messagerie',
    description: 'SMTP (25) et POP3 (110)',
    badge: 'Mail',
    color: '#be185d',
  },
  echoserver: {
    name: 'Serveur écho',
    description: 'Renvoie chaque ligne reçue',
    badge: 'Écho',
    color: '#374151',
  },
};

export const MODE_LABEL = { design: 'Conception', simulation: 'Simulation' } as const;

/** Other name of an equipment, for the tooltips: the curriculum says « commutateur ». */
export const DEVICE_ALIAS: Partial<Record<DeviceKind, string>> = { switch: 'commutateur' };

/** Number with a fixed count of decimals and the French decimal comma: 0,25. */
export function decimal(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

/** Simulation speed as shown to the pupil: « × 0,25 ». */
export function speedLabel(speed: number): string {
  return `× ${String(speed).replace('.', ',')}`;
}

/** Day and time of a save: « le 10/11 à 09:42 ». */
export function savedAtLabel(time: number): string {
  const date = new Date(time);
  const two = (n: number) => String(n).padStart(2, '0');
  return `le ${two(date.getDate())}/${two(date.getMonth() + 1)} à ${two(date.getHours())}:${two(date.getMinutes())}`;
}
