import type { Host, HostService } from '../devices/host';

export interface LogEntry {
  readonly time: number;
  readonly text: string;
}

const LOG_LIMIT = 500;

/**
 * Base class of server applications. `active` is persistent (saved with the
 * project): an active server starts listening as soon as the simulation runs.
 */
export abstract class ServerApp implements HostService {
  private activeFlag = false;
  private listening = false;
  private entries: LogEntry[] = [];

  constructor(protected readonly host: Host) {
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
