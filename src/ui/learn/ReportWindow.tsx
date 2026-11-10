import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '../context';
import { Report } from './Report';

/**
 * « Compte rendu » : the pupil writes their name and what they learnt, checks
 * the report, then prints it (or saves it as a PDF from the print dialog).
 */
export function ReportWindow() {
  const session = useSession();
  const id = useId();
  // The date written on the report is the one of its opening: stable while it is being read.
  const [openedAt] = useState(() => Date.now());
  const { student, conclusion } = session.work;
  return (
    <div className="report-window">
      <div className="report-form">
        <div className="field">
          <label htmlFor={`${id}-name`}>Nom et prénom</label>
          <input
            id={`${id}-name`}
            value={student.name}
            maxLength={80}
            autoComplete="off"
            onChange={(e) => {
              session.setStudent(e.target.value, student.className);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-class`}>Classe</label>
          <input
            id={`${id}-class`}
            value={student.className}
            maxLength={40}
            autoComplete="off"
            onChange={(e) => {
              session.setStudent(student.name, e.target.value);
            }}
          />
        </div>
        <div className="field report-conclusion-field">
          <label htmlFor={`${id}-conclusion`}>Ce que j’ai appris (quelques phrases)</label>
          <textarea
            id={`${id}-conclusion`}
            rows={3}
            value={conclusion}
            maxLength={4000}
            onChange={(e) => {
              session.setConclusion(e.target.value);
            }}
          />
        </div>
        <button
          type="button"
          className="primary"
          title="Ouvre la fenêtre d’impression du navigateur ; choisissez « Enregistrer au format PDF » pour un fichier"
          onClick={() => {
            window.print();
          }}
        >
          Imprimer ou enregistrer en PDF
        </button>
      </div>
      <div className="report-preview" aria-label="Aperçu du compte rendu">
        <Report printedAt={openedAt} />
      </div>
      {/* The copy that is printed: alone on the page, outside the window and its scroll bars. */}
      {createPortal(
        <div className="print-root">
          <Report printedAt={openedAt} />
        </div>,
        document.body,
      )}
    </div>
  );
}
