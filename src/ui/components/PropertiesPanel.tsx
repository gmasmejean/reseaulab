import { useState } from 'react';
import {
  IP_ANY,
  formatIp,
  isUsableHostAddress,
  isValidMask,
  networkOf,
  parseIp,
  sameNetwork,
} from '../../engine/core/ipv4';
import type { Device } from '../../engine/devices/device';
import { Host } from '../../engine/devices/host';
import { MAX_ROUTER_INTERFACES, MIN_ROUTER_INTERFACES, Router } from '../../engine/devices/router';
import type { Network, Note } from '../../engine/network';
import { DEVICE_LABEL } from '../../i18n/fr';
import { useSession } from '../context';
import { ConfirmDialog } from './ConfirmDialog';
import { Checkbox, IpField, Section, TextField } from './Fields';
import { FirewallEditor } from './FirewallEditor';

function neighbour(net: Network, device: Device, port: number): string {
  const p = device.ports[port];
  const other = p?.cable?.other(p);
  return other ? (net.device(other.owner.id)?.name ?? '?') : 'non connecté';
}

function NameField({ device }: { device: Device }) {
  const { network } = useSession();
  return (
    <TextField
      label="Nom"
      value={device.name}
      onCommit={(value) => {
        if (value.trim() === '') return 'Le nom ne peut pas être vide.';
        if (value.trim().length > 64) return '64 caractères maximum.';
        network.rename(device.id, value);
        return null;
      }}
    />
  );
}

function HostProperties({ host }: { host: Host }) {
  const c = host.config;
  const warnings: string[] = [];
  if (!c.useDhcp) {
    if (c.ip === IP_ANY) warnings.push('Aucune adresse IP : ce poste ne pourra pas communiquer.');
    else if (c.mask === IP_ANY) warnings.push('Indiquez un masque de sous-réseau.');
    else if (!isUsableHostAddress(c.ip, c.mask))
      warnings.push(`${formatIp(c.ip)} est l’adresse du réseau ou de diffusion : choisissez-en une autre.`);
    if (c.gateway !== IP_ANY && c.mask !== IP_ANY && !sameNetwork(c.ip, c.gateway, c.mask))
      warnings.push('La passerelle doit appartenir au même réseau que le poste.');
  }
  return (
    <div className="properties-grid">
      <Section title={DEVICE_LABEL[host.kind]}>
        <NameField device={host} />
        <div className="field">
          <span className="label">Adresse MAC</span>
          <code>{host.mac}</code>
        </div>
        <Checkbox
          label="Afficher l’adresse IP comme nom"
          checked={host.showIpAsName}
          onChange={(v) => {
            host.setShowIpAsName(v);
          }}
        />
      </Section>
      <Section title="Configuration IP">
        <Checkbox
          label="Configuration automatique (DHCP)"
          checked={c.useDhcp}
          onChange={(useDhcp) => {
            host.updateConfig({ useDhcp });
          }}
        />
        <div className="field-row">
          <IpField
            label="Adresse IP"
            value={c.ip}
            disabled={c.useDhcp}
            onChange={(ip) => {
              host.updateConfig({ ip });
            }}
          />
          <IpField
            label="Masque"
            mask
            value={c.mask}
            disabled={c.useDhcp}
            onChange={(mask) => {
              host.updateConfig({ mask });
            }}
          />
        </div>
        <div className="field-row">
          <IpField
            label="Passerelle"
            value={c.gateway}
            disabled={c.useDhcp}
            onChange={(gateway) => {
              host.updateConfig({ gateway });
            }}
          />
          <IpField
            label="Serveur DNS"
            value={c.dns}
            disabled={c.useDhcp}
            onChange={(dns) => {
              host.updateConfig({ dns });
            }}
          />
        </div>
        {warnings.map((w) => (
          <p key={w} className="warning">
            ⚠ {w}
          </p>
        ))}
      </Section>
    </div>
  );
}

/** What removing interface `index` would lose, as sentences (empty: nothing). */
function removalConsequences(net: Network, router: Router, index: number): string[] {
  const iface = router.interfaces[index];
  if (!iface) return [];
  const result: string[] = [];
  if (iface.port.isConnected) {
    result.push(`Le câble vers « ${neighbour(net, router, index)} » sera supprimé.`);
  }
  if (iface.ip !== IP_ANY) result.push(`Son adresse ${formatIp(iface.ip)} sera perdue.`);
  const routes = router.staticRoutes.filter((r) => r.iface === index).length;
  if (routes > 0) {
    result.push(
      routes === 1
        ? 'La route statique qui l’utilise sera supprimée.'
        : `Les ${routes} routes statiques qui l’utilisent seront supprimées.`,
    );
  }
  if (result.length > 0 && index < router.interfaces.length - 1) {
    result.push(`Les interfaces suivantes seront renumérotées à partir de eth${index}.`);
  }
  return result;
}

function RouteForm({ router }: { router: Router }) {
  const [destination, setDestination] = useState('');
  const [mask, setMask] = useState('');
  const [gateway, setGateway] = useState('');
  const [chosenIface, setIface] = useState(0);
  // The chosen interface may have been removed meanwhile.
  const iface = Math.min(chosenIface, router.interfaces.length - 1);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        const d = parseIp(destination);
        const m = parseIp(mask);
        const g = gateway.trim() === '' ? IP_ANY : parseIp(gateway);
        if (d === null || g === null) {
          setError('Adresse invalide.');
          return;
        }
        if (m === null || !isValidMask(m)) {
          setError('Masque invalide.');
          return;
        }
        setError(null);
        router.setStaticRoutes([
          ...router.staticRoutes,
          { destination: networkOf(d, m), mask: m, gateway: g, iface },
        ]);
        setDestination('');
        setMask('');
        setGateway('');
      }}
    >
      <input
        aria-label="Réseau de destination"
        placeholder="réseau (ex. 10.0.3.0)"
        value={destination}
        onChange={(e) => {
          setDestination(e.target.value);
        }}
      />
      <input
        aria-label="Masque de la route"
        placeholder="masque"
        value={mask}
        onChange={(e) => {
          setMask(e.target.value);
        }}
      />
      <input
        aria-label="Passerelle de la route"
        placeholder="passerelle (vide = directe)"
        value={gateway}
        onChange={(e) => {
          setGateway(e.target.value);
        }}
      />
      <select
        aria-label="Interface de sortie"
        value={iface}
        onChange={(e) => {
          setIface(Number(e.target.value));
        }}
      >
        {router.interfaces.map((_, i) => (
          <option key={i} value={i}>
            eth{i}
          </option>
        ))}
      </select>
      <button type="submit" className="primary">
        Ajouter la route
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}

function RouterProperties({ router }: { router: Router }) {
  const { network } = useSession();
  const [tab, setTab] = useState<'interfaces' | 'routes' | 'firewall'>('interfaces');
  const [pendingRemoval, setPendingRemoval] = useState<{
    readonly index: number;
    readonly consequences: readonly string[];
  } | null>(null);
  return (
    <div>
      <div className="tabs" role="tablist">
        {(
          [
            ['interfaces', 'Interfaces'],
            ['routes', 'Routage'],
            ['firewall', 'Pare-feu'],
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
      {tab === 'interfaces' && (
        <div className="properties-grid">
          <Section title="Routeur">
            <NameField device={router} />
          </Section>
          <Section title="Interfaces">
            <table className="table">
              <thead>
                <tr>
                  <th>Interface</th>
                  <th>Relié à</th>
                  <th>Adresse IP</th>
                  <th>Masque</th>
                  <th>MAC</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {router.interfaces.map((iface, i) => (
                  <tr key={i}>
                    <td>eth{i}</td>
                    <td>{neighbour(network, router, i)}</td>
                    <td>
                      <IpField
                        label={`IP eth${i}`}
                        value={iface.ip}
                        onChange={(ip) => {
                          router.setInterface(i, { ip, mask: iface.mask });
                        }}
                      />
                    </td>
                    <td>
                      <IpField
                        label={`Masque eth${i}`}
                        mask
                        value={iface.mask}
                        onChange={(mask) => {
                          router.setInterface(i, { ip: iface.ip, mask });
                        }}
                      />
                    </td>
                    <td>
                      <code>{iface.port.mac}</code>
                    </td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Retirer eth${i}`}
                        title={
                          router.canRemoveInterface
                            ? `Retirer eth${i}`
                            : `Un routeur garde au moins ${MIN_ROUTER_INTERFACES} interfaces`
                        }
                        disabled={!router.canRemoveInterface}
                        onClick={() => {
                          const consequences = removalConsequences(network, router, i);
                          if (consequences.length === 0) network.removeRouterInterface(router.id, i);
                          else setPendingRemoval({ index: i, consequences });
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="button-row table-actions">
              <button
                type="button"
                disabled={!router.canAddInterface}
                onClick={() => {
                  network.addRouterInterface(router.id);
                }}
              >
                Ajouter une interface
              </button>
              <span className="muted small">
                De {MIN_ROUTER_INTERFACES} à {MAX_ROUTER_INTERFACES} interfaces.
              </span>
            </div>
          </Section>
          {pendingRemoval && (
            <ConfirmDialog
              title={`Retirer l’interface eth${pendingRemoval.index} ?`}
              message={pendingRemoval.consequences.join(' ')}
              confirmLabel="Retirer"
              danger
              onConfirm={() => {
                network.removeRouterInterface(router.id, pendingRemoval.index);
                setPendingRemoval(null);
              }}
              onCancel={() => {
                setPendingRemoval(null);
              }}
            />
          )}
        </div>
      )}
      {tab === 'routes' && (
        <Section title="Routes statiques">
          <Checkbox
            label="Routage automatique (RIP) : les routeurs s’échangent leurs routes"
            checked={router.rip}
            onChange={(v) => {
              router.ripService.setEnabled(v);
            }}
          />
          <p className="muted small">
            Les réseaux directement reliés aux interfaces sont ajoutés automatiquement.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Destination</th>
                <th>Masque</th>
                <th>Passerelle</th>
                <th>Interface</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {router.staticRoutes.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Aucune route statique.
                  </td>
                </tr>
              )}
              {router.staticRoutes.map((r, i) => (
                <tr key={i}>
                  <td>{formatIp(r.destination)}</td>
                  <td>{formatIp(r.mask)}</td>
                  <td>{r.gateway === IP_ANY ? 'directe' : formatIp(r.gateway)}</td>
                  <td>eth{r.iface}</td>
                  <td>
                    <button
                      type="button"
                      aria-label="Supprimer la route"
                      onClick={() => {
                        router.setStaticRoutes(router.staticRoutes.filter((_, j) => j !== i));
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <RouteForm router={router} />
        </Section>
      )}
      {tab === 'firewall' && (
        <Section title="Pare-feu du routeur">
          <FirewallEditor
            firewall={router.firewall}
            scope="traversant le routeur"
            onChange={() => {
              router.changed();
            }}
          />
        </Section>
      )}
    </div>
  );
}

function NoteProperties({ note }: { note: Note }) {
  const session = useSession();
  const net = session.network;
  const textId = `note-text-${note.id}`;
  const colorId = `note-color-${note.id}`;
  return (
    <div className="properties">
      <div className="properties-actions">
        <button
          type="button"
          className="danger"
          onClick={() => {
            session.deleteSelection();
          }}
        >
          Supprimer
        </button>
      </div>
      <div className="properties-grid">
        <Section title={note.kind === 'zone' ? 'Zone' : 'Texte'}>
          <div className="field">
            <label htmlFor={textId}>{note.kind === 'zone' ? 'Titre (facultatif)' : 'Texte'}</label>
            <textarea
              id={textId}
              rows={3}
              value={note.text}
              maxLength={2000}
              onChange={(e) => {
                net.updateNote(note.id, { text: e.target.value });
              }}
            />
          </div>
        </Section>
        <Section title="Apparence">
          <div className="field">
            <label htmlFor={colorId}>{note.kind === 'zone' ? 'Couleur de fond' : 'Couleur du texte'}</label>
            <input
              id={colorId}
              type="color"
              value={note.color}
              onChange={(e) => {
                net.updateNote(note.id, { color: e.target.value });
              }}
            />
          </div>
          <TextField
            label="Taille du texte"
            type="number"
            value={String(note.fontSize)}
            onCommit={(value) => {
              const size = Number(value);
              if (!Number.isInteger(size) || size < 8 || size > 96) return 'Entre 8 et 96.';
              net.updateNote(note.id, { fontSize: size });
              return null;
            }}
          />
          <Checkbox
            label="Gras"
            checked={note.bold}
            onChange={(bold) => {
              net.updateNote(note.id, { bold });
            }}
          />
          <Checkbox
            label="Italique"
            checked={note.italic}
            onChange={(italic) => {
              net.updateNote(note.id, { italic });
            }}
          />
          <p className="muted">Glissez pour déplacer ; la poignée en bas à droite redimensionne.</p>
        </Section>
      </div>
    </div>
  );
}

export function PropertiesPanel() {
  const session = useSession();
  const { network: net, selection } = session;
  if (!selection) {
    return (
      <div className="properties empty">
        <p className="muted">
          {session.mode === 'design'
            ? 'Sélectionnez un équipement ou un câble pour le configurer. Double-clic : ouvrir. Clic droit : menu. Suppr : supprimer.'
            : 'Mode simulation : cliquez sur un ordinateur pour ouvrir son bureau, sur un switch ou un routeur pour voir ses tables.'}
        </p>
      </div>
    );
  }
  if (selection.kind === 'note') {
    const note = net.note(selection.id);
    return note && session.mode === 'design' ? <NoteProperties note={note} /> : null;
  }
  if (selection.kind === 'cable') {
    const cable = net.cables.find((c) => c.id === selection.id);
    if (!cable) return null;
    return (
      <div className="properties">
        <Section
          title="Câble"
          actions={
            <button
              type="button"
              className="danger"
              onClick={() => {
                session.deleteSelection();
              }}
            >
              Supprimer le câble
            </button>
          }
        >
          <p>
            Relie <b>{net.device(cable.a)?.name}</b> (port {cable.portA}) à <b>{net.device(cable.b)?.name}</b>{' '}
            (port {cable.portB}).
          </p>
        </Section>
      </div>
    );
  }
  const device = net.device(selection.id);
  if (!device) return null;
  if (session.mode === 'simulation') {
    return (
      <div className="properties">
        <Section title={device.name}>
          <div className="button-row">
            {device instanceof Host && (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  session.openWindow({ type: 'desktop', deviceId: device.id });
                }}
              >
                Ouvrir le bureau
              </button>
            )}
            {device instanceof Router && (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  session.openWindow({ type: 'router', deviceId: device.id });
                }}
              >
                Tables du routeur
              </button>
            )}
            {device.kind === 'switch' ? (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  session.openWindow({ type: 'switch', deviceId: device.id });
                }}
              >
                Table des adresses MAC
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  session.openWindow({ type: 'capture', deviceId: device.id });
                }}
              >
                Échanges de données
              </button>
            )}
          </div>
        </Section>
      </div>
    );
  }
  return (
    <div className="properties">
      <div className="properties-actions">
        <button
          type="button"
          className="danger"
          onClick={() => {
            session.deleteSelection();
          }}
        >
          Supprimer
        </button>
      </div>
      {device instanceof Host && <HostProperties host={device} />}
      {device instanceof Router && <RouterProperties router={device} />}
      {device.kind === 'switch' && (
        <div className="properties-grid">
          <Section title="Switch">
            <NameField device={device} />
            <p className="muted">
              {device.ports.filter((p) => p.isConnected).length} port(s) utilisé(s). Un port est ajouté
              automatiquement quand tous sont occupés.
            </p>
          </Section>
        </div>
      )}
    </div>
  );
}
