import { formatIp } from '../core/ipv4';
import type { Host } from '../devices/host';
import { isValidPort } from '../stack/ports';
import type { CloseReason, TcpSocket } from '../stack/tcp';
import { DNS_ERROR_TEXT } from './dns';
import { ServerApp } from './server-app';
import { CRLF, LineBuffer } from './text-stream';

export const DEFAULT_ECHO_PORT = 55555;

/** Sends back every line it receives. */
export class EchoServer extends ServerApp {
  private portNumber = DEFAULT_ECHO_PORT;
  private stopListening: (() => void) | null = null;

  get port(): number {
    return this.portNumber;
  }

  setPort(port: number): void {
    if (!isValidPort(port)) throw new RangeError(`Port invalide : ${port}`);
    const restart = this.isListening;
    if (restart) this.stop();
    this.portNumber = port;
    if (restart) this.start();
    this.host.changed();
  }

  protected listen(): void {
    this.stopListening = this.host.tcp.listen(this.portNumber, (socket) => {
      const client = formatIp(socket.remoteIp);
      this.addLog(`Connexion de ${client}`);
      const lines = new LineBuffer();
      socket.on({
        data: (chunk) => {
          for (const line of lines.push(chunk)) {
            this.addLog(`${client} : ${line}`);
            socket.send(`${line}${CRLF}`);
          }
        },
        close: () => {
          this.addLog(`Déconnexion de ${client}`);
        },
      });
    });
  }

  protected unlisten(): void {
    this.stopListening?.();
    this.stopListening = null;
  }
}

export const CLOSE_TEXT: Record<CloseReason, string> = {
  closed: 'Connexion fermée',
  reset: 'Connexion réinitialisée par le serveur',
  refused: 'Connexion refusée',
  timeout: 'Le serveur ne répond pas',
  'no-route': 'Aucune route vers le serveur',
};

export interface LineClientEvents {
  readonly connected: (remote: string) => void;
  readonly line: (line: string) => void;
  readonly closed: (message: string) => void;
}

/** Simple text client ("client simple"): connect to host:port, exchange lines. */
export class LineClient {
  private socket: TcpSocket | null = null;

  constructor(
    private readonly host: Host,
    private readonly events: LineClientEvents,
  ) {}

  get connected(): boolean {
    return this.socket?.isOpen ?? false;
  }

  connect(server: string, port: number): void {
    this.disconnect();
    this.host.dns.resolve(server, (resolved) => {
      if (resolved.kind === 'error') {
        this.events.closed(`« ${server} » introuvable : ${DNS_ERROR_TEXT[resolved.error]}`);
        return;
      }
      const lines = new LineBuffer();
      const socket = this.host.tcp.connect(resolved.ip, port, {
        open: () => {
          this.events.connected(`${formatIp(resolved.ip)}:${port}`);
        },
        data: (chunk) => {
          for (const line of lines.push(chunk)) this.events.line(line);
        },
        close: (reason) => {
          if (this.socket === socket) this.socket = null;
          this.events.closed(CLOSE_TEXT[reason]);
        },
      });
      this.socket = socket;
    });
  }

  send(line: string): void {
    this.socket?.send(`${line}${CRLF}`);
  }

  disconnect(): void {
    this.socket?.close();
  }
}
