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
    name: 'Client simple',
    description: 'Envoie des lignes à un serveur TCP',
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
