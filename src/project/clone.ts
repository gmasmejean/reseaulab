import type { Network } from '../engine/network';
import { fromProject, toProject } from './serialize';

/**
 * Independent copy of the design of a network: same devices (same ids),
 * settings, cables and notes; none of the running state (ARP caches, leases,
 * captures). The copy can be simulated off-screen, at full speed, without
 * disturbing the network shown to the pupil.
 */
export function cloneNetwork(network: Network): Network {
  // A deep copy: nothing of the original (rules, records, mailboxes) is shared.
  return fromProject(structuredClone(toProject(network)));
}
