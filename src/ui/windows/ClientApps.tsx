import { useEffect, useState } from 'react';
import type { Host } from '../../engine/devices/host';
import { DEFAULT_ECHO_PORT, LineClient } from '../../engine/services/echo';
import { FirewallEditor } from '../components/FirewallEditor';

export function EchoClientApp({ host }: { host: Host }) {
  const [server, setServer] = useState('');
  const [port, setPort] = useState(String(DEFAULT_ECHO_PORT));
  const [message, setMessage] = useState('');
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);

  const add = (line: string) => {
    setTranscript((t) => [...t, line].slice(-500));
  };
  const [c] = useState(
    () =>
      new LineClient(host, {
        connected: (remote) => {
          setConnected(true);
          add(`— Connecté à ${remote}`);
        },
        line: (line) => {
          add(`← ${line}`);
        },
        closed: (text) => {
          setConnected(false);
          add(`— ${text}`);
        },
      }),
  );
  useEffect(
    () => () => {
      c.disconnect();
    },
    [c],
  );
  return (
    <div className="client-app">
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (connected) {
            c.disconnect();
            return;
          }
          const p = Number(port);
          if (!server.trim() || !Number.isInteger(p) || p < 1 || p > 65535) {
            add('— Indiquez un serveur et un port (1 à 65535).');
            return;
          }
          add(`— Connexion à ${server}:${p}…`);
          c.connect(server.trim(), p);
        }}
      >
        <input
          aria-label="Serveur"
          placeholder="adresse ou nom du serveur"
          value={server}
          onChange={(e) => {
            setServer(e.target.value);
          }}
        />
        <input
          aria-label="Port"
          className="narrow"
          value={port}
          onChange={(e) => {
            setPort(e.target.value);
          }}
        />
        <button type="submit" className={connected ? 'danger' : 'primary'}>
          {connected ? 'Déconnecter' : 'Connecter'}
        </button>
      </form>
      <div className="log transcript" role="log" aria-label="Échanges">
        {transcript.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!connected || !message) return;
          c.send(message);
          add(`→ ${message}`);
          setMessage('');
        }}
      >
        <input
          aria-label="Message"
          placeholder="message à envoyer"
          value={message}
          disabled={!connected}
          onChange={(e) => {
            setMessage(e.target.value);
          }}
        />
        <button type="submit" disabled={!connected}>
          Envoyer
        </button>
      </form>
    </div>
  );
}

export function FirewallApp({ host }: { host: Host }) {
  return (
    <FirewallEditor
      firewall={host.firewall}
      scope="vers ce poste"
      onChange={() => {
        host.changed();
      }}
    />
  );
}
