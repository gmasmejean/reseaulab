import { useId, useState } from 'react';
import {
  buildActivity,
  emptyDraft,
  EMPTY_STEP,
  type Draft,
  type DraftStep,
} from '../../learn/activity/draft';
import { evaluateAll, gateSteps } from '../../learn/activity/evaluate';
import { EMPTY_WORK, familyOf, objectivesOf } from '../../learn/activity/schema';
import {
  START_LABEL,
  startingNetwork,
  suggestObjectives,
  type StartMode,
  type Suggestion,
} from '../../learn/activity/suggest';
import { LEVELS, type Level } from '../../learn/content/types';
import { useSession } from '../context';
import { downloadText } from '../files';

const sameCheck = (a: Suggestion, b: Suggestion) => JSON.stringify(a.check) === JSON.stringify(b.check);

interface Verdict {
  /** Objectives the current network (the solution) reaches, among those that can be checked now. */
  readonly solved: number;
  readonly checkable: number;
  /** Objectives already reached on the starting network: pupils would have nothing to do. */
  readonly given: readonly string[];
  /** Objectives the solution misses. */
  readonly missed: readonly string[];
}

/**
 * « Créer une activité » : the teacher builds the solution on the plan, picks
 * objectives proposed from it, writes the steps, and gets a file to hand out.
 */
export function AuthorWindow() {
  const session = useSession();
  const id = useId();
  const draft = session.authorDraft ?? emptyDraft();
  const [picking, setPicking] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [embedPack, setEmbedPack] = useState(true);
  const change = (patch: Partial<Draft>) => {
    setVerdict(null);
    setError(null);
    session.setAuthorDraft({ ...draft, ...patch });
  };
  const changeStep = (index: number, patch: Partial<DraftStep>) => {
    change({ steps: draft.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) });
  };
  const used = draft.steps.flatMap((s) => s.objectives);
  const proposals =
    picking === null
      ? []
      : suggestObjectives(session.network).filter((p) => !used.some((u) => sameCheck(u, p)));
  const notions = session.pack.notions.filter((n) => n.category !== 'guide');

  const verify = () => {
    const built = buildActivity(draft);
    if ('error' in built) {
      setError(built.error);
      setVerdict(null);
      return;
    }
    setError(null);
    const { activity } = built;
    const now = evaluateAll(activity, session.network, EMPTY_WORK);
    const start = gateSteps(
      activity,
      evaluateAll(activity, startingNetwork(session.network, draft.start), EMPTY_WORK),
    );
    const checkable = objectivesOf(activity).filter((o) => familyOf(o.check) !== 'journal');
    setVerdict({
      checkable: checkable.length,
      solved: checkable.filter((o) => now.get(o.id)?.status === 'done').length,
      missed: checkable.filter((o) => now.get(o.id)?.status !== 'done').map((o) => o.label),
      given: checkable.filter((o) => start.get(o.id)?.status === 'done').map((o) => o.label),
    });
  };

  return (
    <div className="author">
      <p className="muted">
        Construisez d’abord sur le plan le réseau <b>terminé</b> (la solution). Les objectifs sont proposés à
        partir de lui ; le réseau de départ des élèves en est déduit. Rien de la solution n’est écrit dans le
        fichier, sauf ce que vous laissez au départ.
      </p>
      <div className="author-head">
        <div className="field">
          <label htmlFor={`${id}-title`}>Titre de l’activité</label>
          <input
            id={`${id}-title`}
            value={draft.title}
            maxLength={120}
            onChange={(e) => {
              change({ title: e.target.value });
            }}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-level`}>Niveau</label>
          <select
            id={`${id}-level`}
            value={draft.level}
            onChange={(e) => {
              change({ level: e.target.value as Level });
            }}
          >
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-duration`}>Durée (min)</label>
          <input
            id={`${id}-duration`}
            inputMode="numeric"
            value={draft.duration}
            onChange={(e) => {
              change({ duration: e.target.value });
            }}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-intro`}>Consigne générale (la situation, ce qui est attendu)</label>
        <textarea
          id={`${id}-intro`}
          rows={3}
          value={draft.intro}
          aria-describedby={`${id}-format`}
          onChange={(e) => {
            change({ intro: e.target.value });
          }}
        />
        <span className="field-hint" id={`${id}-format`}>
          Mise en forme : **gras**, *italique*, `code`, une ligne vide entre deux paragraphes, « - » en début
          de ligne pour une liste, [[passerelle]] pour un lien vers une fiche.
        </span>
      </div>
      <fieldset className="radio-group">
        <legend className="label">Réseau de départ des élèves</legend>
        {(Object.keys(START_LABEL) as StartMode[]).map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name={`${id}-start`}
              checked={draft.start === mode}
              onChange={() => {
                change({ start: mode });
              }}
            />
            {START_LABEL[mode]}
          </label>
        ))}
      </fieldset>

      <ol className="author-steps">
        {draft.steps.map((step, index) => (
          <li key={index} aria-label={`Étape ${index + 1}`}>
            <div className="author-step-head">
              <div className="field">
                <label htmlFor={`${id}-step-${index}`}>Étape {index + 1} : titre</label>
                <input
                  id={`${id}-step-${index}`}
                  value={step.title}
                  maxLength={120}
                  onChange={(e) => {
                    changeStep(index, { title: e.target.value });
                  }}
                />
              </div>
              <button
                type="button"
                className="danger"
                disabled={draft.steps.length === 1}
                aria-label={`Supprimer l’étape ${index + 1}`}
                onClick={() => {
                  change({ steps: draft.steps.filter((_, i) => i !== index) });
                }}
              >
                Supprimer
              </button>
            </div>
            <div className="field">
              <label htmlFor={`${id}-body-${index}`}>Consigne de l’étape</label>
              <textarea
                id={`${id}-body-${index}`}
                rows={2}
                value={step.body}
                onChange={(e) => {
                  changeStep(index, { body: e.target.value });
                }}
              />
            </div>
            <div className="author-step-extra">
              <div className="field">
                <label htmlFor={`${id}-hints-${index}`}>Indices (un par ligne)</label>
                <textarea
                  id={`${id}-hints-${index}`}
                  rows={2}
                  value={step.hints}
                  onChange={(e) => {
                    changeStep(index, { hints: e.target.value });
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor={`${id}-notion-${index}`}>Fiches à lire</label>
                <select
                  id={`${id}-notion-${index}`}
                  value=""
                  onChange={(e) => {
                    const notion = e.target.value;
                    if (notion !== '' && !step.notions.includes(notion)) {
                      changeStep(index, { notions: [...step.notions, notion] });
                    }
                  }}
                >
                  <option value="">Ajouter une fiche…</option>
                  {notions.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
                <span className="chips">
                  {step.notions.map((notion) => (
                    <button
                      key={notion}
                      type="button"
                      title="Retirer cette fiche"
                      onClick={() => {
                        changeStep(index, { notions: step.notions.filter((n) => n !== notion) });
                      }}
                    >
                      {session.notion(notion)?.title ?? notion} ✕
                    </button>
                  ))}
                </span>
              </div>
            </div>
            <p className="label">Objectifs vérifiés automatiquement</p>
            {step.objectives.length === 0 && <p className="muted">Aucun objectif pour cette étape.</p>}
            <ul className="author-objectives">
              {step.objectives.map((objective, o) => (
                <li key={o}>
                  <input
                    aria-label={`Étape ${index + 1}, objectif ${o + 1}`}
                    value={objective.label}
                    maxLength={300}
                    onChange={(e) => {
                      changeStep(index, {
                        objectives: step.objectives.map((x, i) =>
                          i === o ? { ...x, label: e.target.value } : x,
                        ),
                      });
                    }}
                  />
                  <button
                    type="button"
                    aria-label={`Retirer l’objectif ${o + 1} de l’étape ${index + 1}`}
                    onClick={() => {
                      changeStep(index, { objectives: step.objectives.filter((_, i) => i !== o) });
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              aria-expanded={picking === index}
              onClick={() => {
                setPicking(picking === index ? null : index);
              }}
            >
              {picking === index ? 'Fermer les propositions' : 'Choisir parmi les objectifs proposés…'}
            </button>
            {picking === index && (
              <div
                className="author-proposals"
                role="group"
                aria-label={`Objectifs proposés pour l’étape ${index + 1}`}
              >
                {proposals.length === 0 ? (
                  <p className="muted">
                    Rien à proposer : le plan est vide, ou tous les objectifs possibles sont déjà utilisés.
                  </p>
                ) : (
                  proposals.map((proposal) => (
                    <button
                      key={JSON.stringify(proposal.check)}
                      type="button"
                      title="Ajouter cet objectif à l’étape"
                      onClick={() => {
                        changeStep(index, { objectives: [...step.objectives, proposal] });
                      }}
                    >
                      + {proposal.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => {
          change({ steps: [...draft.steps, EMPTY_STEP] });
        }}
      >
        Ajouter une étape
      </button>

      <div className="author-actions">
        {session.localPackSummary && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={embedPack}
              onChange={(e) => {
                setEmbedPack(e.target.checked);
              }}
            />
            Joindre mon pack pédagogique au fichier
          </label>
        )}
        <button type="button" onClick={verify}>
          Contrôler l’activité
        </button>
        <button
          type="button"
          onClick={() => {
            setError(session.tryActivity(draft));
          }}
        >
          Essayer comme un élève
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            const file = session.activityFile(draft, embedPack);
            if ('error' in file) {
              setError(file.error);
              return;
            }
            setError(null);
            downloadText(file.fileName, file.text);
            session.notify(`Activité enregistrée dans vos téléchargements : ${file.fileName}`);
          }}
        >
          Enregistrer le fichier d’activité
        </button>
      </div>
      {error !== null && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {verdict && (
        <div className="author-verdict" role="status">
          <p>
            <b>Votre réseau (la solution)</b> atteint {verdict.solved} des {verdict.checkable} objectifs
            vérifiables sans simulation.
          </p>
          {verdict.missed.length > 0 && (
            <p className="warning">⚠ Non atteints par la solution : {verdict.missed.join(' ; ')}.</p>
          )}
          {verdict.given.length === 0 ? (
            <p>
              <b>Au départ</b>, aucun n’est déjà atteint : les élèves ont tout à faire.
            </p>
          ) : (
            <p className="warning">
              ⚠ Déjà atteints sur le réseau de départ (rien à faire pour l’élève) :{' '}
              {verdict.given.join(' ; ')}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
