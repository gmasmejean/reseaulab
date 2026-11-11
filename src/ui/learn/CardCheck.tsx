import { useState } from 'react';
import type { Notion } from '../../learn/content/types';
import { LEVELS } from '../../learn/content/types';
import { buildQuiz, grade } from '../../learn/quiz/quiz';
import type { QuizItem } from '../../learn/quiz/types';
import { useSession } from '../context';
import { Feedback, QuestionForm } from './Question';

/** All the questions about one card, in a drawn order. */
function draw(questions: Parameters<typeof buildQuiz>[0], notion: string, seed: number): QuizItem[] {
  return buildQuiz(questions, { level: LEVELS[LEVELS.length - 1] ?? '3e', count: 50, seed, notion });
}

/**
 * « Pour vérifier » : one question about the card, asked and corrected under
 * it, without opening the quiz. « Une autre question » goes through the
 * others, then draws them again (new values, choices in another order).
 */
export function CardCheck({ notion }: { notion: Notion }) {
  const session = useSession();
  const questions = session.pack.questions;
  const [seed, setSeed] = useState(() => session.drawSeed());
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const items = draw(questions, notion.id, seed);
  const item = items[index];
  if (!item) return null;
  const another = () => {
    if (index + 1 < items.length) setIndex(index + 1);
    else {
      setSeed(seed + 1);
      setIndex(0);
    }
    setAnswered(null);
  };
  return (
    <section className="card-check" aria-label="Pour vérifier">
      <header>
        <h3>Pour vérifier</h3>
        <button
          type="button"
          className="link small"
          onClick={() => {
            session.openQuiz(notion.id);
          }}
        >
          Quiz sur cette notion
        </button>
      </header>
      <QuestionForm
        key={`${item.id}:${seed}:${index}`}
        item={item}
        locked={answered !== null}
        onAnswer={(answer) => {
          setAnswered(grade(item, answer));
        }}
      />
      {answered !== null && (
        <Feedback item={item} right={answered}>
          <button type="button" onClick={another}>
            {items.length > 1 ? 'Une autre question' : 'Recommencer'}
          </button>
        </Feedback>
      )}
    </section>
  );
}
