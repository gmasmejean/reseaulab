import { useId, useState, type ReactNode } from 'react';
import type { Answer, QuizItem } from '../../learn/quiz/types';

/** The right answer of a question, in words. */
export function solution(item: QuizItem): string {
  switch (item.kind) {
    case 'choice':
      return item.correct.map((index) => item.choices[index] ?? '').join(' ; ');
    case 'order':
      return item.solution.join(' → ');
    case 'short':
      return item.accepted[0] ?? '';
  }
}

export interface QuestionProps {
  readonly item: QuizItem;
  /** Called once with the answer of the pupil. */
  readonly onAnswer: (answer: Answer) => void;
  readonly locked: boolean;
}

/** One question, with the control that suits its kind. */
export function QuestionForm({ item, onAnswer, locked }: QuestionProps) {
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

/** The verdict of an answer, the expected answer when wrong, the explanation, then `children` (actions). */
export function Feedback({
  item,
  right,
  children,
}: {
  item: QuizItem;
  right: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={`quiz-feedback ${right ? 'right' : 'wrong'}`} role="status">
      <p className="quiz-verdict">{right ? '✔ Bonne réponse !' : '✘ Ce n’est pas ça.'}</p>
      {!right && (
        <p>
          <b>Réponse attendue :</b> {solution(item)}
        </p>
      )}
      {item.explanation !== '' && <p>{item.explanation}</p>}
      <div className="step-actions">{children}</div>
    </div>
  );
}
