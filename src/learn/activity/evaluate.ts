import {
  IP_ANY,
  formatIp,
  networkOf,
  parseIp,
  prefixToMask,
  sameNetwork,
  type Ipv4,
} from '../../engine/core/ipv4';
import type { Device } from '../../engine/devices/device';
import { Host } from '../../engine/devices/host';
import { Router } from '../../engine/devices/router';
import { Switch } from '../../engine/devices/switch';
import type { Network } from '../../engine/network';
import { httpGet, type HttpResult } from '../../engine/services/http';
import { fold } from '../content/merge';
import { lintNetwork } from '../diagnose/lint';
import { segments } from '../diagnose/topology';
import { tracePath, type TraceTarget } from '../diagnose/trace';
import { CAPABILITIES, type Capability, type ProfileSpec } from '../profile/capabilities';
import { prepareProbe, runBounded } from '../sim/probe';
import {
  familyOf,
  objectivesOf,
  type Activity,
  type Check,
  type DeviceRef,
  type Objective,
  type Work,
} from './schema';

/* Evaluation of the objectives of an activity. Three families of checks:
 * - state: read on the design of the network, as often as wanted;
 * - probe: asked to the real engine on a copy of the network (a ping, a web
 *   page), when the pupil asks to check the work;
 * - journal: something the pupil did during the simulation, kept once done. */

export type Outcome =
  | { readonly status: 'done' }
  | { readonly status: 'todo'; readonly detail?: string }
  /** The check cannot be made: a device it mentions does not exist (yet). */
  | { readonly status: 'unknown'; readonly detail: string }
  /** The objective belongs to a step that is not open yet. */
  | { readonly status: 'locked' };

const DONE: Outcome = { status: 'done' };
const todo = (detail?: string): Outcome =>
  detail === undefined ? { status: 'todo' } : { status: 'todo', detail };

/** Virtual time allowed to fetch a web page on the copy. */
const HTTP_MS = 30_000;

function refLabel(ref: DeviceRef): string {
  return ref.by === 'id' ? ref.label : ref.by === 'name' ? ref.name : ref.kind;
}

/** Devices a reference designates (several for a kind, none when it is missing). */
export function resolveRef(network: Network, ref: DeviceRef): Device[] {
  if (ref.by === 'id') {
    const device = network.device(ref.id);
    return device ? [device] : [];
  }
  if (ref.by === 'name') {
    return network.devices.filter((d) => fold(d.name) === fold(ref.name)).slice(0, 1);
  }
  return network.devices.filter((d) => d.kind === ref.kind);
}

function missing(ref: DeviceRef): Outcome {
  return ref.by === 'kind'
    ? { status: 'unknown', detail: 'Aucun équipement de ce type sur le plan.' }
    : { status: 'unknown', detail: `Équipement « ${refLabel(ref)} » introuvable sur le plan.` };
}

/** `192.168.1.0/24` as a network address and a mask; null when it is not valid. */
function parseNetwork(text: string): { network: Ipv4; mask: Ipv4 } | null {
  const [address, prefix] = text.split('/');
  const ip = parseIp(address ?? '');
  const bits = Number(prefix);
  if (ip === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = prefixToMask(bits);
  return { network: networkOf(ip, mask), mask };
}

function inNetwork(ip: Ipv4, text: string): boolean {
  const wanted = parseNetwork(text);
  return wanted !== null && ip !== IP_ANY && networkOf(ip, wanted.mask) === wanted.network;
}

/** Every device designated must pass; at least one must exist. */
function every(network: Network, ref: DeviceRef, test: (device: Device) => Outcome): Outcome {
  const devices = resolveRef(network, ref);
  if (devices.length === 0) return missing(ref);
  for (const device of devices) {
    const outcome = test(device);
    if (outcome.status !== 'done') return outcome;
  }
  return DONE;
}

function evaluateStateCheck(network: Network, check: Check): Outcome {
  switch (check.type) {
    case 'deviceCount': {
      const count = network.devices.filter((d) =>
        check.kind === 'terminal' ? d instanceof Host : d.kind === check.kind,
      ).length;
      if (count < check.min) return todo(`${count} sur ${check.min}.`);
      return check.max !== undefined && count > check.max ? todo(`${count} : ${check.max} au plus.`) : DONE;
    }
    case 'linked': {
      const [a] = resolveRef(network, check.a);
      const [b] = resolveRef(network, check.b);
      if (!a) return missing(check.a);
      if (!b) return missing(check.b);
      const holds = (device: Device) => (s: ReturnType<typeof segments>[number]) =>
        device instanceof Switch
          ? s.switches.includes(device.id)
          : s.members.some((m) => m.deviceId === device.id);
      return segments(network).some((s) => holds(a)(s) && holds(b)(s)) ? DONE : todo();
    }
    case 'sameNetwork': {
      const cards: { ip: Ipv4; mask: Ipv4 }[] = [];
      for (const ref of check.devices) {
        const devices = resolveRef(network, ref);
        if (devices.length === 0) return missing(ref);
        for (const device of devices) {
          if (!(device instanceof Host)) return todo();
          if (device.config.useDhcp || device.config.ip === IP_ANY || device.config.mask === IP_ANY) {
            return todo(`${device.name} n’a pas d’adresse fixe complète.`);
          }
          cards.push(device.config);
        }
      }
      const [first] = cards;
      const same =
        first !== undefined &&
        cards.every((c) => c.mask === first.mask && sameNetwork(c.ip, first.ip, first.mask));
      return same ? DONE : todo();
    }
    case 'config':
      return every(network, check.device, (device) => {
        if (!(device instanceof Host)) return todo();
        const c = device.config;
        if (check.field === 'dhcp') {
          const wanted = check.equals !== undefined ? fold(check.equals) === 'oui' : (check.isSet ?? true);
          return c.useDhcp === wanted ? DONE : todo();
        }
        // An address obtained from a DHCP server is not a setting of the pupil.
        const value = c.useDhcp ? IP_ANY : c[check.field];
        if (check.isSet !== undefined && (value !== IP_ANY) !== check.isSet) return todo();
        if (check.equals !== undefined && formatIp(value) !== check.equals.trim()) return todo();
        if (check.inNetwork !== undefined && !inNetwork(value, check.inNetwork)) return todo();
        return DONE;
      });
    case 'routerInterface': {
      const [device] = resolveRef(network, check.device);
      if (!device) return missing(check.device);
      if (!(device instanceof Router)) return todo();
      return device.interfaces.some((i) => inNetwork(i.ip, check.inNetwork)) ? DONE : todo();
    }
    case 'installed':
      return every(network, check.device, (d) =>
        d instanceof Host && d.isInstalled(check.app) ? DONE : todo(),
      );
    case 'serviceRunning':
      return every(network, check.device, (d) =>
        d instanceof Host && d.isInstalled(check.app) && d.serverFor(check.app)?.active ? DONE : todo(),
      );
    case 'lintClean': {
      // An empty plan has nothing wrong, and nothing done either.
      if (network.devices.length === 0) return todo();
      const left = lintNetwork(network).filter(
        (f) =>
          (f.severity === 'error' || f.severity === 'warning') &&
          !check.ignore.some((code) => code === f.code),
      );
      return left.length === 0 ? DONE : todo(`${left.length} point(s) signalé(s) par Vérifier.`);
    }
    default:
      return todo();
  }
}

function evaluateProbeCheck(network: Network, check: Check): Outcome {
  switch (check.type) {
    case 'ping': {
      const [from] = resolveRef(network, check.from);
      if (!from) return missing(check.from);
      let target: TraceTarget;
      if (check.to.by === 'address') target = { kind: 'text', text: check.to.address };
      else {
        const [to] = resolveRef(network, check.to);
        if (!to) return missing(check.to);
        target = { kind: 'device', id: to.id };
      }
      const reached = tracePath(network, from.id, target).ok;
      return reached === (check.expect === 'reply') ? DONE : todo();
    }
    case 'resolves': {
      const [from] = resolveRef(network, check.from);
      if (!from) return missing(check.from);
      const code = tracePath(network, from.id, { kind: 'text', text: check.name }).findings[0]?.code;
      // The name is translated as soon as the test goes beyond the DNS question.
      return code !== undefined && code !== 'trace-dns' && code !== 'trace-target-unknown' ? DONE : todo();
    }
    case 'httpGet': {
      const [from] = resolveRef(network, check.from);
      if (!from) return missing(check.from);
      const probe = prepareProbe(network);
      const host = probe.sim.device(from.id);
      if (probe.overflow || !(host instanceof Host)) return todo();
      let answer: HttpResult | null = null;
      httpGet(host, check.url, (result) => {
        answer = result;
      });
      runBounded(probe.sim, () => answer !== null, HTTP_MS);
      const page = answer as HttpResult | null;
      if (page?.kind !== 'ok' || page.response.status !== 200) return todo();
      return check.contains === undefined || page.response.body.includes(check.contains) ? DONE : todo();
    }
    default:
      return todo();
  }
}

function evaluateJournalCheck(network: Network, check: Check, work: Work): Outcome {
  if (check.type === 'simulationStarted') return work.simulated ? DONE : todo();
  if (check.type !== 'commandRan') return todo();
  if (check.device === undefined) {
    return work.commands.some((entry) => entry.endsWith(`:${check.command}`)) ? DONE : todo();
  }
  const [device] = resolveRef(network, check.device);
  if (!device) return missing(check.device);
  return work.commands.includes(journalEntry(device.id, check.command)) ? DONE : todo();
}

/** How a command typed on a device is kept in the work of the pupil. */
export function journalEntry(deviceId: string, command: string): string {
  return `${deviceId}:${command}`;
}

/** Objectives that can be evaluated at once: state of the design and journal. */
export function evaluateNow(activity: Activity, network: Network, work: Work): Map<string, Outcome> {
  const outcomes = new Map<string, Outcome>();
  for (const objective of objectivesOf(activity)) {
    const family = familyOf(objective.check);
    if (family === 'state') outcomes.set(objective.id, evaluateStateCheck(network, objective.check));
    else if (family === 'journal')
      outcomes.set(objective.id, evaluateJournalCheck(network, objective.check, work));
  }
  return outcomes;
}

/** Objectives tested on a copy of the network: asked for by the pupil. */
export function evaluateProbes(activity: Activity, network: Network): Map<string, Outcome> {
  const outcomes = new Map<string, Outcome>();
  for (const objective of objectivesOf(activity)) {
    if (familyOf(objective.check) === 'probe') {
      outcomes.set(objective.id, evaluateProbeCheck(network, objective.check));
    }
  }
  return outcomes;
}

/** Every objective, evaluated one way or the other (for the teacher's checks and the tests). */
export function evaluateAll(activity: Activity, network: Network, work: Work): Map<string, Outcome> {
  return new Map([...evaluateNow(activity, network, work), ...evaluateProbes(activity, network)]);
}

/**
 * Steps are done in order: the objectives of a step only count once every
 * earlier step is complete. Otherwise an objective such as « nothing left to
 * correct » would be reached on the empty plan, before anything was built.
 */
export function gateSteps(activity: Activity, outcomes: ReadonlyMap<string, Outcome>): Map<string, Outcome> {
  const gated = new Map<string, Outcome>();
  let open = true;
  for (const step of activity.steps) {
    for (const objective of step.objectives) {
      const outcome = outcomes.get(objective.id);
      if (outcome) gated.set(objective.id, open ? outcome : { status: 'locked' });
    }
    open &&= step.objectives.every((o) => outcomes.get(o.id)?.status === 'done');
  }
  return gated;
}

/** Index of the first step that still has something to do (the last one when all is done). */
export function currentStep(activity: Activity, done: ReadonlySet<string>): number {
  const index = activity.steps.findIndex((step) => step.objectives.some((o) => !done.has(o.id)));
  return index < 0 ? activity.steps.length - 1 : index;
}

/** Devices of the starting network an activity relies on: they must not be deleted. */
export function protectedDevices(activity: Activity): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value !== 'object' || value === null) return;
    const ref = value as { by?: unknown; id?: unknown };
    if (ref.by === 'id' && typeof ref.id === 'string') ids.add(ref.id);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  for (const objective of objectivesOf(activity)) visit(objective.check);
  return ids;
}

/** The profile of an activity, keeping only the capabilities this version knows. */
export function activityProfile(activity: Activity): ProfileSpec | null {
  const profile = activity.profile;
  if (!profile) return null;
  const known = (list: readonly string[] | undefined): Capability[] =>
    CAPABILITIES.filter((capability) => list?.includes(capability));
  return { base: profile.base, hide: known(profile.hide), show: known(profile.show) };
}

/** Share of the objectives reached, for a progress bar. */
export function progressOf(objectives: readonly Objective[], done: ReadonlySet<string>): number {
  if (objectives.length === 0) return 1;
  return objectives.filter((o) => done.has(o.id)).length / objectives.length;
}
