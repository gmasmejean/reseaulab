import { useMemo } from 'react';
import type { Network } from '../../engine/network';
import type { Finding } from '../../learn/diagnose/findings';
import { lintNetwork } from '../../learn/diagnose/lint';
import { describeFinding, type MessageText } from '../../learn/diagnose/messages.fr';
import { concerns } from '../../learn/profile/capabilities';
import { useSession } from '../context';
import type { Session } from '../session';

/** `version` only tells React when the network changed. */
function lintAt(network: Network, _version: number): readonly Finding[] {
  return lintNetwork(network);
}

/**
 * Problems found in the design of the network. Recomputed after each change
 * in design mode; during a simulation (where the network changes at every
 * frame, but not its design) the result of the last design is kept.
 */
export function useLint(): readonly Finding[] {
  const session = useSession();
  const network = session.network;
  const version = session.mode === 'design' ? network.version : -1;
  const profile = session.profile;
  const all = useMemo(() => lintAt(network, version), [network, version]);
  // A pupil is not told about what the level of the class does not let them correct.
  return useMemo(() => all.filter((f) => concerns(profile, f.code)), [all, profile]);
}

/**
 * Sentences of a finding, with the current names of the devices and the
 * rewording of the teacher's pack.
 */
export function findingText(session: Session, finding: Finding): MessageText {
  return describeFinding(
    finding,
    (id) => session.network.device(id)?.name ?? '(équipement supprimé)',
    session.pack.messages,
  );
}
