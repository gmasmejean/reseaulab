import { useId, useState } from 'react';
import {
  IP_ANY,
  formatIp,
  isValidMask,
  networkOf,
  parseIp,
  prefixToMask,
  type Ipv4,
} from '../../engine/core/ipv4';
import { BOX_WAN, Box } from '../../engine/devices/box';
import type { Device } from '../../engine/devices/device';
import { Host } from '../../engine/devices/host';
import { MAX_ROUTER_INTERFACES, MIN_ROUTER_INTERFACES, Router } from '../../engine/devices/router';
import { Switch } from '../../engine/devices/switch';
import type { CableEnds, Network, Note } from '../../engine/network';
import { DEVICE_LABEL } from '../../i18n/fr';
import { bySeverity } from '../../learn/diagnose/findings';
import { useSession } from '../context';
import { findingText, useLint } from '../learn/hooks';
import { TermHelp } from '../learn/Term';
import { ConfirmDialog } from './ConfirmDialog';
import { Checkbox, IpField, Section, TextField } from './Fields';
import { FirewallEditor } from './FirewallEditor';

/** Mask proposed with a first address, as in Filius: 255.255.255.0. */
const DEFAULT_MASK = prefixToMask(24);

/** Mask to keep with `ip`: the current one, or the usual one when none was given yet. */
function maskFor(ip: Ipv4, mask: Ipv4): Ipv4 {
  return mask === IP_ANY && ip !== IP_ANY ? DEFAULT_MASK : mask;
}

function neighbour(net: Network, device: Device, port: number): string {
  const p = device.ports[port];
  const other = p?.cable?.other(p);
  return other ? (net.device(other.owner.id)?.name ?? '?') : 'non connecté';
}

/** « port 2 », or the socket of a box. */
function portName(device: Device | undefined, port: number): string {
  if (!(device instanceof Box)) return `port ${port}`;
  return port === BOX_WAN ? 'prise Internet' : `prise ${port}`;
}

/** Ends of a wireless link: the Wi-Fi host and its access point, whatever the order. */
function wifiEnds(net: Network, cable: CableEnds) {
  const [a, b] = [net.device(cable.a), net.device(cable.b)];
  const accessPoint = (d: Device | undefined) => (d instanceof Switch || d instanceof Box ? d : undefined);
  const sw = accessPoint(a) ?? accessPoint(b);
  const host = sw === a ? b : a;
  const port = sw === a ? cable.portA : cable.portB;
  return { host, sw, port };
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

/** Wired or Wi-Fi network card, and the Wi-Fi network (SSID) it joins, as in Filius. */
function ConnectionSection({ host }: { host: Host }) {
  const session = useSession();
  const { network } = session;
  // A setting above the level of the class stays visible when it is already in use.
  const wifiOffered = session.can('feature:wifi') || host.wifi;
  const id = useId();
  const [pendingMode, setPendingMode] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cable = host.iface.port.cable;
  const peer = cable ? neighbour(network, host, 0) : null;
  const accessPoint = network.wifiAccessPoint(host);
  const ssids = network.accessPoints.map((s) => s.ssid).sort((a, b) => a.localeCompare(b, 'fr'));
  const chooseMode = (wifi: boolean) => {
    if (wifi === host.wifi) return;
    setError(null);
    if (cable) setPendingMode(wifi);
    else network.setHostWifi(host.id, wifi);
  };
  let status: string;
  if (host.wifi) {
    if (accessPoint) {
      const what = accessPoint instanceof Box ? 'box' : 'switch';
      status = `Connecté au réseau « ${accessPoint.ssid} » (${what} « ${accessPoint.name} »).`;
    } else if (ssids.length === 0) status = 'Aucun réseau Wi-Fi : ajoutez une box ou un switch au plan.';
    else status = 'Non connecté : choisissez un réseau.';
  } else {
    status = peer ? `Relié par câble à « ${peer} ».` : 'Aucun câble : reliez ce poste avec l’outil Câble.';
  }
  return (
    <Section title="Connexion réseau">
      {wifiOffered && (
        <fieldset className="radio-group">
          <legend className="label">Carte réseau</legend>
          {(
            [
              [false, 'Filaire (LAN)'],
              [true, 'Sans fil (Wi-Fi)'],
            ] as const
          ).map(([wifi, label]) => (
            <label key={label}>
              <input
                type="radio"
                name={`${id}-mode`}
                checked={host.wifi === wifi}
                onChange={() => {
                  chooseMode(wifi);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      {host.wifi && (
        <div className="field">
          <label htmlFor={`${id}-ssid`}>Réseau sans fil (SSID)</label>
          <select
            id={`${id}-ssid`}
            value={accessPoint?.ssid ?? ''}
            onChange={(e) => {
              setError(null);
              const ssid = e.target.value;
              try {
                if (ssid === '') {
                  if (cable) network.disconnect(cable.id);
                } else {
                  network.joinWifi(host.id, ssid);
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            <option value="">— Choisir un réseau —</option>
            {ssids.map((ssid) => (
              <option key={ssid} value={ssid}>
                {ssid}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="muted">{status}</p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {pendingMode !== null && (
        <ConfirmDialog
          title={pendingMode ? 'Passer en Wi-Fi ?' : 'Passer en filaire ?'}
          message={
            pendingMode
              ? `Le câble vers « ${peer ?? ''} » sera supprimé. Choisissez ensuite le réseau Wi-Fi du poste.`
              : `La connexion au réseau Wi-Fi « ${accessPoint?.ssid ?? ''} » sera coupée. Reliez ensuite le poste avec l’outil Câble.`
          }
          confirmLabel="Changer"
          onConfirm={() => {
            network.setHostWifi(host.id, pendingMode);
            setPendingMode(null);
          }}
          onCancel={() => {
            setPendingMode(null);
          }}
        />
      )}
    </Section>
  );
}

function SwitchProperties({ device }: { device: Switch }) {
  const session = useSession();
  const { network } = session;
  const wifiClients = device.ports.filter((p) => p.cable?.wireless).length;
  return (
    <div className="properties-grid">
      <Section title="Switch (commutateur)">
        <NameField device={device} />
        <p className="muted">
          {device.ports.filter((p) => p.isConnected).length} port(s) utilisé(s). Un port est ajouté
          automatiquement quand tous sont occupés.
        </p>
      </Section>
      {(session.can('feature:wifi') || wifiClients > 0) && (
        <Section title="Point d’accès Wi-Fi">
          <TextField
            label="Nom Wi-Fi (SSID)"
            term="wifi"
            value={device.ssid}
            hint="Les postes en Wi-Fi rejoignent ce switch en choisissant ce nom. Le changer les déconnecte."
            onCommit={(value) => {
              const problem = network.ssidProblem(value, device.id);
              if (problem) return problem;
              network.setSsid(device.id, value);
              return null;
            }}
          />
          <p className="muted">
            {wifiClients === 0
              ? 'Aucun poste connecté en Wi-Fi.'
              : `${String(wifiClients)} poste(s) connecté(s) en Wi-Fi.`}
          </p>
        </Section>
      )}
    </div>
  );
}

/** A box: its Wi-Fi network, its home side (address, DHCP) and its Internet side. */
function BoxProperties({ box }: { box: Box }) {
  const session = useSession();
  const { network } = session;
  const { wan, lan } = box;
  const dhcp = box.dhcp.config;
  const wifiClients = box.homePorts.filter((p) => p.cable?.wireless).length;
  const plugged = box.homePorts.filter((p) => p.isConnected).length;
  const dhcpOffered = session.can('feature:dhcp-client');
  const internetOffered =
    session.can('feature:gateway') || box.wanPort.isConnected || wan.ip !== IP_ANY || box.gateway !== IP_ANY;
  return (
    <div className="properties-grid">
      <Section title="Box Internet">
        <NameField device={box} />
        <p className="muted">
          Une box réunit un routeur, un switch, un point d’accès Wi-Fi et un serveur DHCP.{' '}
          <TermHelp term="box" label="Box" />
        </p>
        <p className="muted">
          {plugged} terminal(aux) relié(s) côté maison, dont {wifiClients} en Wi-Fi.
        </p>
        {(session.can('feature:wifi') || wifiClients > 0) && (
          <TextField
            label="Nom Wi-Fi (SSID)"
            term="wifi"
            value={box.ssid}
            hint="Les terminaux en Wi-Fi rejoignent la box en choisissant ce nom. Le changer les déconnecte."
            onCommit={(value) => {
              const problem = network.ssidProblem(value, box.id);
              if (problem) return problem;
              network.setSsid(box.id, value);
              return null;
            }}
          />
        )}
      </Section>
      <Section title="Côté maison (réseau local)">
        <div className="field-row">
          <IpField
            label="Adresse IP de la box"
            term="adresse-ip"
            value={lan.ip}
            hint="C’est la passerelle des terminaux de la maison."
            onChange={(ip) => {
              box.setLan({ ip, mask: maskFor(ip, lan.mask) });
            }}
          />
          <IpField
            label="Masque"
            term="masque"
            mask
            value={lan.mask}
            onChange={(mask) => {
              box.setLan({ ip: lan.ip, mask });
            }}
          />
        </div>
        {dhcpOffered && (
          <>
            <Checkbox
              label="Distribuer les adresses (serveur DHCP)"
              term="dhcp"
              checked={box.dhcp.active}
              onChange={(active) => {
                box.dhcp.setActive(active);
              }}
            />
            <div className="field-row">
              <IpField
                label="Première adresse distribuée"
                value={dhcp.rangeStart}
                disabled={!box.dhcp.active}
                onChange={(rangeStart) => {
                  box.dhcp.updateConfig({ rangeStart });
                }}
              />
              <IpField
                label="Dernière adresse distribuée"
                value={dhcp.rangeEnd}
                disabled={!box.dhcp.active}
                onChange={(rangeEnd) => {
                  box.dhcp.updateConfig({ rangeEnd });
                }}
              />
            </div>
            {(session.can('feature:dns-field') || dhcp.dns !== IP_ANY) && (
              <IpField
                label="Serveur DNS distribué"
                term="dns"
                value={dhcp.dns}
                disabled={!box.dhcp.active}
                onChange={(dns) => {
                  box.dhcp.updateConfig({ dns });
                }}
              />
            )}
          </>
        )}
      </Section>
      {internetOffered && (
        <Section title="Côté Internet">
          <p className="muted">
            Prise Internet :{' '}
            {box.wanPort.isConnected ? `reliée à « ${neighbour(network, box, BOX_WAN)} »` : 'non reliée'}.
          </p>
          <div className="field-row">
            <IpField
              label="Adresse IP côté Internet"
              term="adresse-ip"
              value={wan.ip}
              onChange={(ip) => {
                box.setWan({ ip, mask: maskFor(ip, wan.mask) });
              }}
            />
            <IpField
              label="Masque côté Internet"
              term="masque"
              mask
              value={wan.mask}
              onChange={(mask) => {
                box.setWan({ ip: wan.ip, mask });
              }}
            />
          </div>
          <IpField
            label="Passerelle vers Internet"
            term="passerelle"
            value={box.gateway}
            hint="L’adresse du routeur du fournisseur d’accès."
            onChange={(gateway) => {
              box.setGateway(gateway);
            }}
          />
          {(session.can('feature:rip') || box.rip) && (
            <Checkbox
              label="Routage automatique (RIP)"
              checked={box.rip}
              onChange={(enabled) => {
                box.ripService.setEnabled(enabled);
              }}
            />
          )}
        </Section>
      )}
    </div>
  );
}

function HostProperties({ host }: { host: Host }) {
  const session = useSession();
  const c = host.config;
  const dhcpOffered = session.can('feature:dhcp-client') || c.useDhcp;
  const gatewayOffered = session.can('feature:gateway') || c.gateway !== IP_ANY;
  const dnsOffered = session.can('feature:dns-field') || c.dns !== IP_ANY;
  return (
    <div className="properties-grid">
      <Section title={DEVICE_LABEL[host.kind]}>
        <NameField device={host} />
        <div className="field">
          <span className="field-label">
            <span className="label">Adresse MAC</span>
            <TermHelp term="adresse-mac" label="Adresse MAC" />
          </span>
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
      <ConnectionSection host={host} />
      <Section title="Configuration IP">
        {dhcpOffered && (
          <Checkbox
            label="Configuration automatique (DHCP)"
            term="dhcp"
            checked={c.useDhcp}
            onChange={(useDhcp) => {
              host.updateConfig({ useDhcp });
            }}
          />
        )}
        <div className="field-row">
          <IpField
            label="Adresse IP"
            term="adresse-ip"
            value={c.ip}
            disabled={c.useDhcp}
            onChange={(ip) => {
              host.updateConfig({ ip, mask: maskFor(ip, c.mask) });
            }}
          />
          <IpField
            label="Masque"
            term="masque"
            mask
            value={c.mask}
            disabled={c.useDhcp}
            onChange={(mask) => {
              host.updateConfig({ mask });
            }}
          />
        </div>
        {(gatewayOffered || dnsOffered) && (
          <div className="field-row">
            {gatewayOffered && (
              <IpField
                label="Passerelle"
                term="passerelle"
                value={c.gateway}
                disabled={c.useDhcp}
                onChange={(gateway) => {
                  host.updateConfig({ gateway });
                }}
              />
            )}
            {dnsOffered && (
              <IpField
                label="Serveur DNS"
                term="dns"
                value={c.dns}
                disabled={c.useDhcp}
                onChange={(dns) => {
                  host.updateConfig({ dns });
                }}
              />
            )}
          </div>
        )}
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
  const session = useSession();
  const { network } = session;
  const [chosenTab, setTab] = useState<'interfaces' | 'routes' | 'firewall'>('interfaces');
  // Tabs above the level of the class stay when the router already uses them.
  const ripOffered = session.can('feature:rip') || router.rip;
  const offered = {
    interfaces: true,
    routes: session.can('feature:static-routes') || ripOffered || router.staticRoutes.length > 0,
    firewall: session.can('feature:router-firewall') || router.firewall.enabled,
  };
  const tab = offered[chosenTab] ? chosenTab : 'interfaces';
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
        )
          .filter(([id]) => offered[id])
          .map(([id, label]) => (
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
                          router.setInterface(i, { ip, mask: maskFor(ip, iface.mask) });
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
          {ripOffered && (
            <Checkbox
              label="Routage automatique (RIP) : les routeurs s’échangent leurs routes"
              term="table-de-routage"
              checked={router.rip}
              onChange={(v) => {
                router.ripService.setEnabled(v);
              }}
            />
          )}
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

/** What the verification of the network found about this device, with what to do. */
function DeviceFindings({ deviceId }: { deviceId: string }) {
  const session = useSession();
  const findings = bySeverity(useLint().filter((f) => f.deviceIds.includes(deviceId)));
  if (findings.length === 0) return null;
  return (
    <ul className="device-findings" aria-label="Points à vérifier">
      {findings.map((finding, index) => {
        const text = findingText(session, finding);
        return (
          <li key={`${finding.code}-${index}`} className={finding.severity === 'info' ? 'hint' : 'warning'}>
            {finding.severity === 'info' ? 'Conseil : ' : '⚠ '}
            <b>{text.title}.</b> {text.fix}
          </li>
        );
      })}
    </ul>
  );
}

/** In simulation mode the panel is a single line: what the selected device can show, and the windows. */
function SimulationBar({ device }: { device: Device | null }) {
  const session = useSession();
  return (
    <div className="properties simulation-bar">
      {device ? (
        <>
          <strong>{device.name}</strong>
          {device instanceof Host && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                session.openWindow({ type: 'desktop', deviceId: device.id });
              }}
            >
              Afficher le bureau
            </button>
          )}
          {((device instanceof Router && session.can('feature:tables')) ||
            (device instanceof Box &&
              (session.can('feature:tables') || session.can('feature:mac-table')))) && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                session.openWindow({ type: 'router', deviceId: device.id });
              }}
            >
              {device instanceof Box ? 'Afficher les tables de la box' : 'Afficher les tables du routeur'}
            </button>
          )}
          {device.kind === 'switch' && session.can('feature:mac-table') && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                session.openWindow({ type: 'switch', deviceId: device.id });
              }}
            >
              Afficher la table des adresses MAC
            </button>
          )}
          {device.kind !== 'switch' && session.can('feature:capture') && (
            <button
              type="button"
              onClick={() => {
                session.openWindow({ type: 'capture', deviceId: device.id });
              }}
            >
              Afficher les échanges de données
            </button>
          )}
          {device instanceof Host && session.can('feature:tables') && (
            <button
              type="button"
              title="Table de routage et table ARP de ce poste"
              onClick={() => {
                session.openWindow({ type: 'router', deviceId: device.id });
              }}
            >
              Afficher les tables
            </button>
          )}
        </>
      ) : (
        <p className="muted">
          Mode simulation : cliquez sur un ordinateur pour ouvrir son bureau, sur un switch ou un routeur pour
          voir ses tables.
        </p>
      )}
      {session.windows.length > 0 && (
        <div className="window-actions">
          <button
            type="button"
            title="Replacer les fenêtres en cascade, à droite du plan"
            onClick={() => {
              session.arrangeWindows();
            }}
          >
            Ranger les fenêtres
          </button>
          <button
            type="button"
            title="Fermer toutes les fenêtres (Échap ferme celle du dessus)"
            onClick={() => {
              session.closeAllWindows();
            }}
          >
            Tout fermer
          </button>
        </div>
      )}
    </div>
  );
}

export function PropertiesPanel() {
  const session = useSession();
  const { network: net, selection } = session;
  if (session.mode === 'simulation') {
    const device = selection?.kind === 'device' ? net.device(selection.id) : undefined;
    return <SimulationBar device={device ?? null} />;
  }
  if (!selection) {
    return (
      <div className="properties empty">
        <p className="muted">
          Sélectionnez un équipement ou un câble pour le configurer. Double-clic : ouvrir. Clic droit : menu.
          Suppr : supprimer. Ctrl+Z : annuler.
        </p>
      </div>
    );
  }
  if (selection.kind === 'note') {
    const note = net.note(selection.id);
    return note ? <NoteProperties note={note} /> : null;
  }
  if (selection.kind === 'cable') {
    const cable = net.cables.find((c) => c.id === selection.id);
    if (!cable) return null;
    return (
      <div className="properties">
        <Section
          title={cable.wireless ? 'Connexion Wi-Fi' : 'Câble'}
          actions={
            <button
              type="button"
              className="danger"
              onClick={() => {
                session.deleteSelection();
              }}
            >
              {cable.wireless ? 'Déconnecter le Wi-Fi' : 'Supprimer le câble'}
            </button>
          }
        >
          {cable.wireless ? (
            (() => {
              const { host, sw, port } = wifiEnds(net, cable);
              return (
                <p>
                  <b>{host?.name}</b> est connecté sans fil au réseau <b>« {sw?.ssid} »</b> de{' '}
                  <b>{sw?.name}</b> ({portName(sw, port)}).
                </p>
              );
            })()
          ) : (
            <p>
              Relie <b>{net.device(cable.a)?.name}</b> ({portName(net.device(cable.a), cable.portA)}) à{' '}
              <b>{net.device(cable.b)?.name}</b> ({portName(net.device(cable.b), cable.portB)}).
            </p>
          )}
        </Section>
      </div>
    );
  }
  const device = net.device(selection.id);
  if (!device) return null;
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
      {device instanceof Switch && <SwitchProperties device={device} />}
      {device instanceof Box && <BoxProperties box={device} />}
      <DeviceFindings deviceId={device.id} />
    </div>
  );
}
