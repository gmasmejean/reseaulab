import { useState } from 'react';
import { LEVELS, type Level } from '../../learn/content/types';
import { buildQuiz, grade, summarize } from '../../learn/quiz/quiz';
import type { QuizItem, QuizResult } from '../../learn/quiz/types';
import { useSession } from '../context';
import { Feedback, QuestionForm } from './Question';

const QUESTIONS = 8;
const LEVEL_LABEL: Record<Level, string> = { '5e': 'Niveau 5e', '4e': 'Jusqu’en 4e', '3e': 'Jusqu’en 3e' };

/**
 * « Quiz » : a few questions drawn from the pack, corrected at once with an
 * explanation, then a summary by notion that sends back to the cards.
 */
export function QuizWindow({ notion: about }: { notion?: string | undefined }) {
  const session = useSession();
  const base = session.profile.base;
  const [level, setLevel] = useState<Level>(base === 'complet' ? '3e' : base);
  const [items, setItems] = useState<readonly QuizItem[] | null>(null);
  /** Counts the quizzes started, so that each one begins afresh. */
  const [round, setRound] = useState(0);
  const subject = about === undefined ? undefined : session.notion(about);
  const available = buildQuiz(session.pack.questions, {
    level,
    count: QUESTIONS,
    seed: 1,
    notion: subject?.id,
  });

  const start = () => {
    // The clock gives the draw: another quiz each time.
    setItems(
      buildQuiz(session.pack.questions, { level, count: QUESTIONS, seed: Date.now(), notion: subject?.id }),
    );
    setRound(round + 1);
  };

  if (items === null) {
    return (
      <div className="quiz">
        <h2>{subject ? `Quiz : ${subject.title}` : 'Quiz d’entraînement'}</h2>
        <p>
          Quelques questions pour vérifier ce que tu sais. Chaque réponse est corrigée tout de suite, avec une
          explication. Ce n’est pas noté : tu peux recommencer autant de fois que tu veux.
        </p>
        <div className="field">
          <label htmlFor="quiz-level">Questions</label>
          <select
            id="quiz-level"
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as Level);
            }}
          >
            {LEVELS.map((value) => (
              <option key={value} value={value}>
                {LEVEL_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        {available.length === 0 ? (
          <p className="muted">Aucune question à ce niveau pour ce sujet.</p>
        ) : (
          <button type="button" className="primary" onClick={start}>
            Commencer ({available.length} question{available.length > 1 ? 's' : ''})
          </button>
        )}
      </div>
    );
  }

  return (
    <QuizRun
      key={round}
      items={items}
      onRestart={start}
      onDone={(right) => {
        session.recordQuiz(right, items.length);
      }}
    />
  );
}

interface RunProps {
  readonly items: readonly QuizItem[];
  readonly onRestart: () => void;
  readonly onDone: (right: number) => void;
}

/** The questions one after the other, then the summary. */
function QuizRun({ items, onRestart, onDone }: RunProps) {
  const session = useSession();
  const [results, setResults] = useState<readonly QuizResult[]>([]);
  /** True between the answer to a question and the click on « next ». */
  const [reviewing, setReviewing] = useState(false);
  const position = reviewing ? results.length - 1 : results.length;
  const item = items[position];
  const right = results.filter((r) => r.right).length;

  if (!item) {
    const summary = summarize(results);
    return (
      <div className="quiz">
        <h2>
          Bilan : {right} bonne{right > 1 ? 's' : ''} réponse{right > 1 ? 's' : ''} sur {items.length}
        </h2>
        <table className="table quiz-summary">
          <thead>
            <tr>
              <th>Notion</th>
              <th>Réponses justes</th>
              <th>Bilan</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {summary.map((score) => {
              const notion = session.notion(score.notion);
              return (
                <tr
                  key={score.notion}
                  className={`mastery-${score.mastery === 'acquis' ? 'ok' : score.mastery === 'en cours' ? 'partial' : 'low'}`}
                >
                  <td>{notion?.title ?? score.notion}</td>
                  <td>
                    {score.right} sur {score.asked}
                  </td>
                  <td>{score.mastery}</td>
                  <td>
                    {notion && score.mastery !== 'acquis' && (
                      <button
                        type="button"
                        className="link"
                        onClick={() => {
                          session.openKnowledge(notion.id);
                        }}
                      >
                        Revoir la fiche
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button" className="primary" onClick={onRestart}>
          Recommencer avec d’autres questions
        </button>
      </div>
    );
  }

  const last = reviewing ? results.at(-1) : undefined;
  const notion = session.notion(item.notion);
  return (
    <div className="quiz">
      <p className="muted" role="status">
        Question {position + 1} sur {items.length}
      </p>
      <QuestionForm
        key={`${item.id}:${position}`}
        item={item}
        locked={reviewing}
        onAnswer={(answer) => {
          const next = [...results, { item, right: grade(item, answer) }];
          setResults(next);
          setReviewing(true);
          if (next.length === items.length) onDone(next.filter((r) => r.right).length);
        }}
      />
      {last && (
        <Feedback item={item} right={last.right}>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setReviewing(false);
            }}
          >
            {results.length === items.length ? 'Voir le bilan' : 'Question suivante'}
          </button>
          {notion && (
            <button
              type="button"
              className="link"
              onClick={() => {
                session.openKnowledge(notion.id);
              }}
            >
              Fiche : {notion.title}
            </button>
          )}
        </Feedback>
      )}
    </div>
  );
}
