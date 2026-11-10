import type { ReactNode } from 'react';
import { parseRich, type Inline } from '../../learn/richtext';

interface Props {
  readonly source: string;
  /** Opens the knowledge card a link points to; without it, links are plain text. */
  readonly onOpenNotion?: ((id: string) => void) | undefined;
  /** Title of a card, to tell where a link leads; null when the card does not exist. */
  readonly titleOf?: ((id: string) => string | null) | undefined;
}

/**
 * Displays a formatted text (see learn/richtext.ts) as React elements. The
 * source may come from a teacher's file: it is never inserted as HTML.
 */
export function RichText({ source, onOpenNotion, titleOf }: Props) {
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
    }
  };
  return (
    <div className="rich-text">
      {parseRich(source).map((block, index) =>
        block.type === 'paragraph' ? (
          <p key={index}>{block.content.map(inline)}</p>
        ) : (
          <ul key={index}>
            {block.items.map((item, i) => (
              <li key={i}>{item.map(inline)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
