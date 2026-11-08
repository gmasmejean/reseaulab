/** Software that can be installed on a computer ("installation de logiciels"). */
export const APP_IDS = [
  'terminal',
  'browser',
  'texteditor',
  'fileexplorer',
  'imageviewer',
  'mailclient',
  'echoclient',
  'firewall',
  'webserver',
  'dnsserver',
  'dhcpserver',
  'mailserver',
  'echoserver',
] as const;

export type AppId = (typeof APP_IDS)[number];

export function isAppId(value: string): value is AppId {
  return (APP_IDS as readonly string[]).includes(value);
}
