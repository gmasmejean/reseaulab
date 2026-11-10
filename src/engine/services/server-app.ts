import type { HostService } from '../devices/host';
import type { IpStack } from '../stack/ip-stack';

export interface LogEntry {
  readonly time: number;
  readonly text: string;
}

const LOG_LIMIT = 500;

/** What a server needs from the device it runs on (a terminal, or a box for DHCP). */
export interface ServiceHost {
  readonly stack: IpStack;
  readonly simulating: boolean;
  changed(): void;
  addService(service: HostService): void;
}

/**
 * Base class of server applications. `active` is persistent (saved with the
 * project): an active server starts listening as soon as the simulation runs.
 */
export abstract class ServerApp<H extends ServiceHost = ServiceHost> implements HostService {
  private activeFlag = false;
  private listening = false;
  private entries: LogEntry[] = [];

  constructor(protected readonly host: H) {
    host.addService(this);
  }

  get active(): boolean {
    return this.activeFlag;
  }

  get isListening(): boolean {
    return this.listening;
  }

  get log(): readonly LogEntry[] {
    return this.entries;
  }

  setActive(active: boolean): void {
    this.activeFlag = active;
    if (this.host.simulating) {
      if (active) this.start();
      else this.stop();
    }
    this.host.changed();
  }

  start(): void {
    if (!this.activeFlag || this.listening) return;
    try {
      this.listen();
      this.listening = true;
      this.addLog('Serveur démarré');
    } catch (error) {
      this.addLog(error instanceof Error ? error.message : String(error));
    }
  }

  stop(): void {
    if (this.listening) this.unlisten();
    this.listening = false;
    this.entries = [];
  }

  protected abstract listen(): void;
  protected abstract unlisten(): void;

  protected addLog(text: string): void {
    this.entries.push({ time: this.host.stack.scheduler.now, text });
    if (this.entries.length > LOG_LIMIT) this.entries.shift();
    this.host.changed();
  }
}
