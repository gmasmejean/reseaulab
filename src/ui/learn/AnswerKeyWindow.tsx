import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BUILTIN_ACTIVITIES } from '../../learn/activity/builtin';
import { useSession } from '../context';
import { AnswerKey, type Audience } from './AnswerKey';

/** Marks the body while the answer key is printed, so that it goes alone (see styles.css). */
const PRINTING = 'answers';

const VERSIONS: readonly (readonly [Audience, string, string])[] = [
  [
    'teacher',
    'Professeur',
    'Version complète : déroulement, consignes, indices et réponses. Chaque partie commence une page.',
  ],
  [
    'pupils',
    'Élèves',
    'La correction seule, à distribuer : ce qu’il fallait faire, les réponses et leur explication.',
  ],
];

/** Prints the answer key alone; `title` names the PDF file the browser proposes. */
function print(title: string) {
  const before = document.title;
  document.body.dataset.print = PRINTING;
  document.title = title;
  window.addEventListener(
    'afterprint',
    () => {
      delete document.body.dataset.print;
      document.title = before;
    },
    { once: true },
  );
  window.print();
}

/**
 * « Corrigé » : the answer key of an activity, for the teacher (`?prof` in the
 * address). Of the activity shipped with RéseauLab that `builtin` names, or
 * of the activity being done. The teacher chooses what is shown and printed:
 * the whole key, or the correction to hand out to the pupils.
 */
export function AnswerKeyWindow({ builtin }: { builtin?: string | undefined }) {
  const session = useSession();
  const [audience, setAudience] = useState<Audience>('teacher');
  const shipped = useMemo(
    () => BUILTIN_ACTIVITIES.find((activity) => activity.id === builtin)?.build() ?? null,
    [builtin],
  );
  const activity = builtin === undefined ? session.activity : (shipped?.activity ?? null);
  if (!session.teacher) return null;
  if (!activity) {
    return (
      <p className="muted answer-key-empty">
        Aucune activité en cours : ouvrez une activité, ou demandez son corrigé depuis la liste des activités.
      </p>
    );
  }
  const key = (
    <AnswerKey
      activity={activity}
      audience={audience}
      network={builtin === undefined ? session.network : (shipped?.network ?? null)}
      planCaption={
        builtin === undefined
          ? 'Le réseau tel qu’il est en ce moment sur le plan.'
          : 'Le réseau de départ, tel que les élèves le reçoivent : les pannes y sont encore.'
      }
    />
  );
  const [, , about] = VERSIONS.find(([value]) => value === audience) ?? VERSIONS[0] ?? [];
  return (
    <div className="report-window">
      <div className="answer-key-bar">
        <div className="segmented" role="group" aria-label="Version du corrigé">
          {VERSIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={audience === value}
              onClick={() => {
                setAudience(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="muted">{about}</p>
        <button
          type="button"
          className="primary"
          title="Ouvre la fenêtre d’impression du navigateur ; choisissez « Enregistrer au format PDF » pour un fichier"
          onClick={() => {
            print(`${audience === 'teacher' ? 'Corrigé' : 'Correction'} — ${activity.title}`);
          }}
        >
          Imprimer ou enregistrer en PDF
        </button>
      </div>
      <div className="report-preview" aria-label="Aperçu du corrigé">
        {key}
      </div>
      {/* The copy that is printed: alone on the page, outside the window and its scroll bars. */}
      {createPortal(<div className="print-root print-answers">{key}</div>, document.body)}
    </div>
  );
}
