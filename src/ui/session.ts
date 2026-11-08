import { Emitter } from '../engine/core/emitter';
import type { DeviceKind, Position } from '../engine/devices/device';
import { ConnectError, Network, type TransmitEvent } from '../engine/network';
import type { AppId } from '../engine/services/catalog';
import { exampleNetwork } from '../project/example';
import { parseProject, serializeProject } from '../project/serialize';
import { SimulationClock, type FrameSource } from './clock';

export type Mode = 'design' | 'simulation';
export type Tool = 'select' | 'cable';
export type Selection = { readonly kind: 'device' | 'cable'; readonly id: string } | null;

export type WindowSpec =
  | { readonly type: 'desktop'; readonly deviceId: string }
  | { readonly type: 'app'; readonly deviceId: string; readonly app: AppId | 'software' }
  | { readonly type: 'capture'; readonly deviceId: string }
  | { readonly type: 'switch'; readonly deviceId: string }
  | { readonly type: 'router'; readonly deviceId: string }
  | { readonly type: 'help' };

export interface OpenWindow {
  readonly id: string;
  readonly spec: WindowSpec;
  readonly z: number;
  readonly x: number;
  readonly y: number;
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

export const SPEEDS = [0.05, 0.1, 0.25, 0.5, 1, 2] as const;
export const AUTOSAVE_KEY = 'reseaulab:autosave';

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function windowKey(spec: WindowSpec): string {
  switch (spec.type) {
    case 'help':
      return 'help';
    case 'app':
      return `app:${spec.deviceId}:${spec.app}`;
    default:
      return `${spec.type}:${spec.deviceId}`;
  }
}

function protocolOf(event: TransmitEvent): string {
  const p = event.frame.payload;
  if (p.kind === 'arp') return 'arp';
  const t = p.payload;
  if (t.kind === 'icmp') return 'icmp';
  if (t.kind === 'udp') return t.data.kind === 'text' ? 'udp' : t.data.kind;
  return t.data.length > 0 ? 'tcp-data' : 'tcp';
}

const DEFAULT_POSITION_STEP = 140;

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
  ) {
    this.network = this.restore() ?? new Network();
    this.clock = new SimulationClock(
      () => this.network.scheduler,
      () => {
        this.pruneInFlight();
        this.touch();
      },
      frames,
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
    this.setMode('design');
    this.detach();
    this.network = network;
    this.selection = null;
    this.cableStart = null;
    this.windows = [];
    if (fileName) this.fileName = fileName;
    this.attach();
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

  serialize(): string {
    return serializeProject(this.network);
  }

  /* ---------- modes ---------- */

  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.tool = 'select';
    this.cableStart = null;
    this.windows = this.windows.filter((w) => w.spec.type === 'help');
    this.inFlight = [];
    if (mode === 'simulation') {
      this.network.start();
      this.paused = false;
      this.clock.start();
    } else {
      this.clock.stop();
      this.network.stop();
    }
    this.touch();
  }

  setSpeed(speed: number): void {
    this.clock.speed = speed;
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
    const pos = position ?? this.freePosition();
    const net = this.network;
    const device =
      kind === 'switch'
        ? net.addSwitch({ position: pos })
        : kind === 'router'
          ? net.addRouter({ position: pos, interfaces })
          : net.addHost(kind, { position: pos });
    this.selection = { kind: 'device', id: device.id };
    this.touch();
    return device.id;
  }

  select(selection: Selection): void {
    this.selection = selection;
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
    if (sel.kind === 'device') this.network.removeDevice(sel.id);
    else this.network.disconnect(sel.id);
    this.selection = null;
    this.touch();
  }

  /* ---------- windows ---------- */

  openWindow(spec: WindowSpec): void {
    const key = windowKey(spec);
    const existing = this.windows.find((w) => w.id === key);
    if (existing) {
      this.focusWindow(key);
      return;
    }
    const offset = (this.windows.length % 8) * 28;
    this.windows = [...this.windows, { id: key, spec, z: ++this.zCounter, x: 80 + offset, y: 60 + offset }];
    this.touch();
  }

  focusWindow(id: string): void {
    const top = Math.max(0, ...this.windows.map((w) => w.z));
    const target = this.windows.find((w) => w.id === id);
    if (!target || target.z === top) return;
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, z: ++this.zCounter } : w));
    this.touch();
  }

  moveWindow(id: string, x: number, y: number): void {
    this.windows = this.windows.map((w) => (w.id === id ? { ...w, x, y } : w));
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
        this.touch();
      }),
      net.events.on('transmit', (event) => {
        this.inFlight.push({
          cableId: event.cableId,
          from: event.from,
          start: event.time,
          end: event.time + net.ctx.linkDelay,
          protocol: protocolOf(event),
        });
      }),
    ];
  }

  private detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
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

  private restore(): Network | null {
    try {
      const saved = this.storage?.getItem(AUTOSAVE_KEY);
      return saved ? parseProject(saved) : null;
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
    } catch {
      /* storage full or unavailable: autosave is a convenience only */
    }
  }
}
