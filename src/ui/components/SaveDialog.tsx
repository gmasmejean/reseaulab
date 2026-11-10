import { useEffect, useId, useRef, useState } from 'react';
import { PROJECT_EXTENSION, projectBaseName } from '../session';

interface Props {
  /** Current file name, with its extension. */
  readonly fileName: string;
  /** Receives the chosen name, without extension. */
  readonly onSave: (name: string) => void;
  readonly onCancel: () => void;
}

/**
 * Asks for the name of the project file before downloading it, so that pupils
 * can hand in a file that bears their name.
 */
export function SaveDialog({ fileName, onSave, onCancel }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(() => projectBaseName(fileName));
  useEffect(() => {
    inputRef.current?.select();
  }, []);
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <h2 id={`${id}-title`}>Enregistrer le projet</h2>
        <div className="field">
          <label htmlFor={`${id}-name`}>Nom du fichier</label>
          <div className="file-name">
            <input
              id={`${id}-name`}
              ref={inputRef}
              value={name}
              maxLength={80}
              spellCheck={false}
              autoComplete="off"
              aria-describedby={`${id}-hint`}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
            <span className="muted">{PROJECT_EXTENSION}</span>
          </div>
          <span className="field-hint" id={`${id}-hint`}>
            Par exemple votre nom et celui de l’activité. Le fichier est placé dans les téléchargements du
            navigateur.
          </span>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" className="primary">
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
