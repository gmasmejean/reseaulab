import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Session } from './session';

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** Returns the session and re-renders whenever it (or its network) changes. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession doit être utilisé dans <SessionProvider>');
  useSyncExternalStore(session.subscribe, session.getVersion);
  return session;
}

/**
 * The session, without re-rendering when it changes; null outside a provider
 * (a form control rendered alone in a test).
 */
export function useSessionHandle(): Session | null {
  return useContext(SessionContext);
}

/** Value that follows `value` but only after it stayed stable for `delay` ms. */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}
