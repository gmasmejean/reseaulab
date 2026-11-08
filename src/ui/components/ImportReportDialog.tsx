import { useEffect, useId, useRef } from 'react';
import { useSession } from '../context';

/** Lists what could not be converted after importing a Filius file. */
export function ImportReportDialog() {
  const session = useSession();
  const report = session.importReport;
  const id = useId();
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
  }, [report]);
  if (!report) return null;
  const close = () => {
    session.dismissImportReport();
  };
  return (
    <div className="modal-backdrop">
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
      >
        <h2 id={`${id}-title`}>Projet Filius importé</h2>
        <p>
          « {report.fileName} »{report.version ? ` (Filius ${report.version})` : ''} a été importé. Quelques
          éléments n’ont pas pu être repris tels quels :
        </p>
        <ul className="report-list">
          {report.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" className="primary" ref={okRef} onClick={close}>
            Compris
          </button>
        </div>
      </div>
    </div>
  );
}
