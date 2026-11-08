import type { Host } from '../../engine/devices/host';
import { APP_IDS, type AppId } from '../../engine/services/catalog';
import { APP_INFO } from '../../i18n/fr';
import { useSession } from '../context';

export function AppBadge({ app }: { app: AppId }) {
  const info = APP_INFO[app];
  return (
    <span className="app-badge" style={{ background: info.color }} aria-hidden>
      {info.badge}
    </span>
  );
}

export function Desktop({ host }: { host: Host }) {
  const session = useSession();
  const open = (app: AppId | 'software') => {
    session.openWindow({ type: 'app', deviceId: host.id, app });
  };
  return (
    <div className="desktop">
      <div className="desktop-icons">
        {host.installed.map((app) => (
          <button
            key={app}
            type="button"
            className="desktop-icon"
            onClick={() => {
              open(app);
            }}
          >
            <AppBadge app={app} />
            <span>{APP_INFO[app].name}</span>
          </button>
        ))}
        <button
          type="button"
          className="desktop-icon"
          onClick={() => {
            open('software');
          }}
        >
          <span className="app-badge install" aria-hidden>
            +
          </span>
          <span>Installer des logiciels</span>
        </button>
        <button
          type="button"
          className="desktop-icon"
          onClick={() => {
            session.openWindow({ type: 'capture', deviceId: host.id });
          }}
        >
          <span className="app-badge capture" aria-hidden>
            ⇄
          </span>
          <span>Échanges de données</span>
        </button>
      </div>
    </div>
  );
}

export function SoftwareInstaller({ host }: { host: Host }) {
  return (
    <div className="software">
      <p className="muted">Les serveurs installés doivent être démarrés depuis leur fenêtre.</p>
      <ul className="software-list">
        {APP_IDS.map((app) => {
          const installed = host.isInstalled(app);
          return (
            <li key={app}>
              <AppBadge app={app} />
              <div>
                <strong>{APP_INFO[app].name}</strong>
                <span className="muted small">{APP_INFO[app].description}</span>
              </div>
              <button
                type="button"
                className={installed ? '' : 'primary'}
                onClick={() => {
                  if (installed) host.uninstall(app);
                  else host.install(app);
                }}
              >
                {installed ? 'Désinstaller' : 'Installer'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
