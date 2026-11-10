import { formatIp, type Ipv4 } from '../core/ipv4';
import type { Host } from '../devices/host';
import { joinPath, mimeType, splitPath } from '../fs/filesystem';
import type { TcpSocket } from '../stack/tcp';
import { DNS_ERROR_TEXT } from './dns';
import { ServerApp } from './server-app';
import { CRLF, LineBuffer } from './text-stream';

export const HTTP_PORT = 80;
export const WEB_ROOT = '/webserver';

export const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  400: 'Bad Request',
  404: 'Not Found',
  405: 'Method Not Allowed',
};

export interface HttpResponse {
  readonly status: number;
  readonly reason: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export function formatResponse(status: number, body: string, contentType: string): string {
  return [
    `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? ''}`,
    `Content-Type: ${contentType}`,
    `Content-Length: ${body.length}`,
    'Connection: close',
    '',
    body,
  ].join(CRLF);
}

export function parseResponse(raw: string): HttpResponse | null {
  const split = raw.indexOf(`${CRLF}${CRLF}`);
  if (split < 0) return null;
  const [statusLine = '', ...headerLines] = raw.slice(0, split).split(CRLF);
  const match = /^HTTP\/1\.[01] (\d{3}) ?(.*)$/.exec(statusLine);
  if (!match) return null;
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const colon = line.indexOf(':');
    if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { status: Number(match[1]), reason: match[2] ?? '', headers, body: raw.slice(split + 4) };
}

export interface ParsedUrl {
  readonly host: string;
  readonly port: number;
  readonly path: string;
}

/** Parses "http://host[:port]/path" (the scheme is optional). */
export function parseUrl(url: string): ParsedUrl | null {
  const match = /^(?:http:\/\/)?([^/:\s]+)(?::(\d{1,5}))?(\/[^\s]*)?$/i.exec(url.trim());
  if (!match?.[1]) return null;
  const port = match[2] ? Number(match[2]) : HTTP_PORT;
  if (port < 1 || port > 65535) return null;
  return { host: match[1].toLowerCase(), port, path: match[3] ?? '/' };
}

export function formatUrl(url: ParsedUrl): string {
  return `http://${url.host}${url.port === HTTP_PORT ? '' : `:${url.port}`}${url.path}`;
}

/** Resolves a link found in a page relative to the page URL. */
export function resolveLink(base: ParsedUrl, href: string): string {
  if (/^http:\/\//i.test(href)) return href;
  if (href.startsWith('/')) return formatUrl({ ...base, path: href });
  const dir = base.path.slice(0, base.path.lastIndexOf('/') + 1);
  return formatUrl({ ...base, path: joinPath(splitPath(href, dir)) });
}

export type HttpResult =
  | { readonly kind: 'ok'; readonly response: HttpResponse; readonly server: Ipv4 }
  | { readonly kind: 'error'; readonly message: string };

/** Web browser side: resolves the host name, connects, sends GET and reads the response. */
export function httpGet(host: Host, url: string, done: (result: HttpResult) => void): void {
  const parsed = parseUrl(url);
  if (!parsed) {
    host.stack.scheduler.schedule(0, () => {
      done({ kind: 'error', message: `Adresse invalide : ${url}` });
    });
    return;
  }
  host.dns.resolve(parsed.host, (resolved) => {
    if (resolved.kind === 'error') {
      done({
        kind: 'error',
        message: `Impossible de trouver « ${parsed.host} » : ${DNS_ERROR_TEXT[resolved.error]}`,
      });
      return;
    }
    let received = '';
    const socket = host.tcp.connect(resolved.ip, parsed.port, {
      open: () => {
        socket.send(
          [`GET ${parsed.path} HTTP/1.1`, `Host: ${parsed.host}`, 'User-Agent: RéseauLab', '', ''].join(CRLF),
        );
      },
      data: (chunk) => {
        received += chunk;
      },
      close: (reason) => {
        const response = parseResponse(received);
        if (response) done({ kind: 'ok', response, server: resolved.ip });
        else if (reason === 'refused')
          done({ kind: 'error', message: `Connexion refusée par ${formatIp(resolved.ip)}` });
        else if (reason === 'timeout' || reason === 'no-route')
          done({ kind: 'error', message: `Le serveur ${formatIp(resolved.ip)} ne répond pas` });
        else done({ kind: 'error', message: 'Réponse du serveur invalide' });
      },
    });
  });
}

const DEFAULT_INDEX = `<html>
<head><title>Bienvenue</title></head>
<body>
<h1>Bienvenue !</h1>
<p>Cette page est servie par le serveur web de ce poste.</p>
<p>Modifiez le fichier <b>/webserver/index.html</b> avec l’éditeur de texte.</p>
</body>
</html>
`;

const NOT_FOUND = '<html><head><title>404</title></head><body><h1>404 – Page introuvable</h1></body></html>';

/** Serves the files stored under /webserver on TCP port 80. */
export class WebServer extends ServerApp<Host> {
  private stopListening: (() => void) | null = null;

  /** Creates the web root and a default home page if missing. */
  ensureContent(): void {
    const fs = this.host.fs;
    if (!fs.isDirectory(WEB_ROOT)) fs.mkdir(WEB_ROOT, true);
    if (!fs.exists(`${WEB_ROOT}/index.html`)) fs.writeFile(`${WEB_ROOT}/index.html`, DEFAULT_INDEX);
  }

  protected listen(): void {
    this.stopListening = this.host.tcp.listen(HTTP_PORT, (socket) => {
      this.serve(socket);
    });
  }

  protected unlisten(): void {
    this.stopListening?.();
    this.stopListening = null;
  }

  private serve(socket: TcpSocket): void {
    const lines = new LineBuffer();
    const request: string[] = [];
    let answered = false;
    socket.on({
      data: (chunk) => {
        if (answered) return;
        for (const line of lines.push(chunk)) {
          if (line !== '') {
            request.push(line);
            continue;
          }
          answered = true;
          this.respond(socket, request[0] ?? '');
          return;
        }
      },
    });
  }

  private respond(socket: TcpSocket, requestLine: string): void {
    const client = formatIp(socket.remoteIp);
    const match = /^(\S+) (\S+) HTTP\/1\.[01]$/.exec(requestLine);
    let status = 200;
    let body: string;
    let type = 'text/html';
    if (!match?.[1] || !match[2]) {
      status = 400;
      body = '<html><body><h1>400 – Requête invalide</h1></body></html>';
    } else if (match[1] !== 'GET') {
      status = 405;
      body = '<html><body><h1>405 – Méthode non autorisée</h1></body></html>';
    } else {
      const path = this.filePath(match[2]);
      const content = path === null ? null : this.host.fs.readFile(path);
      if (path === null || content === null) {
        status = 404;
        body = NOT_FOUND;
      } else {
        body = content;
        type = mimeType(path);
      }
    }
    this.addLog(`${client} : ${requestLine || '(vide)'} → ${status}`);
    socket.send(formatResponse(status, body, type));
    socket.close();
  }

  /** Maps a URL path to a file under the web root (directories serve index.html). */
  private filePath(urlPath: string): string | null {
    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
    } catch {
      return null;
    }
    const path = joinPath([...splitPath(WEB_ROOT), ...splitPath(decoded)]);
    return this.host.fs.isDirectory(path) ? `${path}/index.html` : path;
  }
}
