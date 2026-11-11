import { Emitter } from '../engine/core/emitter';
import type { DeviceKind, Position } from '../engine/devices/device';
import { protocolTag, summarizeFrame, transportTag } from '../engine/net/describe';
import type { DropReason } from '../engine/net/drop';
import { ConnectError, Network } from '../engine/network';
import type { AppId } from '../engine/services/catalog';
import { exampleNetwork } from '../project/example';
import { contextualNotion } from '../learn/content/context';
import type { PathId } from '../learn/content/order';
import { DEFAULT_PACK } from '../learn/content/default-pack';
import { mergePacks } from '../learn/content/merge';
import { parsePack } from '../learn/content/schema';
import type { Notion, Pack, PackOverride } from '../learn/content/types';
import {
  FULL_PROFILE,
  can,
  parseProfile,
  type Capability,
  type ProfileLevel,
  type ProfileSpec,
} from '../learn/profile/capabilities';
import type { BuiltinActivity } from '../learn/activity/builtin';
import { buildActivity, type Draft } from '../learn/activity/draft';
import { startingNetwork } from '../learn/activity/suggest';
import {
  activityProfile,
  currentStep,
  evaluateNow,
  evaluateProbes,
  gateSteps,
  journalEntry,
  protectedDevices,
  type Outcome,
} from '../learn/activity/evaluate';
import { EMPTY_WORK, familyOf, objectivesOf, type Activity, type Work } from '../learn/activity/schema';
import { parseLearnFile, serializeLearnFile } from '../learn/file';
import { askQuestion, drawSalt, fitsQuestion, markAnswer } from '../learn/activity/questions';
import type { Answer } from '../learn/quiz/types';
import { importFilius } from '../project/filius';
import { parseProject, serializeProject } from '../project/serialize';
import { SimulationClock, type FrameSource } from './clock';
import { parseActivityWidth } from './panelWidth';
import { clampWindow, defaultWindowSize, fitWindow, placeWindow, type Size } from './windowLayout';

export type Mode = 'design' | 'simulation';
export type Tool = 'select' | 'cable';
export type Selection = { readonly kind: 'device' | 'cable' | 'note'; readonly id: string } | null;

export type WindowSpec =
  | { readonly type: 'desktop'; readonly deviceId: string }
  | { readonly type: 'app'; readonly deviceId: string; readonly app: AppId | 'software' }
  /** `iface`: show only the frames of that interface (all when absent). */
  | { readonly type: 'capture'; readonly deviceId: string; readonly iface?: number }
  | { readonly type: 'switch'; readonly deviceId: string }
  /** Routing and ARP tables, of a router or of a computer. */
  | { readonly type: 'router'; readonly deviceId: string }
  /** « Aide et connaissances », opened on a knowledge card when `notion` is given. */
  | { readonly type: 'help'; readonly notion?: string; readonly at?: number }
  /**
   * « Vérifier mon réseau ». With `from` and `to`, the communication between
   * them is tested at once; `at` tells two requests for the same test apart.
   */
  | { readonly type: 'diagnose'; readonly from?: string; readonly to?: string; readonly at?: number }
  /** Settings of the class (level), for the teacher. */
  | { readonly type: 'settings' }
  /** Report of the pupil's work, to print or hand in. */
  | { readonly type: 'report' }
  /** Writing an activity, for the teacher. */
  | { readonly type: 'author' }
  /** Self-assessment quiz, about one knowledge card when `notion` is given. */
  | { readonly type: 'quiz'; readonly notion?: string; readonly at?: number }
  /** Activities shipped with RéseauLab. */
  | { readonly type: 'activities' };

export interface OpenWindow {
  readonly id: string;
  readonly spec: WindowSpec;
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Notice {
  readonly id: number;
  readonly text: string;
  readonly kind: 'info' | 'error';
}

/** A frame travelling on a cable, for the animation. */
export interface InFlight {
  readonly cableId: string;
  readonly from: string;
  readonly start: number;
  readonly end: number;
  readonly protocol: string;
  /** Name written on the frame: its highest protocol (ARP, ICMP, DNS, HTTP…). */
  readonly label: string;
}

/** A packet a device just gave up on, shown for a moment on the plan. */
export interface DropMark {
  readonly deviceId: string;
  readonly reason: DropReason;
  /** Real time (ms) when the mark disappears. */
  readonly until: number;
}

/** How long (real ms) a drop stays marked on the plan. */
export const DROP_MARK_MS = 4000;

/** Shown after importing a Filius file, when something could not be converted. */
export interface ImportReport {
  readonly fileName: string;
  readonly version: string | null;
  readonly warnings: readonly string[];
}

export const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4] as const;
/** Zoom levels of the plan reached with the − and + buttons. */
export const ZOOM_STEPS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5, 2] as const;
const ZOOM_MIN = ZOOM_STEPS[0];
const ZOOM_MAX = 2;
/** Number of changes that can be undone. */
export const HISTORY_LIMIT = 50;
/** Changes closer than this (dragging a device, typing a note) are undone together. */
export const HISTORY_DELAY_MS = 400;
export const AUTOSAVE_KEY = 'reseaulab:autosave';
export const AUTOSAVE_DATE_KEY = 'reseaulab:autosave-date';
export const HIDE_AUTOMATIC_KEY = 'reseaulab:masquer-trafic-automatique';
/** Knowledge cards already opened on this computer (a list of identifiers). */
export const READ_CARDS_KEY = 'reseaulab:fiches-lues';

function parseReadCards(text: string | null): ReadonlySet<string> {
  if (text === null) return new Set();
  try {
    const value: unknown = JSON.parse(text);
    return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}
/** Pedagogical pack of the teacher, kept in this browser. */
export const PACK_KEY = 'reseaulab:pack';
/** Level of the class chosen on this computer. */
export const PROFILE_KEY = 'reseaulab:profil';
/** Width given by hand to the activity panel on this computer. */
export const ACTIVITY_WIDTH_KEY = 'reseaulab:largeur-activite';

/**
 * Frames that devices send on their own, without any action of the pupil:
 * address requests (DHCP) and route announcements (RIP). Both are broadcast,
 * so they never trigger ARP requests.
 */
export const AUTOMATIC_PROTOCOLS: ReadonlySet<string> = new Set(['dhcp', 'rip']);

/**
 * Work found in the browser at start-up. On a shared classroom computer it may
 * belong to the previous pupil, hence the explicit question.
 */
export interface Resumed {
  /** When it was saved (ms since the epoch), when known. */
  readonly savedAt: number | null;
}

/**
 * Where the pupil is in the help: the card read ('' for the home page of the
 * help), those before it, and the reading path followed.
 */
export interface Reading {
  readonly current?: string;
  readonly trail: readonly string[];
  readonly path?: PathId;
}

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function windowKey(spec: WindowSpec): string {
  switch (spec.type) {
    case 'help':
    case 'diagnose':
    case 'settings':
    case 'activities':
    case 'report':
    case 'quiz':
    case 'author':
      return spec.type;
    case 'app':
      return `app:${spec.deviceId}:${spec.app}`;
    default:
      return `${spec.type}:${spec.deviceId}`;
  }
}

const DEFAULT_POSITION_STEP = 140;

/** Smallest plan drawn when the size of the stage is unknown. */
const MIN_PLAN: Size = { width: 1400, height: 900 };

/** Area covered by the devices and notes, from the origin, labels included. */
export function contentSize(network: Network): Size {
  return {
    width: Math.max(
      0,
      ...network.devices.map((d) => d.position.x + 100),
      ...network.notes.map((n) => n.x + n.width + 30),
    ),
    height: Math.max(
      0,
      ...network.devices.map((d) => d.position.y + 90),
      ...network.notes.map((n) => n.y + n.height + 30),
    ),
  };
}

export const PROJECT_EXTENSION = '.reseaulab.json';
const DEFAULT_PROJECT_NAME = 'reseau';

/**
 * File name without its extension, cleaned from the characters that file
 * systems refuse. Never empty.
 */
export function projectBaseName(name: string): string {
  const base = name
    .replace(/\.reseaulab\.json$/i, '')
    .replace(/\.(json|fls)$/i, '')
    // eslint-disable-next-line no-control-regex -- control characters are not allowed in file names
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim();
  return base === '' ? DEFAULT_PROJECT_NAME : base;
}

/**
 * Whole editor state, independent from React: current network, mode,
 * selection, windows, notices. The UI subscribes to `version`.
 */
export class Session {
  network: Network;
  mode: Mode = 'design';
  tool: Tool = 'select';
  selection: Selection = null;
  cableStart: string | null = null;
  windows: OpenWindow[] = [];
  notice: Notice | null = null;
  fileName = 'reseau.reseaulab.json';
  paused = false;
  inFlight: InFlight[] = [];
  importReport: ImportReport | null = null;
  /** Do not animate (nor slow down for) the automatic traffic: DHCP, RIP. */
  hideAutomatic = false;
  /** Width chosen by hand for the activity panel; null for the default one. */
  activityWidth: number | null = null;
  /** Set while the pupil has not said what to do with the work found at start-up. */
  resumed: Resumed | null = null;
  /** Validates the text field being edited; false when its value is refused. */
  private pendingEdit: (() => boolean) | null = null;
  /** Knowledge cards, questions and messages: the default pack, completed by the teacher's. */
  pack: Pack = DEFAULT_PACK;
  /** Pack kept in this browser, and pack that came with the file being worked on. */
  private localPack: PackOverride | null = null;
  private filePack: PackOverride | null = null;
  /** Activity being written by the teacher (kept while the window is closed). */
  authorDraft: Draft | null = null;
  /** Card read last in the help, and those read before it (« Retour »), kept while it is closed. */
  reading: Reading = { trail: [] };
  /** Knowledge cards already opened on this computer. */
  readCards: ReadonlySet<string> = new Set();
  /** Activity being done, with its instructions and objectives. */
  activity: Activity | null = null;
  /** What the pupil did in the activity. */
  work: Work = EMPTY_WORK;
  /** Results of the objectives tested on a copy, and the design they were tested on. */
  private probed = new Map<string, Outcome>();
  private probedAt = -1;
  /** Counts the changes of the design, to know when a test is outdated. */
  private designRevision = 0;
  private outcomeCache: { readonly key: string; readonly value: Map<string, Outcome> } | null = null;
  /** What the interface offers on this computer (level of the class). */
  private localProfile: ProfileSpec = FULL_PROFILE;
  /** Size of the stage (plan and windows), once known. */
  viewport: Size | null = null;
  /** Scale of the plan: 1 = real size. */
  zoom = 1;
  /** The zoom follows the size of the stage until the pupil chooses one. */
  autoFit = true;
  /** Packets given up on a moment ago, one per device. */
  dropMarks: DropMark[] = [];
  /** Step by step: the simulation runs until the frames on the cables arrive, then pauses. */
  stepping = false;
  private stepUntil: number | null = null;
  private frameCount = 0;
  private readonly frameEmitter = new Emitter<{ frame: undefined }>();
  /** Earlier and undone states of the design, as project files. */
  private past: string[] = [];
  private future: string[] = [];
  private present: string;
  private historyTimer: ReturnType<typeof setTimeout> | null = null;
  private historyDirty = false;
  readonly clock: SimulationClock;
  private readonly emitter = new Emitter<{ change: undefined }>();
  private revision = 0;
  private zCounter = 1;
  private noticeId = 0;
  private unsubscribe: (() => void)[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly storage: Storage | null = null,
    frames?: FrameSource,
    /** Real time, for the date of the automatic save. */
    private readonly now: () => number = () => Date.now(),
  ) {
    this.network = this.restore() ?? new Network();
    this.present = this.designText();
    this.hideAutomatic = this.readPreference(HIDE_AUTOMATIC_KEY) === 'oui';
    this.activityWidth = parseActivityWidth(this.readPreference(ACTIVITY_WIDTH_KEY));
    this.readCards = parseReadCards(this.readPreference(READ_CARDS_KEY));
    this.localPack = this.readLocalPack();
    this.rebuildPack();
    this.localProfile = parseProfile(this.readPreference(PROFILE_KEY));
    this.clock = new SimulationClock(
      () => this.network.scheduler,
      () => {
        this.pruneInFlight();
        this.pruneDropMarks();
        this.endStep();
        this.frameCount++;
        this.frameEmitter.emit('frame', undefined);
      },
      frames,
      () => this.busyUntil(),
    );
    this.attach();
  }

  get version(): number {
    return this.revision;
  }

  get speed(): number {
    return this.clock.speed;
  }

  subscribe = (listener: () => void): (() => void) => this.emitter.on('change', listener);

  getVersion = (): number => this.revision;

  /**
   * Animation frames. Only what moves with the simulated time (frames on the
   * cables, the clock) listens to them: the rest of the interface is redrawn
   * when something changes, not sixty times a second.
   */
  subscribeFrame = (listener: () => void): (() => void) => this.frameEmitter.on('frame', listener);

  getFrame = (): number => this.frameCount;

  /* ---------- project ---------- */

  replaceNetwork(
    network: Network,
    fileName?: string,
    learn: {
      readonly activity: Activity | null;
      readonly work: Work | null;
      readonly pack?: PackOverride | null;
    } = { activity: null, work: null },
  ): void {
    this.pendingEdit = null;
    this.setMode('design');
    this.commitHistory();
    this.detach();
    this.network = network;
    this.activity = learn.activity;
    this.filePack = learn.pack ?? null;
    this.rebuildPack();
    this.work = learn.work ?? EMPTY_WORK;
    if (learn.activity && this.work.startedAt === undefined) {
      this.work = { ...this.work, startedAt: this.now() };
    }
    this.probed = new Map();
    this.probedAt = -1;
    this.resumed = null;
    this.selection = null;
    this.cableStart = null;
    this.windows = [];
    if (fileName) this.fileName = fileName;
    this.attach();
    // Replacing the whole network is one step that can be undone.
    this.commitHistory();
    this.autoFit = true;
    this.zoom = this.fitZoom();
    this.scheduleSave();
    this.touch();
  }

  newProject(): void {
    this.replaceNetwork(new Network(), 'reseau.reseaulab.json');
  }

  loadExample(): void {
    this.replaceNetwork(exampleNetwork(), 'exemple.reseaulab.json');
    this.notify('Exemple chargé : passez en mode Simulation puis ouvrez un poste.');
  }

  openProject(text: string, fileName: string): boolean {
    try {
      const file = parseLearnFile(text);
      this.replaceNetwork(file.network, fileName, file);
      this.notify(
        file.activity ? `Activité « ${file.activity.title} » ouverte.` : `Projet « ${fileName} » ouvert.`,
      );
      return true;
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), 'error');
      return false;
    }
  }

  /** Imports a Filius project (.fls). Resolves to false when the file was rejected. */
  async openFilius(bytes: Uint8Array, fileName: string): Promise<boolean> {
    try {
      const { network, warnings, version } = await importFilius(bytes);
      this.replaceNetwork(network, fileName.replace(/\.fls$/i, '') + '.reseaulab.json');
      if (warnings.length > 0) this.importReport = { fileName, version, warnings };
      else this.notify(`Projet Filius « ${fileName} » importé.`);
      this.touch();
      return true;
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), 'error');
      return false;
    }
  }

  dismissImportReport(): void {
    this.importReport = null;
    this.touch();
  }

  /** The project file: the network, and the activity with the pupil's work when there is one. */
  serialize(): string {
    this.noteProgress();
    // Without an activity, the work is only what the pupil wrote about themselves.
    const { student, conclusion } = this.work;
    const signed =
      student.name !== '' || student.className !== '' || conclusion !== '' || this.work.quizzes.length > 0;
    const work = this.activity || signed ? { ...this.work, done: [...this.objectivesDone()] } : null;
    return serializeLearnFile(this.network, { activity: this.activity, work, pack: this.filePack });
  }

  /** The design alone, as compared by the undo history. */
  private designText(): string {
    return serializeProject(this.network);
  }

  /* ---------- activity ---------- */

  /** Starts an activity shipped with RéseauLab, on its starting network. */
  startActivity(builtin: BuiltinActivity): void {
    const { network, activity } = builtin.build();
    this.replaceNetwork(network, `${activity.id}${PROJECT_EXTENSION}`, { activity, work: null });
    this.notify(`Activité « ${activity.title} » : suivez les étapes, à droite.`);
  }

  /** Leaves the activity; the network and the name of the pupil stay. */
  quitActivity(): void {
    this.activity = null;
    this.work = { ...EMPTY_WORK, student: this.work.student };
    this.probed = new Map();
    this.scheduleSave();
    this.touch();
  }

  /**
   * State of every objective. Those read on the design or on the journal are
   * always up to date; those tested on a copy keep the result of the last
   * « Vérifier mon travail », until the design changes.
   */
  activityOutcomes(): Map<string, Outcome> {
    const activity = this.activity;
    if (!activity) return new Map();
    const key = `${this.network.version}:${this.designRevision}:${this.probedAt}:${this.work.commands.length}:${String(this.work.simulated)}:${Object.keys(this.work.answers).length}`;
    if (this.outcomeCache?.key === key) return this.outcomeCache.value;
    const fresh = this.probedAt === this.designRevision;
    const outcomes = evaluateNow(activity, this.network, this.work);
    for (const objective of objectivesOf(activity)) {
      if (familyOf(objective.check) !== 'probe') continue;
      const tested = this.probed.get(objective.id);
      outcomes.set(
        objective.id,
        tested && fresh
          ? tested
          : {
              status: 'todo',
              detail: tested
                ? 'Le réseau a changé : cliquez de nouveau sur « Vérifier mon travail ».'
                : 'Se vérifie avec le bouton « Vérifier mon travail ».',
            },
      );
    }
    const value = gateSteps(activity, outcomes);
    this.outcomeCache = { key, value };
    return value;
  }

  /** Identifiers of the objectives reached. */
  objectivesDone(): Set<string> {
    return new Set([...this.activityOutcomes()].filter(([, o]) => o.status === 'done').map(([id]) => id));
  }

  /** Step the pupil is working on. */
  get activityStep(): number {
    return this.activity ? currentStep(this.activity, this.objectivesDone()) : 0;
  }

  /** « Vérifier mon travail » : tests on a copy of the network what cannot be read on the plan. */
  checkWork(): void {
    if (!this.activity) return;
    this.commitEdit();
    this.probed = evaluateProbes(this.activity, this.network);
    this.probedAt = this.designRevision;
    this.noteProgress();
    this.scheduleSave();
    this.touch();
  }

  /** Notes when each objective was first reached, for the report. */
  noteProgress(): void {
    if (!this.activity) return;
    const fresh = [...this.objectivesDone()].filter((id) => this.work.reachedAt[id] === undefined);
    if (fresh.length === 0) return;
    const at = this.now();
    this.work = {
      ...this.work,
      reachedAt: { ...this.work.reachedAt, ...Object.fromEntries(fresh.map((id) => [id, at])) },
    };
  }

  /** Name and class of the pupil, written on the report and in the file handed in. */
  setStudent(name: string, className: string): void {
    this.work = { ...this.work, student: { name: name.slice(0, 80), className: className.slice(0, 40) } };
    this.scheduleSave();
    this.touch();
  }

  /** « Ce que j’ai appris ». */
  setConclusion(text: string): void {
    this.work = { ...this.work, conclusion: text.slice(0, 4000) };
    this.scheduleSave();
    this.touch();
  }

  /** Shows one more hint of a step. */
  revealHint(stepId: string): void {
    if (!this.activity) return;
    this.work = { ...this.work, hints: { ...this.work.hints, [stepId]: (this.work.hints[stepId] ?? 0) + 1 } };
    this.scheduleSave();
    this.touch();
  }

  /** Notes a command typed in a terminal, for the objectives that ask for it. */
  recordCommand(deviceId: string, command: string): void {
    if (!this.activity) return;
    const entry = journalEntry(deviceId, command);
    if (this.work.commands.includes(entry) || this.work.commands.length >= 500) return;
    this.work = { ...this.work, commands: [...this.work.commands, entry] };
    this.noteProgress();
    this.scheduleSave();
    this.touch();
  }

  /**
   * Keeps the answer to a question of the activity: one try, marked at once.
   * The question is the one shown to the pupil (same draw, see askQuestion).
   */
  answerQuestion(objectiveId: string, given: Answer): void {
    const objective = this.activity
      ? objectivesOf(this.activity).find((o) => o.id === objectiveId)
      : undefined;
    if (objective?.check.type !== 'question' || this.work.answers[objectiveId] !== undefined) return;
    if (this.activityOutcomes().get(objectiveId)?.status === 'locked') return;
    const item = askQuestion(objectiveId, objective.check.question, drawSalt(this.work));
    if (!fitsQuestion(item, given)) return;
    const answer = markAnswer(item, given, this.now());
    if (answer.right === null && answer.given === '') return;
    this.work = { ...this.work, answers: { ...this.work.answers, [objectiveId]: answer } };
    this.noteProgress();
    this.scheduleSave();
    this.touch();
  }

  /** Names the project file from what the pupil typed (without the extension). */
  setProjectName(name: string): void {
    this.fileName = `${projectBaseName(name)}${PROJECT_EXTENSION}`;
    this.touch();
  }

  /** The pupil keeps the work found at start-up. */
  keepResumedWork(): void {
    this.resumed = null;
    this.touch();
  }

  /* ---------- level of the class ---------- */

  /** The profile in use. */
  get profile(): ProfileSpec {
    // An activity comes with the interface its author chose.
    return (this.activity ? activityProfile(this.activity) : null) ?? this.localProfile;
  }

  /** Whether the interface offers a device, an application, a command or a setting. */
  can(capability: Capability): boolean {
    return can(this.profile, capability);
  }

  /** Chooses the level of the class on this computer. */
  setProfileLevel(base: ProfileLevel): void {
    this.localProfile = { base };
    try {
      this.storage?.setItem(PROFILE_KEY, JSON.stringify(this.localProfile));
    } catch {
      /* preference not kept: harmless */
    }
    this.touch();
  }

  /* ---------- knowledge ---------- */

  /** The knowledge card `id`, when it exists in the pack in use. */
  notion(id: string): Notion | undefined {
    return this.pack.notions.find((n) => n.id === id);
  }

  /**
   * Opens « Aide et connaissances » on the card asked for, or else where the
   * pupil left it (the guide of the current mode the first time).
   */
  openKnowledge(notion?: string): void {
    this.openHelpOn(notion ?? this.helpTarget(false));
  }

  /** F1: the help about the selected device, or else as the Aide button. */
  openContextHelp(): void {
    this.openHelpOn(this.helpTarget(true));
  }

  private helpTarget(aboutSelection: boolean): string | undefined {
    const selected =
      aboutSelection && this.selection?.kind === 'device'
        ? this.network.device(this.selection.id)
        : undefined;
    return contextualNotion({
      device: selected?.kind,
      lastRead: this.reading.current,
      exists: (id) => this.notion(id) !== undefined,
    });
  }

  private openHelpOn(card: string | undefined): void {
    this.openWindow({ type: 'help', ...(card === undefined ? {} : { notion: card }), at: this.revision });
  }

  /** A seed for a draw of questions: another one each time (from the clock). */
  drawSeed(): number {
    return this.now();
  }

  /** Ticks a knowledge card as read, on this computer. */
  markRead(id: string): void {
    if (this.readCards.has(id)) return;
    this.readCards = new Set([...this.readCards, id]);
    try {
      this.storage?.setItem(READ_CARDS_KEY, JSON.stringify([...this.readCards]));
    } catch {
      /* not kept: harmless */
    }
    this.touch();
  }

  /** Forgets the cards read (another pupil on the same computer). */
  clearRead(): void {
    if (this.readCards.size === 0) return;
    this.readCards = new Set();
    try {
      this.storage?.setItem(READ_CARDS_KEY, '[]');
    } catch {
      /* not kept: harmless */
    }
    this.touch();
  }

  /** Remembers where the pupil is in the help; nothing to redraw. */
  rememberReading(reading: Reading): void {
    this.reading = reading;
  }

  /** Opens the quiz, about one knowledge card when it is given. */
  openQuiz(notion?: string): void {
    this.openWindow({ type: 'quiz', ...(notion === undefined ? {} : { notion }), at: this.revision });
  }

  /** Keeps the score of a finished quiz, for the report. */
  recordQuiz(right: number, total: number): void {
    if (total < 1) return;
    this.work = { ...this.work, quizzes: [...this.work.quizzes, { right, total }].slice(-50) };
    this.scheduleSave();
    this.touch();
  }

  /** The pack kept in this browser, when there is a valid one. */
  private readLocalPack(): PackOverride | null {
    try {
      const saved = this.storage?.getItem(PACK_KEY);
      return saved ? parsePack(saved) : null;
    } catch {
      return null;
    }
  }

  /** The default pack, completed by the teacher's: this computer first, then the file. */
  private rebuildPack(): void {
    const overrides = [this.localPack, this.filePack].filter((p): p is PackOverride => p !== null);
    this.pack = overrides.length === 0 ? DEFAULT_PACK : mergePacks(DEFAULT_PACK, ...overrides);
  }

  /** What the pack of this computer changes, or null when there is none. */
  get localPackSummary(): { notions: number; questions: number; messages: number; hidden: number } | null {
    const pack = this.localPack;
    if (!pack) return null;
    return {
      notions: pack.notions?.length ?? 0,
      questions: pack.questions?.length ?? 0,
      messages: Object.keys(pack.messages ?? {}).length,
      hidden: pack.hidden?.length ?? 0,
    };
  }

  /** Installs a pack file on this computer. False (with a message) when it is not valid. */
  importPack(text: string): boolean {
    try {
      this.localPack = parsePack(text);
    } catch (error) {
      this.notify(error instanceof Error ? error.message : String(error), 'error');
      return false;
    }
    try {
      this.storage?.setItem(PACK_KEY, text);
    } catch {
      /* not kept for the next visit: still in use now */
    }
    this.rebuildPack();
    this.notify('Pack pédagogique installé sur ce poste.');
    return true;
  }

  /** Back to the content shipped with RéseauLab. */
  resetPack(): void {
    this.localPack = null;
    try {
      this.storage?.setItem(PACK_KEY, '');
    } catch {
      /* nothing to forget */
    }
    this.rebuildPack();
    this.notify('Contenu d’origine rétabli.');
  }

  /* ---------- writing an activity (teacher) ---------- */

  setAuthorDraft(draft: Draft): void {
    this.authorDraft = draft;
    this.touch();
  }

  /**
   * The file of the activity being written: its starting network, made from
   * the current one, and the activity. With `embedPack`, the teacher's pack
   * travels in the file, so that pupils get it on any computer.
   */
  activityFile(draft: Draft, embedPack: boolean): { fileName: string; text: string } | { error: string } {
    this.commitEdit();
    const built = buildActivity(draft);
    if ('error' in built) return built;
    return {
      fileName: `${built.activity.id}.activite${PROJECT_EXTENSION}`,
      text: serializeLearnFile(startingNetwork(this.network, draft.start), {
        activity: built.activity,
        work: null,
        pack: embedPack ? this.localPack : null,
      }),
    };
  }

  /** Opens the activity being written as a pupil would get it. Undo brings the solution back. */
  tryActivity(draft: Draft): string | null {
    const file = this.activityFile(draft, false);
    if ('error' in file) return file.error;
    const parsed = parseLearnFile(file.text);
    this.replaceNetwork(parsed.network, file.fileName, { ...parsed, pack: this.filePack });
    this.notify(
      'Activité ouverte comme pour un élève. « Quitter l’activité » puis Ctrl+Z pour revenir à votre réseau.',
    );
    return null;
  }

  /* ---------- text field being edited ---------- */

  /**
   * A text field is only applied when it loses the focus. Clicking the plan
   * changes the selection first, which removes the field from the page before
   * it could be applied: the field registers here so that it is validated
   * before anything replaces it.
   */
  setPendingEdit(commit: () => boolean): void {
    this.pendingEdit = commit;
  }

  clearPendingEdit(commit: () => boolean): void {
    if (this.pendingEdit === commit) this.pendingEdit = null;
  }

  /** Applies the field being edited; false when its value is invalid. */
  commitEdit(): boolean {
    return this.pendingEdit?.() ?? true;
  }

  /* ---------- modes ---------- */

  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.commitEdit();
    this.mode = mode;
    // Cables and notes cannot be selected in simulation mode.
    if (mode === 'simulation' && this.selection?.kind !== 'device') this.selection = null;
    this.tool = 'select';
    this.cableStart = null;
    // Windows about the whole network are useful in both modes.
    this.windows = this.windows.filter((w) => !('deviceId' in w.spec));
    this.inFlight = [];
    this.dropMarks = [];
    this.stepping = false;
    this.stepUntil = null;
    if (mode === 'simulation') {
      this.commitHistory();
      if (this.activity && !this.work.simulated) this.work = { ...this.work, simulated: true };
      this.network.start();
      this.paused = false;
      this.clock.start();
    } else {
      this.clock.stop();
      this.network.stop();
      // What the simulation changed for good (files, server settings) is one step.
      this.commitHistory();
    }
    this.touch();
  }

  setSpeed(speed: number): void {
    this.clock.speed = speed;
    this.touch();
  }

  /**
   * Hides the automatic traffic from the plan: those frames are still
   * exchanged (and listed in the data exchanges) but neither drawn nor slowed
   * down, so only the traffic started by the pupil is animated.
   */
  setHideAutomatic(hide: boolean): void {
    if (hide === this.hideAutomatic) return;
    this.hideAutomatic = hide;
    if (hide) this.inFlight = this.inFlight.filter((f) => !AUTOMATIC_PROTOCOLS.has(f.protocol));
    try {
      this.storage?.setItem(HIDE_AUTOMATIC_KEY, hide ? 'oui' : 'non');
    } catch {
      /* preference not kept: harmless */
    }
    this.touch();
  }

  /** Keeps the width of the activity panel on this computer; null goes back to the default. */
  setActivityWidth(width: number | null): void {
    if (width === this.activityWidth) return;
    this.activityWidth = width;
    try {
      this.storage?.setItem(ACTIVITY_WIDTH_KEY, width === null ? '' : String(width));
    } catch {
      /* preference not kept: harmless */
    }
    this.touch();
  }

  togglePause(): void {
    if (this.mode !== 'simulation') return;
    this.paused = !this.paused;
    this.stepping = false;
    this.stepUntil = null;
    if (this.paused) this.clock.stop();
    else this.clock.start();
    this.touch();
  }

  /**
   * « Trame suivante » : lets the frames now on the cables (or the next ones
   * to leave) reach the other end, then pauses again. One click, one cable.
   */
  stepFrame(): void {
    if (this.mode !== 'simulation') return;
    this.stepping = true;
    this.stepUntil = this.busyUntil();
    this.paused = false;
    this.clock.start();
    this.touch();
  }

  /** Pauses once the frames of the current step have arrived. */
  private endStep(): void {
    if (!this.stepping) return;
    this.stepUntil ??= this.busyUntil();
    if (this.stepUntil === null || this.network.scheduler.now < this.stepUntil) return;
    this.stepping = false;
    this.stepUntil = null;
    this.paused = true;
    this.clock.stop();
    this.touch();
  }

  /* ---------- design actions ---------- */

  setTool(tool: Tool): void {
    this.tool = tool;
    this.cableStart = null;
    this.touch();
  }

  addDevice(kind: DeviceKind, position?: Position, interfaces = 2): string {
    this.commitEdit();
    this.commitHistory();
    const pos = position ?? this.freePosition();
    const net = this.network;
    const device =
      kind === 'switch'
        ? net.addSwitch({ position: pos })
        : kind === 'router'
          ? net.addRouter({ position: pos, interfaces })
          : kind === 'box'
            ? net.addBox({ position: pos })
            : net.addHost(kind, { position: pos });
    this.selection = { kind: 'device', id: device.id };
    if (this.autoFit) this.zoom = this.fitZoom();
    this.touch();
    return device.id;
  }

  /** Adds a text label or a coloured zone to the plan. */
  addNote(kind: 'text' | 'zone'): string {
    this.commitEdit();
    this.commitHistory();
    const offset = (this.network.notes.length % 6) * 24;
    const note = this.network.addNote(
      kind === 'zone'
        ? {
            kind,
            x: 60 + offset,
            y: 60 + offset,
            width: 320,
            height: 200,
            text: '',
            color: '#e3eafc',
            fontSize: 14,
            bold: false,
            italic: false,
          }
        : {
            kind,
            x: 80 + offset,
            y: 80 + offset,
            width: 200,
            height: 40,
            text: 'Texte',
            color: '#1c2430',
            fontSize: 16,
            bold: false,
            italic: false,
          },
    );
    this.selection = { kind: 'note', id: note.id };
    this.touch();
    return note.id;
  }

  select(selection: Selection): void {
    // An invalid value keeps its field (and its error message) on screen.
    if (this.commitEdit()) this.selection = selection;
    this.touch();
  }

  /** Click on a device with the cable tool: first end, then second end. */
  cableClick(deviceId: string): void {
    if (this.cableStart === null) {
      this.cableStart = deviceId;
      this.touch();
      return;
    }
    const start = this.cableStart;
    this.cableStart = null;
    if (start === deviceId) {
      this.touch();
      return;
    }
    try {
      this.commitHistory();
      const cable = this.network.connect(start, deviceId);
      this.selection = { kind: 'cable', id: cable.id };
    } catch (error) {
      this.notify(error instanceof ConnectError ? error.message : String(error), 'error');
    }
    this.touch();
  }

  deleteSelection(): void {
    const sel = this.selection;
    if (!sel || this.mode !== 'design') return;
    if (sel.kind === 'device' && this.activity && protectedDevices(this.activity).has(sel.id)) {
      this.notify('Cet équipement fait partie de l’activité : il ne peut pas être supprimé.', 'error');
      return;
    }
    // Each deletion is a step of its own, whatever was changed just before.
    this.commitHistory();
    if (sel.kind === 'device') this.network.removeDevice(sel.id);
    else if (sel.kind === 'note') this.network.removeNote(sel.id);
    else this.network.disconnect(sel.id);
    this.selection = null;
    this.touch();
  }

  /* ---------- undo / redo ---------- */

  get canUndo(): boolean {
    return this.mode === 'design' && (this.past.length > 0 || this.historyDirty);
  }

  get canRedo(): boolean {
    return this.mode === 'design' && this.future.length > 0 && !this.historyDirty;
  }

  /** Records the current design as a step of the history, when it changed. */
  commitHistory(): void {
    if (this.historyTimer !== null) clearTimeout(this.historyTimer);
    this.historyTimer = null;
    this.historyDirty = false;
    const current = this.designText();
    if (current === this.present) return;
    this.past.push(this.present);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.present = current;
    this.future = [];
  }

  undo(): void {
    if (this.mode !== 'design') return;
    this.commitEdit();
    this.commitHistory();
    const previous = this.past.pop();
    if (previous === undefined) return;
    this.future.push(this.present);
    this.showDesign(previous);
  }

  redo(): void {
    if (this.mode !== 'design') return;
    this.commitEdit();
    this.commitHistory();
    const next = this.future.pop();
    if (next === undefined) return;
    this.past.push(this.present);
    this.showDesign(next);
  }

  /** Replaces the network by a recorded state, keeping the selection when it still exists. */
  private showDesign(project: string): void {
    this.pendingEdit = null;
    this.detach();
    this.network = parseProject(project);
    // As this network is written, so that an unchanged design is never taken for a new step.
    this.present = this.designText();
    this.designRevision++;
    this.attach();
    this.cableStart = null;
    const sel = this.selection;
    if (sel) {
      const net = this.network;
      const exists =
        sel.kind === 'device'
          ? net.device(sel.id)
          : sel.kind === 'note'
            ? net.note(sel.id)
            : net.cable(sel.id);
      if (!exists) this.selection = null;
    }
    if (this.autoFit) this.zoom = this.fitZoom();
    this.scheduleSave();
    this.touch();
  }

  private scheduleHistory(): void {
    this.historyDirty = true;
    if (this.historyTimer !== null) clearTimeout(this.historyTimer);
    this.historyTimer = setTimeout(() => {
      this.commitHistory();
      this.touch();
    }, HISTORY_DELAY_MS);
  }

  /* ---------- zoom of the plan ---------- */

  /** Logical size of the plan: its content, and at least the visible stage. */
  get planSize(): Size {
    const content = contentSize(this.network);
    const stage = this.viewport;
    return {
      width: Math.max(content.width, stage ? stage.width / this.zoom : MIN_PLAN.width),
      height: Math.max(content.height, stage ? stage.height / this.zoom : MIN_PLAN.height),
    };
  }

  /** Called by the plan when the stage is laid out or resized. */
  setViewport(width: number, height: number): void {
    if (this.viewport?.width === width && this.viewport.height === height) return;
    this.viewport = { width, height };
    if (this.autoFit) this.zoom = this.fitZoom();
    this.windows = this.windows.map((w) => ({ ...w, ...clampWindow(w, this.viewport) }));
    this.touch();
  }

  /** Largest zoom (at most 1) that shows the whole plan without scrolling. */
  fitZoom(): number {
    const stage = this.viewport;
    if (!stage) return 1;
    const content = contentSize(this.network);
    const zoom = Math.min(
      1,
      content.width > 0 ? stage.width / content.width : 1,
      content.height > 0 ? stage.height / content.height : 1,
    );
    return Math.max(ZOOM_MIN, Math.floor(zoom * 100) / 100);
  }

  /** « Ajuster » : shows the whole plan, and keeps doing so when the stage changes. */
  fitPlan(): void {
    this.autoFit = true;
    this.zoom = this.fitZoom();
    this.touch();
  }

  setZoom(zoom: number): void {
    this.autoFit = false;
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
    this.touch();
  }

  /** Next zoom level above (+1) or below (-1) the current one. */
  zoomStep(direction: 1 | -1): void {
    const next =
      direction > 0
        ? ZOOM_STEPS.find((z) => z > this.zoom + 0.001)
        : [...ZOOM_STEPS].reverse().find((z) => z < this.zoom - 0.001);
    if (next !== undefined) this.setZoom(next);
  }

  /* ---------- windows ---------- */

  openWindow(spec: WindowSpec): void {
    const key = windowKey(spec);
    const existing = this.windows.find((w) => w.id === key);
    if (existing) {
      // Same window, maybe another view (capture of another interface).
      if (JSON.stringify(existing.spec) !== JSON.stringify(spec)) {
        this.windows = this.windows.map((w) => (w.id === key ? { ...w, spec } : w));
        this.touch();
      }
      this.focusWindow(key);
      return;
    }
    const size = fitWindow(defaultWindowSize(spec), this.viewport, spec);
    const position = placeWindow(size, this.viewport, this.sideFor(spec), this.windows.length);
    this.windows = [...this.windows, { id: key, spec, z: ++this.zCounter, ...position, ...size }];
    this.touch();
  }

  /** Side of the stage where a window hides its device the least: the opposite one. */
  private sideFor(spec: WindowSpec): 'left' | 'right' {
    if (!this.viewport) return 'right';
    const anchor = 'deviceId' in spec ? spec.deviceId : spec.type === 'diagnose' ? spec.from : undefined;
    const device = anchor === undefined ? undefined : this.network.device(anchor);
    return device && device.position.x * this.zoom > this.viewport.width / 2 ? 'left' : 'right';
  }

  /** « Ranger » : cascades the windows again from the top right corner. */
  arrangeWindows(): void {
    const ordered = [...this.windows].sort((a, b) => a.z - b.z);
    this.windows = ordered.map((w, index) => {
      const size = fitWindow(defaultWindowSize(w.spec), this.viewport, w.spec);
      return { ...w, ...size, ...placeWindow(size, this.viewport, 'right', index), z: index + 1 };
    });
    this.zCounter = this.windows.length;
    this.touch();
  }

  closeAllWindows(): void {
    this.windows = [];
    this.touch();
  }

  /** Window drawn above the others, if any. */
  get topWindow(): OpenWindow | null {
    return this.windows.reduce<OpenWindow | null>((top, w) => (top && top.z > w.z ? top : w), null);
  }

  focusWindow(id: string): void {
    const top = Math.max(0, ...this.windows.map((w) => w.z));
    const target = this.windows.find((w) => w.id === id);
    if (!target || target.z === top) return;
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, z: ++this.zCounter } : w));
    // Keep the stacking numbers small: they are added to the CSS z-index of the windows.
    if (this.zCounter > 500) {
      const ordered = [...this.windows].sort((a, b) => a.z - b.z).map((w) => w.id);
      this.windows = this.windows.map((w) => ({ ...w, z: ordered.indexOf(w.id) + 1 }));
      this.zCounter = this.windows.length;
    }
    this.touch();
  }

  moveWindow(id: string, x: number, y: number): void {
    const position = clampWindow({ x, y }, this.viewport);
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, ...position } : w));
    this.touch();
  }

  closeWindow(id: string): void {
    this.windows = this.windows.filter((w) => w.id !== id);
    this.touch();
  }

  /* ---------- notices ---------- */

  notify(text: string, kind: Notice['kind'] = 'info'): void {
    this.notice = { id: ++this.noticeId, text, kind };
    this.touch();
  }

  dismissNotice(): void {
    this.notice = null;
    this.touch();
  }

  /* ---------- internals ---------- */

  touch(): void {
    this.revision++;
    this.emitter.emit('change', undefined);
  }

  private attach(): void {
    const net = this.network;
    this.unsubscribe = [
      net.events.on('change', () => {
        this.scheduleSave();
        if (this.mode === 'design') {
          this.designRevision++;
          this.scheduleHistory();
        }
        this.noteProgress();
        this.touch();
      }),
      net.events.on('transmit', (event) => {
        const protocol = protocolTag(event.frame);
        if (this.hideAutomatic && AUTOMATIC_PROTOCOLS.has(protocol)) return;
        this.inFlight.push({
          cableId: event.cableId,
          from: event.from,
          start: event.time,
          end: event.time + net.ctx.linkDelay,
          protocol,
          label: summarizeFrame(event.frame).protocol,
        });
      }),
      net.events.on('drop', (drop) => {
        if (this.mode !== 'simulation') return;
        if (this.hideAutomatic && AUTOMATIC_PROTOCOLS.has(transportTag(drop.payload))) return;
        const mark = { deviceId: drop.deviceId, reason: drop.reason, until: this.now() + DROP_MARK_MS };
        this.dropMarks = [...this.dropMarks.filter((m) => m.deviceId !== drop.deviceId), mark];
      }),
    ];
  }

  private detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }

  /** Arrival time of the last frame still on a cable, or null. */
  private busyUntil(): number | null {
    const now = this.network.scheduler.now;
    let until: number | null = null;
    for (const f of this.inFlight) if (f.end > now && (until === null || f.end > until)) until = f.end;
    return until;
  }

  private pruneDropMarks(): void {
    const now = this.now();
    if (this.dropMarks.some((m) => m.until <= now))
      this.dropMarks = this.dropMarks.filter((m) => m.until > now);
  }

  private pruneInFlight(): void {
    const now = this.network.scheduler.now;
    if (this.inFlight.some((f) => f.end < now)) this.inFlight = this.inFlight.filter((f) => f.end >= now);
  }

  private freePosition(): Position {
    const taken = this.network.devices.map((d) => d.position);
    for (let row = 0; ; row++) {
      for (let col = 0; col < 7; col++) {
        // Odd columns are shifted down by half a step so that a straight cable
        // between two devices of the same row never runs under a third one.
        const candidate = {
          x: 120 + col * DEFAULT_POSITION_STEP,
          y: 120 + row * DEFAULT_POSITION_STEP * 1.5 + (col % 2) * (DEFAULT_POSITION_STEP / 2),
        };
        if (!taken.some((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y) < 60)) return candidate;
      }
    }
  }

  private readPreference(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private restore(): Network | null {
    try {
      const saved = this.storage?.getItem(AUTOSAVE_KEY);
      if (!saved) return null;
      const { network, activity, work, pack } = parseLearnFile(saved);
      this.activity = activity;
      this.work = work ?? EMPTY_WORK;
      this.filePack = pack;
      if (network.devices.length > 0 || network.notes.length > 0 || activity) {
        const date = Number(this.storage?.getItem(AUTOSAVE_DATE_KEY) ?? NaN);
        this.resumed = { savedAt: Number.isFinite(date) && date > 0 ? date : null };
      }
      return network;
    } catch {
      return null;
    }
  }

  private scheduleSave(): void {
    if (!this.storage || this.saveTimer !== null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 1000);
  }

  saveNow(): void {
    try {
      this.storage?.setItem(AUTOSAVE_KEY, this.serialize());
      this.storage?.setItem(AUTOSAVE_DATE_KEY, String(this.now()));
    } catch {
      /* storage full or unavailable: autosave is a convenience only */
    }
  }
}
