import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

export type MenuEntry =
  | {
      readonly kind: 'action';
      readonly label: string;
      readonly onSelect: () => void;
      readonly disabled?: boolean;
      readonly danger?: boolean;
    }
  | {
      readonly kind: 'radio';
      readonly label: string;
      readonly checked: boolean;
      readonly onSelect: () => void;
    }
  /** Title of the following radio items. */
  | { readonly kind: 'heading'; readonly label: string }
  | { readonly kind: 'separator' }
  | {
      readonly kind: 'colors';
      readonly label: string;
      readonly colors: readonly string[];
      readonly value: string;
      readonly onSelect: (color: string) => void;
    };

interface Props {
  readonly label: string;
  /** Viewport coordinates of the pointer (or of the element for the keyboard). */
  readonly x: number;
  readonly y: number;
  readonly entries: readonly MenuEntry[];
  /** 'cancel': Escape or Tab (focus should go back to the opener). */
  readonly onClose: (reason: 'cancel' | 'select' | 'outside') => void;
}

/** Keys that open a context menu from the keyboard. */
export function isMenuKey(event: { readonly key: string; readonly shiftKey: boolean }): boolean {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
}

/** Where to open a menu requested from the keyboard on `element`. */
export function anchorOf(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

const ITEMS = '[role^="menuitem"]:not(:disabled)';
const MARGIN = 4;

/**
 * Right-click menu, like the pop-up menus of Filius. Keyboard: arrows, Home,
 * End, Enter; Escape or Tab closes it. A click outside also closes it.
 */
export function ContextMenu({ label, x, y, entries, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [x, y]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(ITEMS)?.focus();
    const outside = (event: Event) => {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target))
        closeRef.current('outside');
    };
    const close = () => {
      closeRef.current('outside');
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const index = items.findIndex((item) => item === document.activeElement);
    const focus = (i: number) => {
      items[(i + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        focus(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        focus(index - 1);
        break;
      case 'Home':
        focus(0);
        break;
      case 'End':
        focus(items.length - 1);
        break;
      case 'Escape':
      case 'Tab':
        onClose('cancel');
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const choose = (action: () => void) => {
    onClose('select');
    action();
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={label}
      style={position}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      {entries.map((entry, i) => {
        switch (entry.kind) {
          case 'separator':
            return <div key={i} role="separator" className="context-separator" />;
          case 'heading':
            return (
              <div key={i} role="presentation" className="context-heading">
                {entry.label}
              </div>
            );
          case 'radio':
            return (
              <button
                key={i}
                type="button"
                role="menuitemradio"
                aria-checked={entry.checked}
                tabIndex={-1}
                className="context-item radio"
                onClick={() => {
                  choose(entry.onSelect);
                }}
              >
                {entry.label}
              </button>
            );
          case 'colors':
            return (
              <div key={i} role="group" aria-label={entry.label} className="context-colors">
                <span className="context-heading" aria-hidden>
                  {entry.label}
                </span>
                <div className="swatches">
                  {entry.colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="menuitemradio"
                      aria-checked={color.toLowerCase() === entry.value.toLowerCase()}
                      aria-label={`${entry.label} ${color}`}
                      title={color}
                      tabIndex={-1}
                      className="swatch"
                      style={{ background: color }}
                      onClick={() => {
                        choose(() => {
                          entry.onSelect(color);
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          case 'action':
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={entry.disabled}
                className={`context-item ${entry.danger ? 'danger' : ''}`}
                onClick={() => {
                  choose(entry.onSelect);
                }}
              >
                {entry.label}
              </button>
            );
        }
      })}
    </div>
  );
}
