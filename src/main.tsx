import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, browserStorage } from './ui/App';
import { isEmbedded, startEmbed, windowHost } from './embed/bridge';
import { withoutAutosave } from './embed/storage';
import { Session } from './ui/session';
import './ui/styles.css';

/** Inside another application (`?integre`), the work comes from it and goes back to it. */
function embeddedSession(): Session | undefined {
  if (!isEmbedded(window.location.search)) return undefined;
  const session = new Session(withoutAutosave(browserStorage()));
  startEmbed(session, windowHost(window));
  return session;
}

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');
createRoot(root).render(
  <StrictMode>
    <App session={embeddedSession()} />
  </StrictMode>,
);
