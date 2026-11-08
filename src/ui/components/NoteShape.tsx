import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { anchorOf, isMenuKey } from './ContextMenu';
import type { Note } from '../../engine/network';

interface Props {
  readonly note: Note;
  readonly selected: boolean;
  /** False in simulation mode: notes are then only decoration. */
  readonly interactive: boolean;
  readonly onPointerDown: (event: PointerEvent, mode: 'move' | 'resize') => void;
  readonly onActivate: () => void;
  /** Right click, or the menu key: open the context menu at (x, y). */
  readonly onMenu: (x: number, y: number, opener: SVGGElement) => void;
}

const HANDLE = 10;

export function noteLabel(note: Note): string {
  const text = note.text.trim().replace(/\s+/g, ' ');
  const summary = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return note.kind === 'zone' ? `Zone${summary ? ` : ${summary}` : ''}` : `Texte : ${summary || '(vide)'}`;
}

/** A documentation element of the plan: coloured zone or text label. */
export function NoteShape({ note, selected, interactive, onPointerDown, onActivate, onMenu }: Props) {
  const { x, y, width, height } = note;
  const textStyle = {
    color: note.kind === 'zone' ? undefined : note.color,
    fontSize: note.fontSize,
    fontWeight: note.bold ? 700 : 400,
    fontStyle: note.italic ? 'italic' : 'normal',
  };
  return (
    <g
      className={`note ${note.kind} ${selected ? 'selected' : ''}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? noteLabel(note) : undefined}
      aria-pressed={interactive ? selected : undefined}
      onPointerDown={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onPointerDown(e, 'move');
      }}
      onContextMenu={(e: MouseEvent<SVGGElement>) => {
        if (!interactive) return;
        e.preventDefault();
        e.stopPropagation();
        onMenu(e.clientX, e.clientY, e.currentTarget);
      }}
      onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
        if (!interactive) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        } else if (isMenuKey(e)) {
          e.preventDefault();
          const { x, y } = anchorOf(e.currentTarget);
          onMenu(x, y, e.currentTarget);
        }
      }}
    >
      {note.kind === 'zone' && (
        <rect x={x} y={y} width={width} height={height} rx={6} fill={note.color} className="note-zone" />
      )}
      {note.text && (
        <foreignObject x={x} y={y} width={width} height={height} className="note-text-box">
          <div className="note-text" style={textStyle}>
            {note.text}
          </div>
        </foreignObject>
      )}
      {selected && interactive && (
        <>
          <rect x={x - 3} y={y - 3} width={width + 6} height={height + 6} className="note-outline" />
          <rect
            x={x + width - HANDLE / 2}
            y={y + height - HANDLE / 2}
            width={HANDLE}
            height={HANDLE}
            className="note-handle"
            aria-hidden
            onPointerDown={(e) => {
              e.stopPropagation();
              onPointerDown(e, 'resize');
            }}
          />
        </>
      )}
    </g>
  );
}
