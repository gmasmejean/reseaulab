import { useEffect, useMemo } from 'react';
import { ImportReportDialog } from './components/ImportReportDialog';
import { Canvas } from './components/Canvas';
import { Palette } from './components/Palette';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Toolbar } from './components/Toolbar';
import { SessionProvider, useSession } from './context';
import { Session } from './session';
import { WindowLayer } from './windows/WindowLayer';

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function Notice() {
  const session = useSession();
  const notice = session.notice;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => {
        session.dismissNotice();
      },
      notice.kind === 'error' ? 6000 : 4000,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [notice, session]);
  if (!notice) return null;
  return (
    <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      {notice.text}
      <button
        type="button"
        aria-label="Fermer le message"
        onClick={() => {
          session.dismissNotice();
        }}
      >
        ✕
      </button>
    </div>
  );
}

function Shortcuts() {
  const session = useSession();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || (e.target instanceof HTMLElement && e.target.closest('.window'))) return;
      if (e.key === 'Delete' || e.key === 'Backspace') session.deleteSelection();
      if (e.key === 'Escape') {
        if (session.tool === 'cable') session.setTool('select');
        else session.select(null);
      }
    };
    const onUnload = () => {
      session.saveNow();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [session]);
  return null;
}

function Layout() {
  const session = useSession();
  return (
    <div className={`app mode-${session.mode}`}>
      <Toolbar />
      <div className="workspace">
        <Palette />
        <main className="stage">
          <Canvas />
          <WindowLayer />
        </main>
      </div>
      <footer className="panel">
        <PropertiesPanel />
      </footer>
      <Notice />
      <ImportReportDialog />
      <Shortcuts />
    </div>
  );
}

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App({ session }: { session?: Session }) {
  const value = useMemo(() => session ?? new Session(browserStorage()), [session]);
  return (
    <SessionProvider session={value}>
      <Layout />
    </SessionProvider>
  );
}
