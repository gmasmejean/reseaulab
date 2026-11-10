import type { ReactNode } from 'react';
import { Host } from '../../engine/devices/host';
import { NetworkNode } from '../../engine/devices/node';
import { Router } from '../../engine/devices/router';
import { Switch } from '../../engine/devices/switch';
import type { AppId } from '../../engine/services/catalog';
import { APP_INFO } from '../../i18n/fr';
import { Window } from '../components/Window';
import { useSession } from '../context';
import { DiagnoseWindow } from '../learn/DiagnoseWindow';
import { KnowledgeWindow } from '../learn/KnowledgeWindow';
import { SettingsWindow } from '../learn/SettingsWindow';
import type { OpenWindow } from '../session';
import { BrowserApp } from './BrowserApp';
import { EchoClientApp, FirewallApp } from './ClientApps';
import { Desktop, SoftwareInstaller } from './Desktop';
import { FileExplorerApp, ImageViewerApp, TextEditorApp } from './FileApps';
import { MailClientApp } from './MailClientApp';
import { CaptureWindow, SwitchWindow, TablesWindow } from './NetworkWindows';
import { DhcpServerApp, DnsServerApp, EchoServerApp, MailServerApp, WebServerApp } from './ServerApps';
import { TerminalApp } from './TerminalApp';

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
      <Window window={w} title="Aide et connaissances">
        {/* Asking for another card opens it, whatever was being read. */}
        <KnowledgeWindow key={`${spec.notion ?? ''}@${spec.at ?? 0}`} notion={spec.notion} />
      </Window>
    );
  }
  if (spec.type === 'diagnose') {
    return (
      <Window window={w} title="Vérifier mon réseau">
        {/* A new request (another ping failed) starts a new test. */}
        <DiagnoseWindow
          key={`${spec.from ?? ''}>${spec.to ?? ''}@${spec.at ?? 0}`}
          from={spec.from}
          to={spec.to}
        />
      </Window>
    );
  }
  if (spec.type === 'settings') {
    return (
      <Window window={w} title="Réglages">
        <SettingsWindow />
      </Window>
    );
  }
  const device = network.device(spec.deviceId);
  if (!device) return null;
  switch (spec.type) {
    case 'desktop':
      return device instanceof Host ? (
        <Window window={w} title={`Bureau de ${device.name}`} className="desktop-window">
          <Desktop host={device} />
        </Window>
      ) : null;
    case 'app': {
      if (!(device instanceof Host)) return null;
      if (spec.app === 'software') {
        return (
          <Window window={w} title={`Installer des logiciels — ${device.name}`}>
            <SoftwareInstaller host={device} />
          </Window>
        );
      }
      return (
        <Window window={w} title={`${APP_INFO[spec.app].name} — ${device.name}`}>
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
        <Window window={w} title={`Échanges de données — ${device.name}`}>
          <CaptureWindow key={spec.iface ?? 'all'} node={device} initialIface={spec.iface} />
        </Window>
      ) : null;
    case 'switch':
      return device instanceof Switch ? (
        <Window window={w} title={`Table des adresses MAC — ${device.name}`}>
          <SwitchWindow device={device} />
        </Window>
      ) : null;
    case 'router':
      return device instanceof NetworkNode ? (
        <Window window={w} title={`${device instanceof Router ? 'Routeur' : 'Tables'} — ${device.name}`}>
          <TablesWindow node={device} />
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
