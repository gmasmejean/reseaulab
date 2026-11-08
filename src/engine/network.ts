import { Emitter } from './core/emitter';
import { MacAllocator } from './core/mac';
import { Scheduler } from './core/scheduler';
import type { Device, Position } from './devices/device';
import { Host, type HostConfig } from './devices/host';
import { MAX_ROUTER_INTERFACES, MIN_ROUTER_INTERFACES, Router } from './devices/router';
import { Switch } from './devices/switch';
import type { EthernetFrame } from './net/frames';
import { Cable, type SimContext } from './net/link';

export interface TransmitEvent {
  readonly cableId: string;
  /** Device the frame leaves from. */
  readonly from: string;
  readonly time: number;
  readonly frame: EthernetFrame;
}

export interface NetworkEvents extends Record<string, unknown> {
  change: undefined;
  transmit: TransmitEvent;
}

export interface CableEnds {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly portA: number;
  readonly portB: number;
}

export class ConnectError extends Error {}

/** Documentation drawn on the plan: a text label or a coloured zone. */
export interface Note {
  readonly id: string;
  readonly kind: 'text' | 'zone';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text: string;
  /** "#rrggbb": text colour for a label, fill colour for a zone. */
  readonly color: string;
  readonly fontSize: number;
  readonly bold: boolean;
  readonly italic: boolean;
}

export type NoteInit = Omit<Note, 'id'> & { readonly id?: string };
export type NotePatch = Partial<Omit<Note, 'id' | 'kind'>>;

export const LINK_DELAY = 10;

interface CreateOptions {
  readonly id?: string;
  readonly name?: string;
  readonly position?: Position;
}

const DEFAULT_NAMES: Record<Device['kind'], string> = {
  computer: 'Ordinateur',
  laptop: 'Portable',
  switch: 'Switch',
  router: 'Routeur',
};

/** Facade over a whole simulated network: topology, simulation clock, events. */
export class Network {
  readonly scheduler = new Scheduler();
  readonly events = new Emitter<NetworkEvents>();
  readonly macs = new MacAllocator();
  private readonly deviceMap = new Map<string, Device>();
  private readonly cableMap = new Map<string, Cable>();
  private readonly noteMap = new Map<string, Note>();
  private idCounter = 0;
  private runningFlag = false;
  private revision = 0;
  readonly ctx: SimContext;

  constructor() {
    this.ctx = {
      scheduler: this.scheduler,
      linkDelay: LINK_DELAY,
      onTransmit: (cable, from, frame) => {
        this.events.emit('transmit', {
          cableId: cable.id,
          from: from.owner.id,
          time: this.scheduler.now,
          frame,
        });
      },
      changed: () => {
        this.touch();
      },
    };
  }

  /** Increases on every observable change (used by the UI to re-render). */
  get version(): number {
    return this.revision;
  }

  get running(): boolean {
    return this.runningFlag;
  }

  get devices(): readonly Device[] {
    return [...this.deviceMap.values()];
  }

  get cables(): readonly CableEnds[] {
    return [...this.cableMap.values()].map((c) => ({
      id: c.id,
      a: c.a.owner.id,
      b: c.b.owner.id,
      portA: c.a.index,
      portB: c.b.index,
    }));
  }

  get notes(): readonly Note[] {
    return [...this.noteMap.values()];
  }

  note(id: string): Note | undefined {
    return this.noteMap.get(id);
  }

  addNote(init: NoteInit): Note {
    const id = this.newId(init.id, 'a');
    if (this.noteMap.has(id)) throw new Error(`Identifiant en double : ${id}`);
    const note: Note = { ...init, id };
    this.noteMap.set(id, note);
    this.touch();
    return note;
  }

  updateNote(id: string, patch: NotePatch): void {
    const note = this.noteMap.get(id);
    if (!note) return;
    this.noteMap.set(id, { ...note, ...patch });
    this.touch();
  }

  removeNote(id: string): void {
    if (this.noteMap.delete(id)) this.touch();
  }

  device(id: string): Device | undefined {
    return this.deviceMap.get(id);
  }

  cable(id: string): Cable | undefined {
    return this.cableMap.get(id);
  }

  host(id: string): Host {
    const device = this.deviceMap.get(id);
    if (!(device instanceof Host)) throw new Error(`${id} n’est pas un ordinateur`);
    return device;
  }

  router(id: string): Router {
    const device = this.deviceMap.get(id);
    if (!(device instanceof Router)) throw new Error(`${id} n’est pas un routeur`);
    return device;
  }

  addHost(
    kind: 'computer' | 'laptop' = 'computer',
    options: CreateOptions & { readonly config?: Partial<HostConfig>; readonly mac?: string } = {},
  ): Host {
    const mac = options.mac ?? this.macs.allocate();
    if (options.mac) this.macs.reserve(options.mac);
    const host = new Host(
      this.newId(options.id),
      kind,
      options.name ?? this.defaultName(kind),
      options.position ?? { x: 0, y: 0 },
      this.ctx,
      mac,
      options.config,
    );
    return this.register(host);
  }

  addSwitch(options: CreateOptions & { readonly ports?: number } = {}): Switch {
    const device = new Switch(
      this.newId(options.id),
      options.name ?? this.defaultName('switch'),
      options.position ?? { x: 0, y: 0 },
      this.ctx,
      options.ports,
    );
    return this.register(device);
  }

  addRouter(
    options: CreateOptions & { readonly interfaces?: number; readonly macs?: readonly string[] } = {},
  ): Router {
    const macs = options.macs ?? Array.from({ length: options.interfaces ?? 2 }, () => this.macs.allocate());
    if (options.macs) for (const mac of options.macs) this.macs.reserve(mac);
    const router = new Router(
      this.newId(options.id),
      options.name ?? this.defaultName('router'),
      options.position ?? { x: 0, y: 0 },
      this.ctx,
      macs,
    );
    return this.register(router);
  }

  /** Adds an interface (with a new MAC address) to a router. Design mode only. */
  addRouterInterface(routerId: string): void {
    const router = this.editableRouter(routerId);
    if (!router.canAddInterface) {
      throw new RangeError(`Un routeur a au plus ${MAX_ROUTER_INTERFACES} interfaces`);
    }
    router.addInterface(this.macs.allocate());
  }

  /**
   * Removes interface `index` of a router, with its cable if any. Static
   * routes through it are deleted; later interfaces are renumbered.
   */
  removeRouterInterface(routerId: string, index: number): void {
    const router = this.editableRouter(routerId);
    const port = router.portAt(index);
    if (!port) throw new RangeError(`Interface ${index} inexistante`);
    if (!router.canRemoveInterface) {
      throw new RangeError(`Un routeur a au moins ${MIN_ROUTER_INTERFACES} interfaces`);
    }
    if (port.cable) this.disconnect(port.cable.id);
    router.removeInterface(index);
    this.macs.release(port.mac);
  }

  private editableRouter(id: string): Router {
    if (this.runningFlag) throw new Error('Arrêtez la simulation pour modifier les interfaces');
    return this.router(id);
  }

  /** Cables two devices, on the given ports or else on their first free ports. */
  connect(
    aId: string,
    bId: string,
    options: { readonly id?: string; readonly portA?: number; readonly portB?: number } = {},
  ): Cable {
    const a = this.deviceMap.get(aId);
    const b = this.deviceMap.get(bId);
    if (!a || !b) throw new ConnectError('Équipement inconnu');
    if (a === b) throw new ConnectError('Un câble doit relier deux équipements différents');
    const pick = (device: Device, index: number | undefined) => {
      if (index === undefined) return device.freePort();
      const port = device.portAt(index);
      if (!port) throw new ConnectError(`« ${device.name} » n’a pas de port ${index}`);
      if (port.isConnected) throw new ConnectError(`Le port ${index} de « ${device.name} » est déjà utilisé`);
      return port;
    };
    const portA = pick(a, options.portA);
    const portB = pick(b, options.portB);
    if (!portA) throw new ConnectError(`« ${a.name} » n’a plus de port libre`);
    if (!portB) throw new ConnectError(`« ${b.name} » n’a plus de port libre`);
    const cable = new Cable(this.newId(options.id, 'c'), portA, portB, this.ctx);
    this.cableMap.set(cable.id, cable);
    this.touch();
    return cable;
  }

  disconnect(cableId: string): void {
    const cable = this.cableMap.get(cableId);
    if (!cable) return;
    cable.detach();
    this.cableMap.delete(cableId);
    this.touch();
  }

  removeDevice(id: string): void {
    const device = this.deviceMap.get(id);
    if (!device) return;
    for (const port of device.ports) if (port.cable) this.disconnect(port.cable.id);
    for (const port of device.ports) this.macs.release(port.mac);
    this.deviceMap.delete(id);
    this.touch();
  }

  rename(id: string, name: string): void {
    const device = this.deviceMap.get(id);
    if (!device) return;
    device.name = name.trim() || device.name;
    this.touch();
  }

  move(id: string, position: Position): void {
    const device = this.deviceMap.get(id);
    if (!device) return;
    device.position = position;
    this.touch();
  }

  /** Enters simulation mode. */
  start(): void {
    if (this.runningFlag) return;
    this.scheduler.reset();
    this.runningFlag = true;
    for (const device of this.deviceMap.values()) {
      device.simulating = true;
      device.start();
    }
    this.touch();
  }

  /** Leaves simulation mode and discards all runtime state. */
  stop(): void {
    if (!this.runningFlag) return;
    this.runningFlag = false;
    for (const device of this.deviceMap.values()) {
      device.simulating = false;
      device.stop();
    }
    this.scheduler.reset();
    this.touch();
  }

  /** Marks the network as changed. */
  touch(): void {
    this.revision++;
    this.events.emit('change', undefined);
  }

  private register<T extends Device>(device: T): T {
    if (this.deviceMap.has(device.id)) throw new Error(`Identifiant en double : ${device.id}`);
    this.deviceMap.set(device.id, device);
    if (this.runningFlag) {
      device.simulating = true;
      device.start();
    }
    this.touch();
    return device;
  }

  private newId(requested: string | undefined, prefix = 'n'): string {
    if (requested !== undefined) {
      const match = /(\d+)$/.exec(requested);
      if (match) this.idCounter = Math.max(this.idCounter, Number(match[1]));
      return requested;
    }
    let id: string;
    do {
      id = `${prefix}${++this.idCounter}`;
    } while (this.deviceMap.has(id) || this.cableMap.has(id) || this.noteMap.has(id));
    return id;
  }

  private defaultName(kind: Device['kind']): string {
    const base = DEFAULT_NAMES[kind];
    const taken = new Set(this.devices.map((d) => d.name));
    let n = 1;
    while (taken.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  }
}
