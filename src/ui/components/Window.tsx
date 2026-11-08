import { useRef, type ReactNode } from 'react';
import { useSession } from '../context';
import type { OpenWindow } from '../session';

interface Props {
  readonly window: OpenWindow;
  readonly title: string;
  readonly children: ReactNode;
  readonly width?: number;
  readonly height?: number;
  readonly className?: string;
}

/** Floating window, draggable by its title bar. */
export function Window({ window: w, title, children, width = 640, height = 440, className = '' }: Props) {
  const session = useSession();
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  return (
    <div
      className={`window ${className}`}
      role="dialog"
      aria-label={title}
      style={{ left: w.x, top: w.y, zIndex: 100 + w.z, width, height }}
      onPointerDown={() => {
        session.focusWindow(w.id);
      }}
    >
      <div
        className="window-title"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          drag.current = { x: e.clientX, y: e.clientY, ox: w.x, oy: w.y };
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent from jsdom
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          session.moveWindow(w.id, Math.max(0, d.ox + e.clientX - d.x), Math.max(0, d.oy + e.clientY - d.y));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <span>{title}</span>
        <button
          type="button"
          className="window-close"
          aria-label={`Fermer ${title}`}
          onClick={() => {
            session.closeWindow(w.id);
          }}
        >
          ✕
        </button>
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}
