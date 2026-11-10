import { useEffect, useRef, useState } from 'react';
import type { Host } from '../../engine/devices/host';
import { Terminal } from '../../engine/terminal/terminal';

const MAX_LINES = 1000;

export function TerminalApp({ host }: { host: Host }) {
  const [lines, setLines] = useState<string[]>(() => [
    `${host.name} — tapez « help » pour la liste des commandes. Flèche ↑ : rappeler la commande précédente.`,
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(0);
  const screenRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [term] = useState(
    () =>
      new Terminal(host, {
        print: (line) => {
          setLines((prev) => [...prev, line].slice(-MAX_LINES));
        },
        clear: () => {
          setLines([]);
        },
      }),
  );

  useEffect(() => {
    const screen = screenRef.current;
    if (screen) screen.scrollTop = screen.scrollHeight;
  }, [lines]);

  useEffect(
    () => () => {
      term.interrupt();
    },
    [term],
  );

  const run = () => {
    const line = input;
    setInput('');
    setLines((prev) => [...prev, `${term.prompt}${line}`]);
    if (line.trim()) history.current.push(line);
    historyIndex.current = history.current.length;
    setBusy(true);
    term.execute(line, () => {
      setBusy(false);
    });
    if (!term.busy) setBusy(false);
  };

  return (
    <div
      className="terminal"
      onClick={() => {
        inputRef.current?.focus();
      }}
    >
      <div className="terminal-screen" ref={screenRef} role="log" aria-label="Sortie du terminal">
        {lines.map((line, i) => (
          <div key={i}>{line || ' '}</div>
        ))}
        <div className="terminal-input-line">
          {!busy && <span>{term.prompt}</span>}
          <input
            ref={inputRef}
            aria-label="Commande"
            value={input}
            disabled={false}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'c' && e.ctrlKey) {
                e.preventDefault();
                term.interrupt();
                setBusy(false);
                return;
              }
              if (busy) return;
              if (e.key === 'Enter') run();
              else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const h = history.current;
                historyIndex.current = Math.min(
                  h.length,
                  Math.max(0, historyIndex.current + (e.key === 'ArrowUp' ? -1 : 1)),
                );
                setInput(h[historyIndex.current] ?? '');
              }
            }}
          />
        </div>
      </div>
      {busy && <p className="terminal-hint">Commande en cours… Ctrl+C pour l’interrompre.</p>}
    </div>
  );
}
