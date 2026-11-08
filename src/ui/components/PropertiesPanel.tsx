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
import { Router } from '../../engine/devices/router';
import type { Network } from '../../engine/network';
import { DEVICE_LABEL } from '../../i18n/fr';
import { useSession } from '../context';
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

function RouteForm({ router }: { router: Router }) {
  const [destination, setDestination] = useState('');
  const [mask, setMask] = useState('');
  const [gateway, setGateway] = useState('');
  const [iface, setIface] = useState(0);
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
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
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

export function PropertiesPanel() {
  const session = useSession();
  const { network: net, selection } = session;
  if (!selection) {
    return (
      <div className="properties empty">
        <p className="muted">
          {session.mode === 'design'
            ? 'Sélectionnez un équipement ou un câble pour le configurer. Double-clic : ouvrir. Suppr : supprimer.'
            : 'Mode simulation : cliquez sur un ordinateur pour ouvrir son bureau, sur un switch ou un routeur pour voir ses tables.'}
        </p>
      </div>
    );
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
