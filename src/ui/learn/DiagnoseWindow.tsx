import { useId, useState } from 'react';
import { IP_ANY, formatIp } from '../../engine/core/ipv4';
import { NetworkNode } from '../../engine/devices/node';
import type { Network } from '../../engine/network';
import { isConfigured } from '../../engine/stack/interface';
import { bySeverity, type Finding, type Severity } from '../../learn/diagnose/findings';
import { tracePath, type TraceResult } from '../../learn/diagnose/trace';
import { useSession } from '../context';
import { findingText, useLint } from './hooks';

const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Erreur',
  warning: 'À vérifier',
  info: 'Conseil',
  success: 'Tout va bien',
};
const SEVERITY_SIGN: Record<Severity, string> = { error: '✘', warning: '⚠', info: 'i', success: '✔' };

/** One finding: what is wrong, why, what to do, and where. */
function FindingCard({ network, finding }: { network: Network; finding: Finding }) {
  const session = useSession();
  const text = findingText(session, finding);
  const device = finding.deviceIds.find((id) => network.device(id));
  const notion = session.notion(text.notion);
  return (
    <li className={`finding ${finding.severity}`}>
      <span className="finding-sign" title={SEVERITY_LABEL[finding.severity]} aria-hidden>
        {SEVERITY_SIGN[finding.severity]}
      </span>
      <div>
        <p className="finding-title">
          <span className="visually-hidden">{SEVERITY_LABEL[finding.severity]} : </span>
          {text.title}
        </p>
        <p>{text.explain}</p>
        {text.fix !== '' && (
          <p>
            <b>Que faire ?</b> {text.fix}
          </p>
        )}
        {notion && (
          <p>
            <button
              type="button"
              className="link"
              onClick={() => {
                session.openKnowledge(notion.id);
              }}
            >
              Fiche : {notion.title}
            </button>
          </p>
        )}
      </div>
      {device !== undefined && (
        <button
          type="button"
          title="Sélectionner l’équipement concerné sur le plan"
          onClick={() => {
            session.select({ kind: 'device', id: device });
          }}
        >
          Montrer
        </button>
      )}
    </li>
  );
}

interface Tested {
  readonly result: TraceResult;
  /** State of the design when the test ran, to tell when it is outdated. */
  readonly version: number;
}

interface Props {
  /** Test asked from elsewhere (a failed ping in a terminal). */
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

/**
 * « Vérifier mon réseau » : tests a communication on a copy of the network and
 * explains a failure, then lists what looks wrong in the configuration.
 */
export function DiagnoseWindow({ from, to }: Props) {
  const session = useSession();
  const network = session.network;
  const id = useId();
  const nodes = network.devices.filter((d): d is NetworkNode => d instanceof NetworkNode);
  const selected = session.selection?.kind === 'device' ? session.selection.id : undefined;
  const [source, setSource] = useState(
    () => from ?? nodes.find((n) => n.id === selected)?.id ?? nodes[0]?.id ?? '',
  );
  const [target, setTarget] = useState(to ?? '');
  const test = (fromId: string, text: string): Tested => ({
    result: tracePath(network, fromId, { kind: 'text', text }),
    version: network.version,
  });
  const [tested, setTested] = useState<Tested | null>(() =>
    from !== undefined && to !== undefined ? test(from, to) : null,
  );
  const lint = bySeverity(useLint());
  // The copy is rebuilt from the design: a test made before a change says nothing any more.
  const outdated = tested !== null && session.mode === 'design' && tested.version !== network.version;
  const sourceExists = nodes.some((n) => n.id === source);

  return (
    <div className="diagnose">
      <section aria-labelledby={`${id}-test`}>
        <h2 id={`${id}-test`}>Tester une communication</h2>
        <p className="muted">
          Le test envoie un « ping » sur une copie de votre réseau : rien ne bouge sur le plan.
        </p>
        <form
          className="diagnose-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (sourceExists) setTested(test(source, target));
          }}
        >
          <div className="field">
            <label htmlFor={`${id}-from`}>Depuis</label>
            <select
              id={`${id}-from`}
              value={sourceExists ? source : ''}
              onChange={(e) => {
                setSource(e.target.value);
              }}
            >
              {!sourceExists && <option value="">— Choisir —</option>}
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-to`}>Vers (équipement, adresse IP ou nom)</label>
            <input
              id={`${id}-to`}
              list={`${id}-targets`}
              value={target}
              placeholder="ex. 192.168.0.2"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setTarget(e.target.value);
              }}
            />
            <datalist id={`${id}-targets`}>
              {nodes
                .filter((n) => n.id !== source)
                .map((n) => {
                  const address = n.stack.interfaces.find(isConfigured)?.ip ?? IP_ANY;
                  return (
                    <option key={n.id} value={n.name}>
                      {address === IP_ANY ? '' : formatIp(address)}
                    </option>
                  );
                })}
            </datalist>
          </div>
          <button type="submit" className="primary" disabled={!sourceExists || target.trim() === ''}>
            Tester
          </button>
        </form>
        {nodes.length === 0 && <p className="muted">Ajoutez d’abord des ordinateurs sur le plan.</p>}
        {tested && (
          <div className="diagnose-result" role="status">
            {outdated && (
              <p className="warning">⚠ Le réseau a changé depuis ce test : cliquez de nouveau sur Tester.</p>
            )}
            <ul className="findings">
              {tested.result.findings.map((finding) => (
                <FindingCard key={finding.code} network={network} finding={finding} />
              ))}
            </ul>
            {tested.result.reached.length > 0 && (
              <p className="diagnose-path">
                <b>Trajet de la demande :</b>{' '}
                {tested.result.reached.map((deviceId) => network.device(deviceId)?.name ?? '?').join(' → ')}
                {tested.result.ok ? ' ✔' : ' ✘'}
              </p>
            )}
          </div>
        )}
      </section>
      <section aria-labelledby={`${id}-lint`}>
        <h2 id={`${id}-lint`}>Vérification du réseau</h2>
        {lint.length === 0 ? (
          <p className="finding-none">
            ✔ Aucun problème repéré dans la configuration
            {network.devices.length === 0 ? ' : le plan est vide.' : '.'}
          </p>
        ) : (
          <>
            <p className="muted">
              {lint.length === 1 ? 'Un point repéré' : `${lint.length} points repérés`} dans la configuration,
              du plus gênant au moins gênant.
            </p>
            <ul className="findings">
              {lint.map((finding, index) => (
                <FindingCard key={`${finding.code}-${index}`} network={network} finding={finding} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
