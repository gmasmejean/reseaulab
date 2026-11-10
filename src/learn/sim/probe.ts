import { Box } from '../../engine/devices/box';
import { Host } from '../../engine/devices/host';
import { Router } from '../../engine/devices/router';
import type { DropEvent } from '../../engine/net/drop';
import type { Network, TransmitEvent } from '../../engine/network';
import { cloneNetwork } from '../../project/clone';

/* Off-screen simulation of a copy of the network: the real engine answers
 * questions such as « can A reach B? » in a few milliseconds of real time,
 * without touching the network the pupil is looking at. */

/** Virtual time given to DHCP and RIP to settle before a probe. */
export const WARM_UP_MS = 10_000;
/** Events allowed in one run: a guard against endless traffic. */
export const MAX_EVENTS = 200_000;

export type RunStatus = 'done' | 'timeout' | 'overflow';

/**
 * Runs the simulation until `isDone`, for at most `maxVirtualMs` of virtual
 * time and `maxEvents` events. Unlike `runUntilIdle`, it copes with periodic
 * traffic (RIP), which never lets the simulation come to rest.
 */
export function runBounded(
  sim: Network,
  isDone: () => boolean,
  maxVirtualMs: number,
  maxEvents = MAX_EVENTS,
): RunStatus {
  const scheduler = sim.scheduler;
  const deadline = scheduler.now + maxVirtualMs;
  let events = 0;
  for (;;) {
    if (isDone()) return 'done';
    const next = scheduler.nextEventTime();
    if (next === null || next > deadline) {
      scheduler.runUntil(deadline);
      return isDone() ? 'done' : 'timeout';
    }
    events += scheduler.runUntil(next);
    if (events > maxEvents) return 'overflow';
  }
}

export interface Probe {
  /** Running copy of the network. */
  readonly sim: Network;
  /** Packets given up on, and frames sent, since the warm-up. */
  readonly drops: DropEvent[];
  readonly transmits: TransmitEvent[];
  /** The copy produced endless traffic while starting: its results mean nothing. */
  readonly overflow: boolean;
}

/**
 * Copies the network and starts the copy. When hosts wait for a DHCP address
 * or routers exchange RIP routes, virtual time passes first so that they are
 * ready, as they would be when a pupil types a command.
 */
export function prepareProbe(network: Network): Probe {
  const sim = cloneNetwork(network);
  const drops: DropEvent[] = [];
  const transmits: TransmitEvent[] = [];
  sim.events.on('drop', (d) => drops.push(d));
  sim.events.on('transmit', (t) => transmits.push(t));
  sim.start();
  const settles = sim.devices.some(
    (d) => (d instanceof Host && d.config.useDhcp) || ((d instanceof Router || d instanceof Box) && d.rip),
  );
  const status = settles ? runBounded(sim, () => false, WARM_UP_MS) : 'done';
  drops.length = 0;
  transmits.length = 0;
  return { sim, drops, transmits, overflow: status === 'overflow' };
}
