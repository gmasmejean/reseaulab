import type { ReactNode } from 'react';
import { Host } from '../../engine/devices/host';
import { NetworkNode } from '../../engine/devices/node';
import { Router } from '../../engine/devices/router';
import { Switch } from '../../engine/devices/switch';
import type { AppId } from '../../engine/services/catalog';
import { APP_INFO } from '../../i18n/fr';
import { Window } from '../components/Window';
import { useSession } from '../context';
import type { OpenWindow } from '../session';
import { BrowserApp } from './BrowserApp';
import { EchoClientApp, FirewallApp } from './ClientApps';
import { Desktop, SoftwareInstaller } from './Desktop';
import { FileExplorerApp, ImageViewerApp, TextEditorApp } from './FileApps';
import { MailClientApp } from './MailClientApp';
import { CaptureWindow, HelpWindow, RouterWindow, SwitchWindow } from './NetworkWindows';
import { DhcpServerApp, DnsServerApp, EchoServerApp, MailServerApp, WebServerApp } from './ServerApps';
import { TerminalApp } from './TerminalApp';

const APP_SIZE: Partial<Record<AppId, [number, number]>> = {
  terminal: [700, 440],
  browser: [760, 520],
  mailclient: [720, 520],
  dnsserver: [640, 520],
  dhcpserver: [640, 560],
  mailserver: [640, 520],
  firewall: [760, 460],
};

function appBody(app: AppId, host: Host): ReactNode {
  switch (app) {
    case 'terminal':
      return <TerminalApp host={host} />;
    case 'browser':
      return <BrowserApp host={host} />;
    case 'texteditor':
      return <TextEditorApp host={host} />;
    case 'fileexplorer':
      return <FileExplorerApp host={host} />;
    case 'imageviewer':
      return <ImageViewerApp host={host} />;
    case 'mailclient':
      return <MailClientApp host={host} />;
    case 'echoclient':
      return <EchoClientApp host={host} />;
    case 'firewall':
      return <FirewallApp host={host} />;
    case 'webserver':
      return <WebServerApp host={host} />;
    case 'dnsserver':
      return <DnsServerApp host={host} />;
    case 'dhcpserver':
      return <DhcpServerApp host={host} />;
    case 'mailserver':
      return <MailServerApp host={host} />;
    case 'echoserver':
      return <EchoServerApp host={host} />;
  }
}

function WindowContent({ w }: { w: OpenWindow }) {
  const { network } = useSession();
  const spec = w.spec;
  if (spec.type === 'help') {
    return (
      <Window window={w} title="Aide" width={620} height={480}>
        <HelpWindow />
      </Window>
    );
  }
  const device = network.device(spec.deviceId);
  if (!device) return null;
  switch (spec.type) {
    case 'desktop':
      return device instanceof Host ? (
        <Window
          window={w}
          title={`Bureau de ${device.name}`}
          width={560}
          height={360}
          className="desktop-window"
        >
          <Desktop host={device} />
        </Window>
      ) : null;
    case 'app': {
      if (!(device instanceof Host)) return null;
      if (spec.app === 'software') {
        return (
          <Window window={w} title={`Installer des logiciels — ${device.name}`} width={560} height={520}>
            <SoftwareInstaller host={device} />
          </Window>
        );
      }
      const [width, height] = APP_SIZE[spec.app] ?? [600, 440];
      return (
        <Window
          window={w}
          title={`${APP_INFO[spec.app].name} — ${device.name}`}
          width={width}
          height={height}
        >
          {device.isInstalled(spec.app) ? (
            appBody(spec.app, device)
          ) : (
            <p className="muted">Logiciel désinstallé.</p>
          )}
        </Window>
      );
    }
    case 'capture':
      return device instanceof NetworkNode ? (
        <Window window={w} title={`Échanges de données — ${device.name}`} width={900} height={520}>
          <CaptureWindow key={spec.iface ?? 'all'} node={device} initialIface={spec.iface} />
        </Window>
      ) : null;
    case 'switch':
      return device instanceof Switch ? (
        <Window window={w} title={`Table des adresses MAC — ${device.name}`} width={520} height={380}>
          <SwitchWindow device={device} />
        </Window>
      ) : null;
    case 'router':
      return device instanceof Router ? (
        <Window window={w} title={`Routeur — ${device.name}`} width={680} height={460}>
          <RouterWindow router={device} />
        </Window>
      ) : null;
  }
}

export function WindowLayer() {
  const session = useSession();
  return (
    <>
      {session.windows.map((w) => (
        <WindowContent key={w.id} w={w} />
      ))}
    </>
  );
}
