import { useLayoutEffect, useRef, useState } from 'react';
import { IP_ANY, formatIp } from '../../engine/core/ipv4';
import type { Switch } from '../../engine/devices/switch';
import type { NetworkNode } from '../../engine/devices/node';
import type { CaptureEntry } from '../../engine/net/capture';
import { LAYER_LABEL, describeFrame, summarizeFrame } from '../../engine/net/describe';
import { decimal } from '../../i18n/fr';
import { VERDICT_LABEL } from '../../learn/diagnose/messages.fr';
import { useSession } from '../context';
import { Section } from '../components/Fields';

const SOURCE_LABEL = { connected: 'directe', default: 'passerelle', static: 'statique', rip: 'RIP' } as const;

/** "Échanges de données": every frame sent or received by a device. */
export function CaptureWindow({
  node,
  initialIface,
}: {
  node: NetworkNode;
  initialIface?: number | undefined;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [iface, setIface] = useState<number | 'all'>(initialIface ?? 'all');
  const [protocol, setProtocol] = useState('all');
  const [hideIgnored, setHideIgnored] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  /** The list follows the new frames as long as the pupil has not scrolled up. */
  const follow = useRef(true);

  const all = node.capture.entries.map((entry) => ({ entry, top: summarizeFrame(entry.frame) }));
  const protocols = [...new Set(all.map((row) => row.top.protocol))].sort((a, b) => a.localeCompare(b, 'fr'));
  const ignored = all.filter((row) => row.entry.verdict === 'ignored').length;
  const rows = all.filter(
    ({ entry, top }) =>
      (iface === 'all' || entry.iface === iface) &&
      (protocol === 'all' || top.protocol === protocol) &&
      !(hideIgnored && entry.verdict === 'ignored'),
  );
  const current = node.capture.entries.find((e) => e.no === selected);
  const count = rows.length;

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (table && follow.current) table.scrollTop = table.scrollHeight;
  }, [count]);

  return (
    <div className="capture">
      <div className="editor-bar">
        {node.ports.length > 1 && (
          <select
            aria-label="Interface"
            value={iface}
            onChange={(e) => {
              setIface(e.target.value === 'all' ? 'all' : Number(e.target.value));
            }}
          >
            <option value="all">Toutes les interfaces</option>
            {node.ports.map((p) => (
              <option key={p.index} value={p.index}>
                eth{p.index}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Protocole"
          value={protocols.includes(protocol) ? protocol : 'all'}
          onChange={(e) => {
            setProtocol(e.target.value);
          }}
        >
          <option value="all">Tous les protocoles</option>
          {protocols.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <label
          className="checkbox"
          title="Trames arrivées jusqu’ici sans être destinées à cet équipement : diffusions, ou trames qu’un switch a envoyées partout faute de savoir où est leur destinataire."
        >
          <input
            type="checkbox"
            checked={hideIgnored}
            onChange={(e) => {
              setHideIgnored(e.target.checked);
            }}
          />
          Masquer les trames ignorées ({ignored})
        </label>
        <span className="muted small">
          {count === all.length ? `${count} trame(s)` : `${count} trame(s) sur ${all.length}`}
        </span>
        <button
          type="button"
          onClick={() => {
            node.capture.clear();
            setSelected(null);
            node.changed();
          }}
        >
          Effacer
        </button>
      </div>
      <div
        className="capture-table"
        ref={tableRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
        }}
      >
        <table className="table selectable dense">
          <thead>
            <tr>
              <th>N°</th>
              <th>Temps</th>
              <th>Sens</th>
              <th>Source</th>
              <th>Destination</th>
              <th>Protocole</th>
              <th>Couche</th>
              <th>Information</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry: e, top }) => (
              <tr
                key={e.no}
                className={`layer-${top.layer} ${selected === e.no ? 'selected' : ''} ${e.verdict ?? ''}`}
                tabIndex={0}
                onClick={() => {
                  setSelected(e.no);
                }}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') setSelected(e.no);
                }}
              >
                <td>{e.no}</td>
                <td>{decimal(e.time / 1000, 3)}</td>
                <td>{direction(e)}</td>
                <td>{top.source}</td>
                <td>{top.destination}</td>
                <td>{top.protocol}</td>
                <td>{LAYER_LABEL[top.layer]}</td>
                <td>{top.info}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {count === 0 && (
          <p className="muted">
            {all.length === 0
              ? 'Aucune donnée échangée pour l’instant.'
              : 'Aucune trame ne correspond aux filtres choisis.'}
          </p>
        )}
      </div>
      {current ? (
        <div className="capture-detail" aria-label="Détail de la trame">
          {describeFrame(current.frame).map((layer, i) => (
            <details key={i} open className={`layer-${layer.layer}`}>
              <summary>
                {LAYER_LABEL[layer.layer]} — {layer.protocol} : {layer.info}
              </summary>
              <dl>
                {layer.fields.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v.length > 300 ? <pre>{v}</pre> : v}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ))}
        </div>
      ) : (
        count > 0 && (
          <p className="muted small">Cliquez sur une trame pour voir son contenu, couche par couche.</p>
        )
      )}
    </div>
  );
}

/** « ← reçue, ignorée », « → envoyée » : way of a frame and what the device did with it. */
function direction(entry: CaptureEntry): string {
  if (entry.direction === 'out') return '→ envoyée';
  return entry.verdict ? `← ${VERDICT_LABEL[entry.verdict]}` : '← reçue';
}

export function SwitchWindow({ device }: { device: Switch }) {
  const { network } = useSession();
  const neighbour = (port: number) => {
    const p = device.ports[port];
    const other = p?.cable?.other(p);
    return other ? (network.device(other.owner.id)?.name ?? '?') : '—';
  };
  return (
    <div>
      <p className="muted small">
        Le switch apprend sur quel port se trouve chaque adresse MAC en lisant l’adresse source des trames
        reçues.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Adresse MAC</th>
            <th>Port</th>
            <th>Équipement relié au port</th>
          </tr>
        </thead>
        <tbody>
          {device.macTable.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                Table vide : aucune trame reçue.
              </td>
            </tr>
          )}
          {device.macTable.map((e) => (
            <tr key={e.mac}>
              <td>
                <code>{e.mac}</code>
              </td>
              <td>{e.port}</td>
              <td>{neighbour(e.port)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Routing and ARP tables of a router or of a computer. */
export function TablesWindow({ node }: { node: NetworkNode }) {
  const session = useSession();
  const several = node.ports.length > 1;
  const port = (index: number) => (several ? `eth${index}` : 'carte réseau');
  const arp = node.stack.arp.entries;
  return (
    <div>
      <Section
        title="Table de routage"
        actions={
          <button
            type="button"
            onClick={() => {
              session.openWindow({ type: 'capture', deviceId: node.id });
            }}
          >
            Échanges de données
          </button>
        }
      >
        <p className="muted small">
          Où envoyer un paquet selon sa destination : directement dans un réseau relié, ou à une passerelle.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Destination</th>
              <th>Masque</th>
              <th>Passerelle</th>
              <th>Interface</th>
              <th>Distance</th>
              <th>Origine</th>
            </tr>
          </thead>
          <tbody>
            {node.stack.routes().map((r, i) => (
              <tr key={i}>
                <td>
                  {r.destination === IP_ANY && r.mask === IP_ANY
                    ? 'toutes les autres'
                    : formatIp(r.destination)}
                </td>
                <td>{formatIp(r.mask)}</td>
                <td>{r.gateway === IP_ANY ? 'directe' : formatIp(r.gateway)}</td>
                <td>{port(r.iface)}</td>
                <td>{r.metric}</td>
                <td>{SOURCE_LABEL[r.source]}</td>
              </tr>
            ))}
            {node.stack.routes().length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Vide : aucune interface n’a d’adresse.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
      <Section title="Table ARP">
        <p className="muted small">
          Adresses MAC déjà trouvées pour des adresses IP voisines (réponses aux demandes « qui a cette
          adresse ? »).
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Adresse IP</th>
              <th>Adresse MAC</th>
              <th>Interface</th>
            </tr>
          </thead>
          <tbody>
            {arp.map((e) => (
              <tr key={e.ip}>
                <td>{formatIp(e.ip)}</td>
                <td>
                  <code>{e.mac}</code>
                </td>
                <td>{port(e.iface)}</td>
              </tr>
            ))}
            {arp.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  Vide : aucun échange pour l’instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
