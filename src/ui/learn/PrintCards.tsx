import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORY_LABEL, type Notion } from '../../learn/content/types';
import { useSession } from '../context';
import { RichLine, RichText } from './RichText';

/** Marks the body while cards are printed, so that no other printable copy (report) goes with them. */
const PRINTING = 'cards';

/** A card as printed for the exercise book: its content, without what is clicked on screen. */
function PrintCard({ notion }: { notion: Notion }) {
  const session = useSession();
  const related = notion.related.flatMap((id) => session.notion(id)?.title ?? []);
  return (
    <article className="print-card">
      <header>
        <h2>{notion.title}</h2>
        <span className="small">
          {CATEGORY_LABEL[notion.category]}
          {notion.category !== 'guide' && ` · ${notion.level}`}
        </span>
      </header>
      <p className="notion-short">{notion.short}</p>
      {notion.remember.length > 0 && (
        <section className="notion-remember">
          <h3>À retenir</h3>
          <ul>
            {notion.remember.map((line) => (
              <li key={line}>
                <RichLine source={line} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <RichText source={notion.body} />
      {notion.image && <img className="notion-image" src={notion.image.data} alt={notion.image.alt} />}
      {notion.example !== undefined && (
        <p className="notion-example">
          <b>Exemple.</b> {notion.example}
        </p>
      )}
      {notion.mistakes && notion.mistakes.length > 0 && (
        <section className="notion-mistakes">
          <h3>Erreurs fréquentes</h3>
          <ul>
            {notion.mistakes.map((mistake) => (
              <li key={mistake.belief}>
                <p>
                  ✘ <b>On croit que</b> <RichLine source={mistake.belief} />
                </p>
                <p>
                  ✔ <b>En fait,</b> <RichLine source={mistake.truth} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {related.length > 0 && (
        <p className="small">
          <b>Voir aussi :</b> {related.join(', ')}
        </p>
      )}
      {notion.curriculum !== undefined && <p className="small">Programme : {notion.curriculum}</p>}
    </article>
  );
}

/**
 * Prints `notions` (one card, or a whole path), then calls `onDone`. The copy
 * is put alone in the page, outside the window, only while printing.
 */
export function PrintCards({ notions, onDone }: { notions: readonly Notion[]; onDone: () => void }) {
  useEffect(() => {
    document.body.dataset.print = PRINTING;
    const done = () => {
      onDone();
    };
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return () => {
      window.removeEventListener('afterprint', done);
      delete document.body.dataset.print;
    };
  }, [onDone]);
  return createPortal(
    <div className="print-root print-cards">
      {notions.map((notion) => (
        <PrintCard key={notion.id} notion={notion} />
      ))}
    </div>,
    document.body,
  );
}
