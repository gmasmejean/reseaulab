import { useState } from 'react';
import { IP_ANY, formatIp, isValidMask, parseIp } from '../../engine/core/ipv4';
import type { Firewall, FirewallAction, FirewallProtocol, FirewallRule } from '../../engine/stack/firewall';
import { Checkbox } from './Fields';

const PROTOCOLS: Record<FirewallProtocol, string> = {
  any: 'Tous',
  tcp: 'TCP',
  udp: 'UDP',
  icmp: 'ICMP (ping)',
};

function network(ip: number, mask: number): string {
  return ip === IP_ANY && mask === IP_ANY ? 'tous' : `${formatIp(ip)} / ${formatIp(mask)}`;
}

interface Draft {
  action: FirewallAction;
  protocol: FirewallProtocol;
  source: string;
  sourceMask: string;
  destination: string;
  destinationMask: string;
  port: string;
}

const EMPTY: Draft = {
  action: 'accept',
  protocol: 'tcp',
  source: '',
  sourceMask: '',
  destination: '',
  destinationMask: '',
  port: '',
};

function parseDraft(d: Draft): FirewallRule | string {
  const addr = (text: string, mask: boolean) => {
    if (text.trim() === '') return IP_ANY;
    const v = parseIp(text);
    if (v === null || (mask && !isValidMask(v))) return null;
    return v;
  };
  const source = addr(d.source, false);
  const sourceMask = addr(d.sourceMask, true);
  const destination = addr(d.destination, false);
  const destinationMask = addr(d.destinationMask, true);
  if (source === null || destination === null) return 'Adresse invalide.';
  if (sourceMask === null || destinationMask === null) return 'Masque invalide.';
  const port = d.port.trim() === '' ? 0 : Number(d.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return 'Port invalide (0 à 65535).';
  if (port !== 0 && (d.protocol === 'icmp' || d.protocol === 'any'))
    return 'Un port n’a de sens qu’avec TCP ou UDP.';
  return { action: d.action, protocol: d.protocol, source, sourceMask, destination, destinationMask, port };
}

/** Ordered rule list of a firewall (host or router). */
export function FirewallEditor({
  firewall,
  onChange,
  scope,
}: {
  firewall: Firewall;
  onChange: () => void;
  scope: string;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const setRules = (rules: FirewallRule[]) => {
    firewall.setRules(rules);
    onChange();
  };
  const move = (index: number, delta: number) => {
    const rules = [...firewall.rules];
    const [rule] = rules.splice(index, 1);
    if (rule) rules.splice(index + delta, 0, rule);
    setRules(rules);
  };
  const update = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
  };
  return (
    <div className="firewall">
      <Checkbox
        label="Pare-feu activé"
        checked={firewall.enabled}
        onChange={(enabled) => {
          firewall.setEnabled(enabled);
          onChange();
        }}
      />
      <p className="muted small">
        Pare-feu activé : toute nouvelle connexion {scope} est bloquée sauf si une règle l’autorise. Les
        règles sont lues dans l’ordre ; la première qui correspond s’applique. Les réponses aux échanges
        autorisés passent toujours. Paquets bloqués : {firewall.droppedCount}.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Action</th>
            <th>Protocole</th>
            <th>Source</th>
            <th>Destination</th>
            <th>Port</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {firewall.rules.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                Aucune règle.
              </td>
            </tr>
          )}
          {firewall.rules.map((r, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td className={r.action === 'accept' ? 'ok' : 'ko'}>
                {r.action === 'accept' ? 'Autoriser' : 'Bloquer'}
              </td>
              <td>{PROTOCOLS[r.protocol]}</td>
              <td>{network(r.source, r.sourceMask)}</td>
              <td>{network(r.destination, r.destinationMask)}</td>
              <td>{r.port === 0 ? 'tous' : r.port}</td>
              <td className="row-actions">
                <button
                  type="button"
                  aria-label="Monter"
                  disabled={i === 0}
                  onClick={() => {
                    move(i, -1);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Descendre"
                  disabled={i === firewall.rules.length - 1}
                  onClick={() => {
                    move(i, 1);
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label="Supprimer la règle"
                  onClick={() => {
                    setRules(firewall.rules.filter((_, j) => j !== i));
                  }}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const rule = parseDraft(draft);
          if (typeof rule === 'string') {
            setError(rule);
            return;
          }
          setError(null);
          setRules([...firewall.rules, rule]);
          setDraft(EMPTY);
        }}
      >
        <select
          aria-label="Action"
          value={draft.action}
          onChange={(e) => {
            update({ action: e.target.value as FirewallAction });
          }}
        >
          <option value="accept">Autoriser</option>
          <option value="drop">Bloquer</option>
        </select>
        <select
          aria-label="Protocole"
          value={draft.protocol}
          onChange={(e) => {
            update({ protocol: e.target.value as FirewallProtocol });
          }}
        >
          {Object.entries(PROTOCOLS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          aria-label="IP source"
          placeholder="IP source (vide = toutes)"
          value={draft.source}
          onChange={(e) => {
            update({ source: e.target.value });
          }}
        />
        <input
          aria-label="Masque source"
          placeholder="masque"
          value={draft.sourceMask}
          onChange={(e) => {
            update({ sourceMask: e.target.value });
          }}
        />
        <input
          aria-label="IP destination"
          placeholder="IP destination"
          value={draft.destination}
          onChange={(e) => {
            update({ destination: e.target.value });
          }}
        />
        <input
          aria-label="Masque destination"
          placeholder="masque"
          value={draft.destinationMask}
          onChange={(e) => {
            update({ destinationMask: e.target.value });
          }}
        />
        <input
          aria-label="Port"
          placeholder="port"
          value={draft.port}
          onChange={(e) => {
            update({ port: e.target.value });
          }}
          className="narrow"
        />
        <button type="submit" className="primary">
          Ajouter la règle
        </button>
      </form>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
