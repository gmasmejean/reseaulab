import { useId, useState } from 'react';
import { LEVELS, type Level } from '../../learn/content/types';
import { buildQuiz, grade, summarize } from '../../learn/quiz/quiz';
import type { Answer, QuizItem, QuizResult } from '../../learn/quiz/types';
import { useSession } from '../context';

const QUESTIONS = 8;
const LEVEL_LABEL: Record<Level, string> = { '5e': 'Niveau 5e', '4e': 'Jusqu’en 4e', '3e': 'Jusqu’en 3e' };

/** The right answer of a question, in words. */
function solution(item: QuizItem): string {
  switch (item.kind) {
    case 'choice':
      return item.correct.map((index) => item.choices[index] ?? '').join(' ; ');
    case 'order':
      return item.solution.join(' → ');
    case 'short':
      return item.accepted[0] ?? '';
  }
}

interface QuestionProps {
  readonly item: QuizItem;
  /** Called once with the answer of the pupil. */
  readonly onAnswer: (answer: Answer) => void;
  readonly locked: boolean;
}

/** One question, with the control that suits its kind. */
function QuestionForm({ item, onAnswer, locked }: QuestionProps) {
  const id = useId();
  const [chosen, setChosen] = useState<readonly number[]>([]);
  const [sequence, setSequence] = useState<readonly string[]>(item.kind === 'order' ? item.shuffled : []);
  const [text, setText] = useState('');
  const several = item.kind === 'choice' && item.correct.length > 1;
  const ready =
    item.kind === 'choice' ? chosen.length > 0 : item.kind === 'short' ? text.trim() !== '' : true;
  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= sequence.length) return;
    const next = [...sequence];
    [next[index], next[target]] = [next[target] ?? '', next[index] ?? ''];
    setSequence(next);
  };
  return (
    <form
      className="quiz-question"
      onSubmit={(e) => {
        e.preventDefault();
        if (locked || !ready) return;
        onAnswer(item.kind === 'choice' ? chosen : item.kind === 'order' ? sequence : text);
      }}
    >
      <p className="quiz-prompt" id={`${id}-prompt`}>
        {item.prompt}
      </p>
      {item.kind === 'choice' && (
        <div
          className="quiz-choices"
          role={several ? 'group' : 'radiogroup'}
          aria-labelledby={`${id}-prompt`}
        >
          {item.choices.map((choice, index) => (
            <label key={choice} className={chosen.includes(index) ? 'chosen' : ''}>
              <input
                type={several ? 'checkbox' : 'radio'}
                name={`${id}-choice`}
                checked={chosen.includes(index)}
                disabled={locked}
                onChange={() => {
                  if (!several) setChosen([index]);
                  else
                    setChosen(
                      chosen.includes(index) ? chosen.filter((c) => c !== index) : [...chosen, index],
                    );
                }}
              />
              {choice}
            </label>
          ))}
        </div>
      )}
      {item.kind === 'order' && (
        <ol className="quiz-order" aria-labelledby={`${id}-prompt`}>
          {sequence.map((entry, index) => (
            <li key={entry}>
              <span>{entry}</span>
              <button
                type="button"
                aria-label={`Monter : ${entry}`}
                disabled={locked || index === 0}
                onClick={() => {
                  move(index, -1);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Descendre : ${entry}`}
                disabled={locked || index === sequence.length - 1}
                onClick={() => {
                  move(index, 1);
                }}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
      )}
      {item.kind === 'short' && (
        <input
          aria-labelledby={`${id}-prompt`}
          value={text}
          disabled={locked}
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
      )}
      {!locked && (
        <button type="submit" className="primary" disabled={!ready}>
          Valider
        </button>
      )}
    </form>
  );
}

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
        <div className={`quiz-feedback ${last.right ? 'right' : 'wrong'}`} role="status">
          <p className="quiz-verdict">{last.right ? '✔ Bonne réponse !' : '✘ Ce n’est pas ça.'}</p>
          {!last.right && (
            <p>
              <b>Réponse attendue :</b> {solution(item)}
            </p>
          )}
          {item.explanation !== '' && <p>{item.explanation}</p>}
          <div className="step-actions">
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
          </div>
        </div>
      )}
    </div>
  );
}
