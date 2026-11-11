import { AUTOSAVE_DATE_KEY, AUTOSAVE_KEY, type Storage } from '../ui/session';

const AUTOSAVE_KEYS: ReadonlySet<string> = new Set([AUTOSAVE_KEY, AUTOSAVE_DATE_KEY]);

/**
 * The browser storage without the automatic save of the work. Inside another
 * application, the work is kept by that application: the preferences of the
 * computer (cards read, width of the panel…) stay, but the work of one pupil
 * is never written here, so it can neither come back for the next pupil nor
 * compete with the copy the application keeps.
 */
export function withoutAutosave(storage: Storage | null): Storage | null {
  if (!storage) return null;
  return {
    getItem: (key) => (AUTOSAVE_KEYS.has(key) ? null : storage.getItem(key)),
    setItem: (key, value) => {
      if (!AUTOSAVE_KEYS.has(key)) storage.setItem(key, value);
    },
  };
}
