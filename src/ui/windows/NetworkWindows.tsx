import { useState } from 'react';
import { IP_ANY, formatIp } from '../../engine/core/ipv4';
import type { Router } from '../../engine/devices/router';
import type { Switch } from '../../engine/devices/switch';
import type { NetworkNode } from '../../engine/devices/node';
import { LAYER_LABEL, describeFrame, summarizeFrame } from '../../engine/net/describe';
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
  const entries = node.capture.entries.filter((e) => iface === 'all' || e.iface === iface);
  const current = node.capture.entries.find((e) => e.no === selected);
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
        <span className="muted small">{entries.length} trame(s)</span>
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
      <div className="capture-table">
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
            {entries.map((e) => {
              const top = summarizeFrame(e.frame);
              return (
                <tr
                  key={e.no}
                  className={`layer-${top.layer} ${selected === e.no ? 'selected' : ''}`}
                  tabIndex={0}
                  onClick={() => {
                    setSelected(e.no);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') setSelected(e.no);
                  }}
                >
                  <td>{e.no}</td>
                  <td>{(e.time / 1000).toFixed(3)}</td>
                  <td>{e.direction === 'in' ? '← reçu' : '→ envoyé'}</td>
                  <td>{top.source}</td>
                  <td>{top.destination}</td>
                  <td>{top.protocol}</td>
                  <td>{LAYER_LABEL[top.layer]}</td>
                  <td>{top.info}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {entries.length === 0 && <p className="muted">Aucune donnée échangée pour l’instant.</p>}
      </div>
      {current && (
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
      )}
    </div>
  );
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

export function RouterWindow({ router }: { router: Router }) {
  const session = useSession();
  return (
    <div>
      <Section
        title="Table de routage"
        actions={
          <button
            type="button"
            onClick={() => {
              session.openWindow({ type: 'capture', deviceId: router.id });
            }}
          >
            Échanges de données
          </button>
        }
      >
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
            {router.stack.routes().map((r, i) => (
              <tr key={i}>
                <td>{formatIp(r.destination)}</td>
                <td>{formatIp(r.mask)}</td>
                <td>{r.gateway === IP_ANY ? 'directe' : formatIp(r.gateway)}</td>
                <td>eth{r.iface}</td>
                <td>{r.metric}</td>
                <td>{SOURCE_LABEL[r.source]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Table ARP">
        <table className="table">
          <tbody>
            {router.stack.arp.entries.map((e) => (
              <tr key={e.ip}>
                <td>{formatIp(e.ip)}</td>
                <td>
                  <code>{e.mac}</code>
                </td>
                <td>eth{e.iface}</td>
              </tr>
            ))}
            {router.stack.arp.entries.length === 0 && (
              <tr>
                <td className="muted">Vide.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

export function HelpWindow() {
  return (
    <div className="help">
      <h2>Prise en main</h2>
      <ol>
        <li>
          <b>Conception</b> : ajoutez des équipements depuis la palette (clic ou glisser-déposer), puis
          reliez-les avec l’outil <b>Câble</b> (cliquer sur le premier puis sur le second équipement).
        </li>
        <li>
          Sélectionnez un équipement pour le configurer dans le panneau du bas (adresse IP, masque,
          passerelle…).
        </li>
        <li>
          <b>Wi-Fi</b> : chaque switch a un <b>nom Wi-Fi (SSID)</b>. Réglez un ordinateur ou un portable en{' '}
          <b>Sans fil (Wi-Fi)</b> puis choisissez ce nom dans sa configuration pour le connecter.
        </li>
        <li>
          Comme dans Filius, le <b>clic droit</b> sur un équipement, un câble ou une annotation ouvre un menu
          : configurer, supprimer les câbles, supprimer ; taille, style et couleur d’un texte ; en simulation,
          bureau et échanges de données de chaque interface. Au clavier : touche Menu ou Maj+F10.
        </li>
        <li>
          Passez en mode <b>Simulation</b> : cliquez sur un ordinateur pour ouvrir son bureau, installer des
          logiciels et lancer la <b>ligne de commande</b> (<code>ipconfig</code>, <code>ping</code>,{' '}
          <code>traceroute</code>…).
        </li>
        <li>
          Les paquets circulent sur les câbles. La fenêtre <b>Échanges de données</b> montre chaque trame,
          couche par couche. Les trames sont montrées au ralenti sur les câbles ; le curseur <b>Vitesse</b>{' '}
          règle ce ralenti.
        </li>
        <li>
          Enregistrez votre travail avec <b>Enregistrer</b> (fichier <code>.reseaulab.json</code>). Le réseau
          est aussi sauvegardé automatiquement dans ce navigateur.
        </li>
        <li>
          <b>Ouvrir…</b> accepte aussi les projets Filius (<code>.fls</code>) : équipements, configuration,
          câbles, pages web, enregistrements DNS et annotations sont repris.
        </li>
      </ol>
      <h3>Logiciels disponibles</h3>
      <p>
        Navigateur et serveur web (HTTP), serveur DNS, serveur DHCP, messagerie et serveur de messagerie
        (SMTP/POP3), client et serveur écho (TCP), pare-feu, éditeur de texte, explorateur de fichiers,
        visionneuse d’images.
      </p>
      <h3>Routeurs</h3>
      <p>
        Chaque interface (eth0, eth1…) reçoit une adresse dans le réseau auquel elle est reliée. Ajoutez des
        routes statiques ou activez le routage automatique <b>RIP</b>.
      </p>
    </div>
  );
}
