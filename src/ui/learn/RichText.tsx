import { Fragment, type ReactNode } from 'react';
import { parseInline, parseRich, type Inline } from '../../learn/richtext';
import { useSessionHandle } from '../context';
import { Figure } from './Figure';
import { showOnScreen } from './screen';

interface Props {
  readonly source: string;
  /** Opens the knowledge card a link points to; without it, links are plain text. */
  readonly onOpenNotion?: ((id: string) => void) | undefined;
  /** Title of a card, to tell where a link leads; null when the card does not exist. */
  readonly titleOf?: ((id: string) => string | null) | undefined;
}

/** Keys of the keyboard: Ctrl + Z. */
function Keys({ keys }: { keys: readonly string[] }) {
  return (
    <span className="keys">
      {keys.map((key, index) => (
        <Fragment key={index}>
          {index > 0 && '+'}
          <kbd>{key}</kbd>
        </Fragment>
      ))}
    </span>
  );
}

/** An element of the screen named in a text: a click makes it blink where it is. */
function ScreenChip({ target, text }: { target: string; text: string }) {
  const session = useSessionHandle();
  return (
    <button
      type="button"
      className="screen-chip"
      title="Me montrer à l’écran"
      aria-label={`${text} (me montrer à l’écran)`}
      onClick={() => {
        const result = showOnScreen(target);
        if (!result.shown) session?.notify(`« ${text} » : ${result.where}.`);
      }}
    >
      {text}
    </button>
  );
}

/** Turns the formatted pieces of a text into elements. */
function useInline(onOpenNotion: Props['onOpenNotion'], titleOf: Props['titleOf']) {
  const inline = (item: Inline, key: number): ReactNode => {
    switch (item.type) {
      case 'text':
        return item.text;
      case 'bold':
        return <strong key={key}>{item.children.map(inline)}</strong>;
      case 'italic':
        return <em key={key}>{item.children.map(inline)}</em>;
      case 'code':
        return <code key={key}>{item.text}</code>;
      case 'link': {
        const title = titleOf ? titleOf(item.notion) : item.notion;
        // A link to a card that does not exist (hidden by the teacher) stays plain text.
        if (!onOpenNotion || title === null) return item.text;
        return (
          <button
            key={key}
            type="button"
            className="link"
            title={`Fiche : ${title}`}
            onClick={() => {
              onOpenNotion(item.notion);
            }}
          >
            {item.text}
          </button>
        );
      }
      case 'keys':
        return <Keys key={key} keys={item.keys} />;
      case 'screen':
        // A name the application does not know (teacher's file) stays plain text.
        return item.known ? <ScreenChip key={key} target={item.target} text={item.text} /> : item.text;
    }
  };
  return inline;
}

/**
 * Displays a formatted text (see learn/richtext.ts) as React elements. The
 * source may come from a teacher's file: it is never inserted as HTML.
 */
export function RichText({ source, onOpenNotion, titleOf }: Props) {
  const inline = useInline(onOpenNotion, titleOf);
  return (
    <div className="rich-text">
      {parseRich(source).map((block, index) => {
        switch (block.type) {
          case 'paragraph':
            return <p key={index}>{block.content.map(inline)}</p>;
          case 'list':
            return (
              <ul key={index}>
                {block.items.map((item, i) => (
                  <li key={i}>{item.map(inline)}</li>
                ))}
              </ul>
            );
          case 'figure':
            // A figure the application does not know (teacher's file) is left out.
            return block.known ? <Figure key={index} id={block.figure} /> : null;
        }
      })}
    </div>
  );
}

/** One line of formatted text, without paragraphs (« À retenir »). */
export function RichLine({ source, onOpenNotion, titleOf }: Props) {
  const inline = useInline(onOpenNotion, titleOf);
  return <>{parseInline(source).map(inline)}</>;
}
