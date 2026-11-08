import { useState } from 'react';
import { IP_ANY, formatIp, parseIp } from '../../engine/core/ipv4';
import { normalizeMac } from '../../engine/core/mac';
import type { Host } from '../../engine/devices/host';
import type { DnsRecordType } from '../../engine/net/messages';
import { WEB_ROOT } from '../../engine/services/http';
import { IpField, LogView, Section, ServerSwitch, TextField } from '../components/Fields';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function WebServerApp({ host }: { host: Host }) {
  const server = host.webServer;
  const pages = host.fs.isDirectory(WEB_ROOT) ? host.fs.list(WEB_ROOT) : [];
  return (
    <div className="server-app">
      <ServerSwitch
        active={server.active}
        listening={server.isListening}
        onToggle={(v) => {
          server.setActive(v);
        }}
      />
      <p className="muted small">
        Le serveur publie les fichiers du dossier <code>{WEB_ROOT}</code> sur le port TCP 80. Modifiez-les
        avec l’éditeur de texte.
      </p>
      <Section title="Fichiers publiés">
        <ul className="plain-list">
          {pages.map((p) => (
            <li key={p.name}>
              <code>
                {WEB_ROOT}/{p.name}
              </code>
            </li>
          ))}
          {pages.length === 0 && <li className="muted">Aucun fichier.</li>}
        </ul>
      </Section>
      <Section title="Requêtes reçues">
        <LogView entries={server.log} />
      </Section>
    </div>
  );
}

export function DnsServerApp({ host }: { host: Host }) {
  const server = host.dnsServer;
  const [name, setName] = useState('');
  const [type, setType] = useState<DnsRecordType>('A');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const records = server.config.records;
  return (
    <div className="server-app">
      <ServerSwitch
        active={server.active}
        listening={server.isListening}
        onToggle={(v) => {
          server.setActive(v);
        }}
      />
      <Section title="Enregistrements">
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Type</th>
              <th>Valeur</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Aucun enregistrement.
                </td>
              </tr>
            )}
            {records.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{r.type}</td>
                <td>{r.value}</td>
                <td>
                  <button
                    type="button"
                    aria-label={`Supprimer ${r.name}`}
                    onClick={() => {
                      server.updateConfig({ records: records.filter((_, j) => j !== i) });
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
            const n = name.trim().toLowerCase();
            const v = value.trim();
            if (!/^(\.|[a-z0-9-]+(\.[a-z0-9-]+)*\.?)$/.test(n)) {
              setError('Nom de domaine invalide.');
              return;
            }
            if (type === 'A' && parseIp(v) === null) {
              setError('Un enregistrement A contient une adresse IPv4.');
              return;
            }
            if (type !== 'A' && !/^[a-z0-9.-]+$/i.test(v)) {
              setError('Indiquez un nom d’hôte.');
              return;
            }
            setError(null);
            server.updateConfig({ records: [...records, { name: n, type, value: v }] });
            setName('');
            setValue('');
          }}
        >
          <input
            aria-label="Nom"
            placeholder="www.college.fr"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
          <select
            aria-label="Type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as DnsRecordType);
            }}
          >
            <option value="A">A (adresse)</option>
            <option value="MX">MX (serveur mail)</option>
            <option value="NS">NS (serveur DNS délégué)</option>
          </select>
          <input
            aria-label="Valeur"
            placeholder={type === 'A' ? '192.168.2.80' : 'mail.college.fr'}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
            }}
          />
          <button type="submit" className="primary">
            Ajouter
          </button>
        </form>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={server.config.recursion}
            onChange={(e) => {
              server.updateConfig({ recursion: e.target.checked });
            }}
          />
          Récursion : interroger le serveur indiqué par un enregistrement NS (« . » = tous les noms)
        </label>
      </Section>
      <Section title="Journal">
        <LogView entries={server.log} />
      </Section>
    </div>
  );
}

export function DhcpServerApp({ host }: { host: Host }) {
  const server = host.dhcpServer;
  const c = server.config;
  const [mac, setMac] = useState('');
  const [ip, setIp] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="server-app">
      <ServerSwitch
        active={server.active}
        listening={server.isListening}
        onToggle={(v) => {
          server.setActive(v);
        }}
      />
      {host.config.useDhcp && <p className="warning">⚠ Un serveur DHCP doit avoir une adresse IP fixe.</p>}
      <Section title="Adresses distribuées">
        <div className="field-row">
          <IpField
            label="Première adresse"
            value={c.rangeStart}
            onChange={(v) => {
              server.updateConfig({ rangeStart: v });
            }}
          />
          <IpField
            label="Dernière adresse"
            value={c.rangeEnd}
            onChange={(v) => {
              server.updateConfig({ rangeEnd: v });
            }}
          />
        </div>
        <div className="field-row">
          <IpField
            label="Passerelle annoncée"
            value={c.gateway}
            onChange={(v) => {
              server.updateConfig({ gateway: v });
            }}
          />
          <IpField
            label="Serveur DNS annoncé"
            value={c.dns}
            onChange={(v) => {
              server.updateConfig({ dns: v });
            }}
          />
        </div>
        <p className="muted small">Le masque annoncé est celui du serveur : {formatIp(host.config.mask)}.</p>
      </Section>
      <Section title="Réservations (adresse fixe pour une adresse MAC)">
        <table className="table">
          <tbody>
            {c.reservations.map((r, i) => (
              <tr key={i}>
                <td>
                  <code>{r.mac}</code>
                </td>
                <td>{formatIp(r.ip)}</td>
                <td>
                  <button
                    type="button"
                    aria-label="Supprimer la réservation"
                    onClick={() => {
                      server.updateConfig({ reservations: c.reservations.filter((_, j) => j !== i) });
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
            const m = normalizeMac(mac);
            const a = parseIp(ip);
            if (!m) {
              setError('Adresse MAC invalide (ex. 02:00:00:00:00:01).');
              return;
            }
            if (a === null || a === IP_ANY) {
              setError('Adresse IP invalide.');
              return;
            }
            setError(null);
            server.updateConfig({
              reservations: [...c.reservations.filter((r) => r.mac !== m), { mac: m, ip: a }],
            });
            setMac('');
            setIp('');
          }}
        >
          <input
            aria-label="Adresse MAC"
            placeholder="02:00:00:00:00:01"
            value={mac}
            onChange={(e) => {
              setMac(e.target.value);
            }}
          />
          <input
            aria-label="Adresse IP réservée"
            placeholder="192.168.1.50"
            value={ip}
            onChange={(e) => {
              setIp(e.target.value);
            }}
          />
          <button type="submit">Réserver</button>
        </form>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </Section>
      <Section title="Baux attribués">
        {server.leases.length === 0 ? (
          <p className="muted">Aucun bail.</p>
        ) : (
          <table className="table">
            <tbody>
              {server.leases.map((l) => (
                <tr key={l.mac}>
                  <td>
                    <code>{l.mac}</code>
                  </td>
                  <td>{formatIp(l.ip)}</td>
                  <td>{l.confirmed ? 'attribuée' : 'proposée'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <LogView entries={server.log} />
      </Section>
    </div>
  );
}

export function MailServerApp({ host }: { host: Host }) {
  const server = host.mailServer;
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="server-app">
      <ServerSwitch
        active={server.active}
        listening={server.isListening}
        onToggle={(v) => {
          server.setActive(v);
        }}
      />
      <Section title="Domaine">
        <TextField
          label="Domaine de messagerie"
          value={server.config.domain}
          placeholder="college.fr"
          hint="Les adresses de ce domaine sont livrées ici ; les autres sont relayées grâce aux enregistrements MX."
          onCommit={(domain) => {
            server.updateConfig({ domain: domain.trim().toLowerCase() });
            return null;
          }}
        />
      </Section>
      <Section title="Comptes">
        <table className="table">
          <thead>
            <tr>
              <th>Adresse</th>
              <th>Mot de passe</th>
              <th>Messages en attente</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {server.config.accounts.map((a) => (
              <tr key={a.user}>
                <td>
                  {a.user}@{server.config.domain || '…'}
                </td>
                <td>{a.password}</td>
                <td>{a.mailbox.length}</td>
                <td>
                  <button
                    type="button"
                    aria-label={`Supprimer ${a.user}`}
                    onClick={() => {
                      server.removeAccount(a.user);
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
            try {
              server.addAccount(user, password);
              setUser('');
              setPassword('');
              setError(null);
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          <input
            aria-label="Utilisateur"
            placeholder="utilisateur"
            value={user}
            onChange={(e) => {
              setUser(e.target.value);
            }}
          />
          <input
            aria-label="Mot de passe"
            placeholder="mot de passe"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
          <button type="submit" className="primary">
            Créer le compte
          </button>
        </form>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </Section>
      <Section title="Journal">
        <LogView entries={server.log} />
      </Section>
    </div>
  );
}

export function EchoServerApp({ host }: { host: Host }) {
  const server = host.echoServer;
  return (
    <div className="server-app">
      <ServerSwitch
        active={server.active}
        listening={server.isListening}
        onToggle={(v) => {
          server.setActive(v);
        }}
      />
      <TextField
        label="Port TCP"
        type="number"
        value={String(server.port)}
        onCommit={(value) => {
          try {
            server.setPort(Number(value));
            return null;
          } catch (error) {
            return errorText(error);
          }
        }}
      />
      <Section title="Journal">
        <LogView entries={server.log} />
      </Section>
    </div>
  );
}
