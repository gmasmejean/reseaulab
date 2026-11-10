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
          passerelle…). <b>Ctrl+Z</b> annule la dernière modification, <b>Ctrl+Y</b> la rétablit.
        </li>
        <li>
          Le plan s’ajuste à l’écran. Les boutons − / + / <b>Ajuster</b>, en bas à droite, et{' '}
          <b>Ctrl + molette</b> changent le zoom.
        </li>
        <li>
          <b>Wi-Fi</b> : chaque switch (aussi appelé commutateur) a un <b>nom Wi-Fi (SSID)</b>. Réglez un
          ordinateur ou un portable en <b>Sans fil (Wi-Fi)</b> puis choisissez ce nom dans sa configuration
          pour le connecter.
        </li>
        <li>
          Comme dans Filius, le <b>clic droit</b> sur un équipement, un câble ou une annotation ouvre un menu
          : configurer, supprimer les câbles, supprimer ; taille, style et couleur d’un texte ; en simulation,
          bureau et échanges de données de chaque interface. Au clavier : touche Menu ou Maj+F10.
        </li>
        <li>
          Passez en mode <b>Simulation</b> : cliquez sur un ordinateur pour ouvrir son bureau, installer des
          logiciels et lancer la <b>ligne de commande</b> (<code>ipconfig</code>, <code>ping</code>,{' '}
          <code>traceroute</code>…). Déplacez une fenêtre par sa barre de titre ; <b>Échap</b> ferme celle du
          dessus, <b>Ranger les fenêtres</b> et <b>Tout fermer</b> sont en bas de l’écran.
        </li>
        <li>
          Les trames circulent sur les câbles, au ralenti pour qu’on puisse les suivre ; le curseur{' '}
          <b>Vitesse</b> règle ce ralenti. Chacune porte le nom de son protocole : la <b>légende</b>, en bas à
          gauche du plan, explique les couleurs. <b>Pause</b> puis <b>Trame suivante</b> les font avancer
          câble par câble. La fenêtre <b>Échanges de données</b> montre chaque trame, couche par couche.
        </li>
        <li>
          Ça ne marche pas ? Le bouton <b>Vérifier</b> repère les erreurs de configuration (un « ! » marque
          l’équipement sur le plan) et teste une communication en expliquant ce qui la bloque. Après un{' '}
          <code>ping</code> raté, la ligne de commande propose <b>Pourquoi ça ne marche pas ?</b>
        </li>
        <li>
          Des trames passent parfois sans que vous ayez rien lancé : les ordinateurs en DHCP demandent leur
          adresse au démarrage et les routeurs en RIP s’échangent leurs routes toutes les 5 s. Cochez{' '}
          <b>Masquer le trafic automatique</b>, près de la légende, pour ne voir que vos propres échanges ;
          ces trames restent listées dans les échanges de données.
        </li>
        <li>
          Enregistrez votre travail avec <b>Enregistrer</b> : donnez un nom au fichier (
          <code>.reseaulab.json</code>), il est placé dans les téléchargements. Le réseau est aussi sauvegardé
          automatiquement dans ce navigateur ; à l’ouverture, RéseauLab demande s’il faut le reprendre.
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
