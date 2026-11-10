import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useSessionHandle } from '../context';

const WIDTH = 300;

/**
 * « ? » next to a label: a click shows the definition of the notion, with a
 * link to its knowledge card. Renders nothing when the card does not exist
 * (hidden by the teacher, or above the level of the class).
 */
export function TermHelp({ term, label }: { term: string; label: string }) {
  const session = useSessionHandle();
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const notion = session?.notion(term);

  // Placed in the page (not in its container, which may be scrollable): above
  // the button when there is not enough room below.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    const bubble = bubbleRef.current;
    if (!open || !button || !bubble) return;
    const anchor = button.getBoundingClientRect();
    const height = bubble.getBoundingClientRect().height;
    const below = anchor.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, anchor.top - height - 6) : below;
    const left = Math.max(8, Math.min(anchor.left - 12, window.innerWidth - WIDTH - 8));
    setPosition({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (bubbleRef.current?.contains(target) || buttonRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  if (!session || !notion) return null;
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="term-help"
        aria-label={`Qu’est-ce que : ${label} ?`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setPosition(null);
          setOpen(!open);
        }}
      >
        ?
      </button>
      {open && (
        <div
          ref={bubbleRef}
          id={id}
          className="term-bubble"
          role="note"
          style={{
            width: WIDTH,
            left: position?.left ?? 0,
            top: position?.top ?? 0,
            visibility: position ? 'visible' : 'hidden',
          }}
        >
          <p className="term-title">{notion.title}</p>
          <p>{notion.short}</p>
          <button
            type="button"
            className="link"
            onClick={() => {
              setOpen(false);
              session.openKnowledge(notion.id);
            }}
          >
            En savoir plus
          </button>
        </div>
      )}
    </>
  );
}
