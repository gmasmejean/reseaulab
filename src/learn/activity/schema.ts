import { z } from 'zod';
import { HOST_KINDS } from '../../engine/devices/device';
import { APP_IDS } from '../../engine/services/catalog';
import { TERMINAL_COMMANDS } from '../../engine/terminal/terminal';
import { LEVELS } from '../content/types';
import { LINT_CODES } from '../diagnose/findings';
import { CAPABILITIES, PROFILE_LEVELS } from '../profile/capabilities';

/* An activity: instructions written by a teacher and objectives that the
 * simulator checks by itself. Checks are data taken from a closed list —
 * never code — so that a file received from anyone can be opened safely. */

const text = (max: number) => z.string().max(max);
const id = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Identifiant invalide (minuscules, chiffres et tirets)' });

/**
 * Which device a check is about.
 * - `id`: a device of the starting network (renaming it does not matter);
 * - `name`: a device the pupil must create, recognised by its name;
 * - `kind`: every terminal of a kind (« tous les ordinateurs »).
 */
const deviceRef = z.discriminatedUnion('by', [
  z.object({ by: z.literal('id'), id: text(32), label: text(64) }),
  z.object({ by: z.literal('name'), name: z.string().trim().min(1).max(64) }),
  z.object({ by: z.literal('kind'), kind: z.enum(HOST_KINDS) }),
]);

/** A single device: `kind` would be ambiguous. */
const oneDevice = z.discriminatedUnion('by', [
  z.object({ by: z.literal('id'), id: text(32), label: text(64) }),
  z.object({ by: z.literal('name'), name: z.string().trim().min(1).max(64) }),
]);

const network = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/, { message: 'Réseau attendu sous la forme 192.168.1.0/24' });

const check = z.discriminatedUnion('type', [
  /* --- read on the design of the network, at any time --- */
  z.object({
    type: z.literal('deviceCount'),
    kind: z.enum([...HOST_KINDS, 'switch', 'router', 'terminal']),
    min: z.number().int().min(0).max(500).default(1),
    max: z.number().int().min(0).max(500).optional(),
  }),
  /** Both devices reach each other without a router (cables, Wi-Fi, switches). */
  z.object({ type: z.literal('linked'), a: oneDevice, b: oneDevice }),
  /** The devices have addresses of one and the same IP network. */
  z.object({ type: z.literal('sameNetwork'), devices: z.array(deviceRef).min(1).max(20) }),
  z.object({
    type: z.literal('config'),
    device: deviceRef,
    field: z.enum(['ip', 'mask', 'gateway', 'dns', 'dhcp']),
    /** Exactly this value (« oui » / « non » for `dhcp`). */
    equals: text(40).optional(),
    /** An address of this network. */
    inNetwork: network.optional(),
    /** Filled in (or left empty when false). */
    isSet: z.boolean().optional(),
  }),
  /** A router has an interface in this network. */
  z.object({ type: z.literal('routerInterface'), device: oneDevice, inNetwork: network }),
  z.object({ type: z.literal('installed'), device: deviceRef, app: z.enum(APP_IDS) }),
  /** A server application is installed and started. */
  z.object({ type: z.literal('serviceRunning'), device: deviceRef, app: z.enum(APP_IDS) }),
  /** The verification of the network reports nothing serious. */
  z.object({ type: z.literal('lintClean'), ignore: z.array(z.enum(LINT_CODES)).max(30).default([]) }),

  /* --- tested on a copy of the network, when the pupil asks --- */
  z.object({
    type: z.literal('ping'),
    from: oneDevice,
    to: z.union([oneDevice, z.object({ by: z.literal('address'), address: text(253) })]),
    /** `fail`: the communication must be impossible (firewall, separate networks). */
    expect: z.enum(['reply', 'fail']).default('reply'),
  }),
  /** A name is translated into an address by the DNS server of the device. */
  z.object({ type: z.literal('resolves'), from: oneDevice, name: text(253) }),
  /** A web page is obtained (and contains a text, when given). */
  z.object({ type: z.literal('httpGet'), from: oneDevice, url: text(300), contains: text(200).optional() }),

  /* --- what the pupil did during the simulation, kept once done --- */
  z.object({
    type: z.literal('commandRan'),
    command: z.enum(TERMINAL_COMMANDS),
    device: oneDevice.optional(),
  }),
  z.object({ type: z.literal('simulationStarted') }),
]);

const objective = z.object({
  id,
  /** What the pupil reads: « Les deux ordinateurs sont reliés au switch ». */
  label: z.string().trim().min(1).max(300),
  check,
});

const step = z.object({
  id,
  title: z.string().trim().min(1).max(120),
  /** Instructions, as formatted text (see richtext.ts). */
  body: text(6000).default(''),
  objectives: z.array(objective).max(20).default([]),
  /** Given one by one when the pupil asks. */
  hints: z.array(text(600)).max(10).default([]),
  /** Knowledge cards to read for this step. */
  notions: z.array(id).max(10).default([]),
});

const profile = z.object({
  base: z.enum(PROFILE_LEVELS),
  hide: z
    .array(z.enum(CAPABILITIES as [string, ...string[]]))
    .max(100)
    .optional(),
  show: z
    .array(z.enum(CAPABILITIES as [string, ...string[]]))
    .max(100)
    .optional(),
});

export const activitySchema = z.object({
  id,
  title: z.string().trim().min(1).max(120),
  level: z.enum(LEVELS),
  /** Indicative duration, in minutes. */
  duration: z.number().int().min(1).max(600).optional(),
  /** The situation and what is expected, as formatted text. */
  intro: text(6000).default(''),
  /** What the interface offers during the activity (the level of the class otherwise). */
  profile: profile.optional(),
  steps: z.array(step).min(1).max(30),
});

/** What a pupil did in an activity; completed by the report of step 26. */
export const workSchema = z.object({
  /** Objectives reached, by identifier. */
  done: z.array(id).max(600).default([]),
  /** Hints shown, per step. */
  hints: z.record(id, z.number().int().min(0).max(10)).default({}),
  /** Commands typed during the simulation: « n3:ping ». */
  commands: z.array(text(80)).max(500).default([]),
  simulated: z.boolean().default(false),
});

export type Activity = z.infer<typeof activitySchema>;
export type ActivityInput = z.input<typeof activitySchema>;
export type Step = Activity['steps'][number];
export type Objective = Step['objectives'][number];
export type Check = Objective['check'];
export type DeviceRef = z.infer<typeof deviceRef>;
export type Work = z.infer<typeof workSchema>;

export const EMPTY_WORK: Work = { done: [], hints: {}, commands: [], simulated: false };

/** How a check is evaluated. */
export type CheckFamily = 'state' | 'probe' | 'journal';

export function familyOf(check: Check): CheckFamily {
  switch (check.type) {
    case 'ping':
    case 'resolves':
    case 'httpGet':
      return 'probe';
    case 'commandRan':
    case 'simulationStarted':
      return 'journal';
    default:
      return 'state';
  }
}

/** Every objective of an activity, in order. */
export function objectivesOf(activity: Activity): Objective[] {
  return activity.steps.flatMap((s) => s.objectives);
}
