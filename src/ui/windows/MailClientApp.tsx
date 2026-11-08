import { useState } from 'react';
import type { Host } from '../../engine/devices/host';
import type { Email } from '../../engine/services/mail';
import { Section, TextField } from '../components/Fields';

type Tab = 'inbox' | 'compose' | 'sent' | 'account';

function split(addresses: string): string[] {
  return addresses
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function MessageList({ emails, empty }: { emails: readonly Email[]; empty: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (emails.length === 0) return <p className="muted">{empty}</p>;
  const current = open === null ? undefined : emails[open];
  return (
    <div className="mail-list">
      <table className="table selectable">
        <thead>
          <tr>
            <th>De</th>
            <th>À</th>
            <th>Objet</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((m, i) => (
            <tr
              key={i}
              className={open === i ? 'selected' : ''}
              tabIndex={0}
              onClick={() => {
                setOpen(i);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setOpen(i);
              }}
            >
              <td>{m.from}</td>
              <td>{m.to.join(', ')}</td>
              <td>{m.subject || '(sans objet)'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {current && (
        <article className="mail-view">
          <p>
            <b>De :</b> {current.from}
            <br />
            <b>À :</b> {current.to.join(', ')}
            {current.cc.length > 0 && (
              <>
                <br />
                <b>Cc :</b> {current.cc.join(', ')}
              </>
            )}
            <br />
            <b>Objet :</b> {current.subject}
          </p>
          <pre>{current.body}</pre>
        </article>
      )}
    </div>
  );
}

export function MailClientApp({ host }: { host: Host }) {
  const client = host.mailClient;
  const [tab, setTab] = useState<Tab>(client.account.address ? 'inbox' : 'account');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const account = client.account;

  return (
    <div className="mail">
      <div className="tabs" role="tablist">
        {(
          [
            ['inbox', `Boîte de réception (${client.inbox.length})`],
            ['compose', 'Nouveau message'],
            ['sent', `Envoyés (${client.sent.length})`],
            ['account', 'Compte'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {status && <p className={`mail-status ${status.startsWith('Erreur') ? 'ko' : 'ok'}`}>{status}</p>}
      {tab === 'inbox' && (
        <>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setStatus('Relève des messages (POP3)…');
              client.fetch((result) => {
                setBusy(false);
                setStatus(
                  result.kind === 'ok'
                    ? `${result.count} nouveau(x) message(s).`
                    : `Erreur : ${result.message}`,
                );
              });
            }}
          >
            Relever le courrier
          </button>
          <MessageList emails={client.inbox} empty="Aucun message reçu." />
        </>
      )}
      {tab === 'sent' && <MessageList emails={client.sent} empty="Aucun message envoyé." />}
      {tab === 'compose' && (
        <form
          className="compose"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setStatus('Envoi du message (SMTP)…');
            client.send({ to: split(to), cc: split(cc), subject, body }, (result) => {
              setBusy(false);
              if (result.kind === 'ok') {
                setStatus('Message envoyé.');
                setTo('');
                setCc('');
                setSubject('');
                setBody('');
              } else setStatus(`Erreur : ${result.message}`);
            });
          }}
        >
          <label>
            À{' '}
            <input
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
              }}
              placeholder="eleve2@college.fr"
            />
          </label>
          <label>
            Cc{' '}
            <input
              value={cc}
              onChange={(e) => {
                setCc(e.target.value);
              }}
            />
          </label>
          <label>
            Objet{' '}
            <input
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
              }}
            />
          </label>
          <textarea
            aria-label="Message"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
            }}
          />
          <button type="submit" className="primary" disabled={busy || !account.address}>
            Envoyer
          </button>
          {!account.address && <p className="warning">Configurez d’abord le compte.</p>}
        </form>
      )}
      {tab === 'account' && (
        <Section title="Compte de messagerie">
          <TextField
            label="Adresse électronique"
            value={account.address}
            placeholder="eleve1@college.fr"
            onCommit={(address) => {
              client.updateAccount({ address: address.trim() });
              return null;
            }}
          />
          <div className="field-row">
            <TextField
              label="Serveur d’envoi (SMTP)"
              value={account.smtpServer}
              onCommit={(smtpServer) => {
                client.updateAccount({ smtpServer: smtpServer.trim() });
                return null;
              }}
            />
            <TextField
              label="Serveur de réception (POP3)"
              value={account.pop3Server}
              onCommit={(pop3Server) => {
                client.updateAccount({ pop3Server: pop3Server.trim() });
                return null;
              }}
            />
          </div>
          <div className="field-row">
            <TextField
              label="Identifiant"
              value={account.user}
              onCommit={(user) => {
                client.updateAccount({ user: user.trim() });
                return null;
              }}
            />
            <TextField
              label="Mot de passe"
              type="password"
              value={account.password}
              onCommit={(password) => {
                client.updateAccount({ password });
                return null;
              }}
            />
          </div>
        </Section>
      )}
    </div>
  );
}
