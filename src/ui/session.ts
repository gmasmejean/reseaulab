import { Emitter } from '../engine/core/emitter';
import type { DeviceKind, Position } from '../engine/devices/device';
import { protocolTag } from '../engine/net/describe';
import { ConnectError, Network } from '../engine/network';
import type { AppId } from '../engine/services/catalog';
import { exampleNetwork } from '../project/example';
import { importFilius } from '../project/filius';
import { parseProject, serializeProject } from '../project/serialize';
import { SimulationClock, type FrameSource } from './clock';
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
  | { readonly type: 'router'; readonly deviceId: string }
  | { readonly type: 'help' }
  /**
   * « Vérifier mon réseau ». With `from` and `to`, the communication between
   * them is tested at once; `at` tells two requests for the same test apart.
   */
  | { readonly type: 'diagnose'; readonly from?: string; readonly to?: string; readonly at?: number };

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
}

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

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function windowKey(spec: WindowSpec): string {
  switch (spec.type) {
    case 'help':
    case 'diagnose':
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
  /** Set while the pupil has not said what to do with the work found at start-up. */
  resumed: Resumed | null = null;
  /** Validates the text field being edited; false when its value is refused. */
  private pendingEdit: (() => boolean) | null = null;
  /** Size of the stage (plan and windows), once known. */
  viewport: Size | null = null;
  /** Scale of the plan: 1 = real size. */
  zoom = 1;
  /** The zoom follows the size of the stage until the pupil chooses one. */
  autoFit = true;
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
    this.present = this.serialize();
    this.hideAutomatic = this.readPreference(HIDE_AUTOMATIC_KEY) === 'oui';
    this.clock = new SimulationClock(
      () => this.network.scheduler,
      () => {
        this.pruneInFlight();
        this.touch();
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

  /* ---------- project ---------- */

  replaceNetwork(network: Network, fileName?: string): void {
    this.pendingEdit = null;
    this.setMode('design');
    this.commitHistory();
    this.detach();
    this.network = network;
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
      this.replaceNetwork(parseProject(text), fileName);
      this.notify(`Projet « ${fileName} » ouvert.`);
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

  serialize(): string {
    return serializeProject(this.network);
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
    this.windows = this.windows.filter((w) => w.spec.type === 'help' || w.spec.type === 'diagnose');
    this.inFlight = [];
    if (mode === 'simulation') {
      this.commitHistory();
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

  togglePause(): void {
    if (this.mode !== 'simulation') return;
    this.paused = !this.paused;
    if (this.paused) this.clock.stop();
    else this.clock.start();
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
    const current = this.serialize();
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
    this.present = this.serialize();
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
    const size = fitWindow(defaultWindowSize(spec), this.viewport);
    const position = placeWindow(size, this.viewport, this.sideFor(spec), this.windows.length);
    this.windows = [...this.windows, { id: key, spec, z: ++this.zCounter, ...position, ...size }];
    this.touch();
  }

  /** Side of the stage where a window hides its device the least: the opposite one. */
  private sideFor(spec: WindowSpec): 'left' | 'right' {
    if (spec.type === 'help' || !this.viewport) return 'right';
    const device = this.network.device(spec.type === 'diagnose' ? (spec.from ?? '') : spec.deviceId);
    return device && device.position.x * this.zoom > this.viewport.width / 2 ? 'left' : 'right';
  }

  /** « Ranger » : cascades the windows again from the top right corner. */
  arrangeWindows(): void {
    const ordered = [...this.windows].sort((a, b) => a.z - b.z);
    this.windows = ordered.map((w, index) => {
      const size = fitWindow(defaultWindowSize(w.spec), this.viewport);
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
        if (this.mode === 'design') this.scheduleHistory();
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
        });
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
      const network = parseProject(saved);
      if (network.devices.length > 0 || network.notes.length > 0) {
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
