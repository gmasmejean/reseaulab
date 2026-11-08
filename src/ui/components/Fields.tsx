import { useId, useState, type ReactNode } from 'react';
import { IP_ANY, formatIp, isValidMask, parseIp, type Ipv4 } from '../../engine/core/ipv4';

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  /** Returns an error message, or null when the value is accepted. */
  readonly onCommit: (value: string) => string | null;
  readonly disabled?: boolean | undefined;
  readonly placeholder?: string | undefined;
  readonly hint?: ReactNode | undefined;
  readonly type?: 'text' | 'password' | 'number' | undefined;
}

/** Text input committed on blur / Enter, with inline validation feedback. */
export function TextField({
  label,
  value,
  onCommit,
  disabled,
  placeholder,
  hint,
  type = 'text',
}: TextFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  // Follow external changes of `value` (React's "adjust state during render" pattern).
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
    setError(null);
  }
  const commit = () => {
    if (draft === value) {
      setError(null);
      return;
    }
    setError(onCommit(draft));
  };
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value);
            setError(null);
          }
        }}
      />
      {error && (
        <span className="field-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
      {hint && !error && <span className="field-hint">{hint}</span>}
    </div>
  );
}

interface IpFieldProps {
  readonly label: string;
  readonly value: Ipv4;
  readonly onChange: (value: Ipv4) => void;
  readonly disabled?: boolean | undefined;
  readonly mask?: boolean | undefined;
  readonly allowEmpty?: boolean | undefined;
  readonly hint?: ReactNode | undefined;
}

/** IPv4 address (or mask) input. An empty field means 0.0.0.0 when allowed. */
export function IpField({ label, value, onChange, disabled, mask, allowEmpty = true, hint }: IpFieldProps) {
  return (
    <TextField
      label={label}
      value={value === IP_ANY && allowEmpty ? '' : formatIp(value)}
      disabled={disabled}
      placeholder={mask ? '255.255.255.0' : allowEmpty ? '(aucune)' : '192.168.0.1'}
      hint={hint}
      onCommit={(text) => {
        if (text.trim() === '' && allowEmpty) {
          onChange(IP_ANY);
          return null;
        }
        const parsed = parseIp(text);
        if (parsed === null) return 'Adresse invalide : 4 nombres de 0 à 255 séparés par des points.';
        if (mask && !isValidMask(parsed)) return 'Masque invalide (ex. 255.255.255.0).';
        onChange(parsed);
        return null;
      }}
    />
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean | undefined;
}) {
  return (
    <label className="checkbox">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
      />
      {label}
    </label>
  );
}

export function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="section">
      <header>
        <h3>{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Start/stop control of a server application. */
export function ServerSwitch({
  active,
  listening,
  onToggle,
}: {
  readonly active: boolean;
  readonly listening: boolean;
  readonly onToggle: (active: boolean) => void;
}) {
  return (
    <div className="server-switch">
      <span className={`status-dot ${listening ? 'on' : active ? 'pending' : 'off'}`} aria-hidden />
      <span>
        {listening ? 'Serveur démarré' : active ? 'Démarrera avec la simulation' : 'Serveur arrêté'}
      </span>
      <button
        type="button"
        className={active ? 'danger' : 'primary'}
        onClick={() => {
          onToggle(!active);
        }}
      >
        {active ? 'Arrêter' : 'Démarrer'}
      </button>
    </div>
  );
}

export function LogView({ entries }: { entries: readonly { time: number; text: string }[] }) {
  return (
    <div className="log" role="log" aria-label="Journal">
      {entries.length === 0 ? (
        <p className="muted">Aucun événement.</p>
      ) : (
        entries.map((e, i) => (
          <div key={i}>
            <span className="muted">{(e.time / 1000).toFixed(2)} s</span> {e.text}
          </div>
        ))
      )}
    </div>
  );
}
