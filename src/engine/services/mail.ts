import { formatIp, type Ipv4 } from '../core/ipv4';
import type { Host } from '../devices/host';
import type { TcpSocket } from '../stack/tcp';
import { DNS_ERROR_TEXT } from './dns';
import { ServerApp } from './server-app';
import { CRLF, LineBuffer, domainOf, isValidEmail, normalizeDomain, userOf } from './text-stream';

export const SMTP_PORT = 25;
export const POP3_PORT = 110;

export interface Email {
  readonly from: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly body: string;
  /** Virtual time (ms) at which the message was sent. */
  readonly date: number;
}

/* ---------- message format (RFC 5322 flavoured) ---------- */

export function formatEmail(email: Email): string {
  const headers = [
    `From: ${email.from}`,
    `To: ${email.to.join(', ')}`,
    ...(email.cc.length > 0 ? [`Cc: ${email.cc.join(', ')}`] : []),
    `Subject: ${email.subject}`,
    `Date: ${email.date}`,
  ];
  return [...headers, '', email.body].join(CRLF);
}

export function parseEmail(text: string): Email {
  const normalized = text.replaceAll(CRLF, '\n');
  const split = normalized.indexOf('\n\n');
  const head = split < 0 ? normalized : normalized.slice(0, split);
  const body = split < 0 ? '' : normalized.slice(split + 2);
  const headers = new Map<string, string>();
  for (const line of head.split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  const list = (name: string) =>
    (headers.get(name) ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a !== '');
  return {
    from: headers.get('from') ?? '',
    to: list('to'),
    cc: list('cc'),
    subject: headers.get('subject') ?? '',
    body,
    date: Number(headers.get('date') ?? 0) || 0,
  };
}

/** Dot-stuffing for the SMTP DATA / POP3 RETR terminator. */
function encodeData(text: string): string[] {
  return text.split(/\r?\n/).map((line) => (line.startsWith('.') ? `.${line}` : line));
}

function decodeLine(line: string): string {
  return line.startsWith('..') ? line.slice(1) : line;
}

/* ---------- generic line-based client ---------- */

interface Step {
  readonly send?: string | readonly string[];
  /** Expected reply prefix ("250", "+OK"…). */
  readonly expect: string;
  /** Reply is multi-line, terminated by "." (POP3 LIST/RETR). */
  readonly multiline?: boolean;
  readonly onReply?: (first: string, lines: readonly string[]) => void;
}

/**
 * Runs a scripted command/response dialogue over TCP. Steps can be appended
 * while running (e.g. RETR commands after STAT).
 */
class Dialogue {
  private readonly steps: Step[] = [];
  private index = 0;
  private finished = false;
  private multi: string[] | null = null;
  private first = '';

  constructor(
    private readonly socket: TcpSocket,
    private readonly fail: (message: string) => void,
    private readonly succeed: () => void,
  ) {
    const lines = new LineBuffer();
    socket.on({
      data: (chunk) => {
        for (const line of lines.push(chunk)) this.onLine(line);
      },
      close: (reason) => {
        if (!this.finished) this.end(`Connexion interrompue (${reason})`);
      },
    });
  }

  add(step: Step): void {
    this.steps.push(step);
  }

  private onLine(line: string): void {
    if (this.finished) return;
    const step = this.steps[this.index];
    if (!step) return;
    if (this.multi) {
      if (line === '.') {
        const collected = this.multi;
        this.multi = null;
        step.onReply?.(this.first, collected);
        this.next();
      } else {
        this.multi.push(decodeLine(line));
      }
      return;
    }
    if (!line.startsWith(step.expect)) {
      this.end(`Réponse inattendue du serveur : ${line}`);
      return;
    }
    if (step.multiline) {
      this.first = line;
      this.multi = [];
      return;
    }
    step.onReply?.(line, []);
    this.next();
  }

  private next(): void {
    this.index++;
    const step = this.steps[this.index];
    if (!step) {
      this.end(null);
      return;
    }
    if (step.send !== undefined) {
      const lines = typeof step.send === 'string' ? [step.send] : step.send;
      this.socket.send(lines.map((l) => `${l}${CRLF}`).join(''));
    }
  }

  private end(error: string | null): void {
    if (this.finished) return;
    this.finished = true;
    this.socket.close();
    if (error === null) this.succeed();
    else this.fail(error);
  }
}

export type MailResult = { readonly kind: 'ok' } | { readonly kind: 'error'; readonly message: string };

function resolveServer(host: Host, server: string, done: (ip: Ipv4 | null, error: string) => void): void {
  host.dns.resolve(server, (result) => {
    if (result.kind === 'ok') done(result.ip, '');
    else done(null, `Serveur « ${server} » introuvable : ${DNS_ERROR_TEXT[result.error]}`);
  });
}

/** Sends an e-mail to an SMTP server (name or IP). */
export function smtpSend(host: Host, server: string, email: Email, done: (result: MailResult) => void): void {
  resolveServer(host, server, (ip, error) => {
    if (ip === null) {
      done({ kind: 'error', message: error });
      return;
    }
    const socket = host.tcp.connect(ip, SMTP_PORT);
    const dialogue = new Dialogue(
      socket,
      (message) => {
        done({ kind: 'error', message });
      },
      () => {
        done({ kind: 'ok' });
      },
    );
    dialogue.add({ expect: '220' });
    dialogue.add({ send: `HELO ${host.name}`, expect: '250' });
    dialogue.add({ send: `MAIL FROM:<${email.from}>`, expect: '250' });
    for (const rcpt of [...email.to, ...email.cc]) dialogue.add({ send: `RCPT TO:<${rcpt}>`, expect: '250' });
    dialogue.add({ send: 'DATA', expect: '354' });
    dialogue.add({ send: [...encodeData(formatEmail(email)), '.'], expect: '250' });
    dialogue.add({ send: 'QUIT', expect: '221' });
  });
}

export interface Pop3Result {
  readonly kind: 'ok';
  readonly emails: readonly Email[];
}

/** Downloads (and deletes from the server) every message of a POP3 mailbox. */
export function pop3Fetch(
  host: Host,
  server: string,
  user: string,
  password: string,
  done: (result: Pop3Result | { readonly kind: 'error'; readonly message: string }) => void,
): void {
  resolveServer(host, server, (ip, error) => {
    if (ip === null) {
      done({ kind: 'error', message: error });
      return;
    }
    const emails: Email[] = [];
    const socket = host.tcp.connect(ip, POP3_PORT);
    const dialogue = new Dialogue(
      socket,
      (message) => {
        done({ kind: 'error', message });
      },
      () => {
        done({ kind: 'ok', emails });
      },
    );
    dialogue.add({ expect: '+OK' });
    dialogue.add({ send: `USER ${user}`, expect: '+OK' });
    dialogue.add({ send: `PASS ${password}`, expect: '+OK' });
    dialogue.add({
      send: 'STAT',
      expect: '+OK',
      onReply: (line) => {
        const count = Number(line.split(' ')[1] ?? 0);
        for (let i = 1; i <= count; i++) {
          dialogue.add({
            send: `RETR ${i}`,
            expect: '+OK',
            multiline: true,
            onReply: (_first, lines) => emails.push(parseEmail(lines.join('\n'))),
          });
          dialogue.add({ send: `DELE ${i}`, expect: '+OK' });
        }
        dialogue.add({ send: 'QUIT', expect: '+OK' });
      },
    });
  });
}

/* ---------- server ---------- */

export interface MailAccount {
  readonly user: string;
  password: string;
  mailbox: Email[];
}

export interface MailServerConfig {
  domain: string;
  accounts: MailAccount[];
}

/** SMTP (port 25) + POP3 (port 110) server; relays foreign domains using MX records. */
export class MailServer extends ServerApp {
  config: MailServerConfig = { domain: '', accounts: [] };
  private closers: (() => void)[] = [];

  updateConfig(config: Partial<MailServerConfig>): void {
    this.config = { ...this.config, ...config };
    this.host.changed();
  }

  account(user: string): MailAccount | undefined {
    return this.config.accounts.find((a) => a.user === user.toLowerCase());
  }

  addAccount(user: string, password: string): void {
    const name = user.trim().toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(name)) throw new Error(`Nom d’utilisateur invalide : « ${user} »`);
    if (this.account(name)) throw new Error(`Le compte « ${name} » existe déjà`);
    this.config.accounts.push({ user: name, password, mailbox: [] });
    this.host.changed();
  }

  removeAccount(user: string): void {
    this.config.accounts = this.config.accounts.filter((a) => a.user !== user);
    this.host.changed();
  }

  isLocal(address: string): boolean {
    return domainOf(address) === normalizeDomain(this.config.domain);
  }

  protected listen(): void {
    this.closers = [
      this.host.tcp.listen(SMTP_PORT, (s) => {
        this.smtpSession(s);
      }),
      this.host.tcp.listen(POP3_PORT, (s) => {
        this.pop3Session(s);
      }),
    ];
  }

  protected unlisten(): void {
    for (const close of this.closers) close();
    this.closers = [];
  }

  private smtpSession(socket: TcpSocket): void {
    const reply = (line: string) => {
      socket.send(`${line}${CRLF}`);
    };
    const lines = new LineBuffer();
    let from = '';
    let recipients: string[] = [];
    let data: string[] | null = null;
    reply(`220 ${this.config.domain || this.host.name} SMTP prêt`);
    socket.on({
      data: (chunk) => {
        for (const line of lines.push(chunk)) {
          if (data) {
            if (line === '.') {
              const email = parseEmail(data.join('\n'));
              data = null;
              this.accept(email, from, recipients);
              recipients = [];
              reply('250 Message accepté');
            } else {
              data.push(decodeLine(line));
            }
            continue;
          }
          const [command = '', ...rest] = line.split(' ');
          const arg = rest.join(' ');
          const address = /<([^>]*)>/.exec(arg)?.[1]?.trim() ?? '';
          switch (command.toUpperCase()) {
            case 'HELO':
            case 'EHLO':
              reply(`250 Bonjour ${arg}`);
              break;
            case 'MAIL':
              from = address;
              recipients = [];
              reply('250 OK');
              break;
            case 'RCPT':
              if (!isValidEmail(address)) reply('501 Adresse invalide');
              else if (this.isLocal(address) && !this.account(userOf(address)))
                reply(`550 Destinataire inconnu : ${address}`);
              else {
                recipients.push(address);
                reply('250 OK');
              }
              break;
            case 'DATA':
              if (recipients.length === 0) reply('503 Aucun destinataire');
              else {
                data = [];
                reply('354 Terminez par une ligne contenant un point');
              }
              break;
            case 'QUIT':
              reply('221 Au revoir');
              socket.close();
              break;
            default:
              reply('500 Commande inconnue');
          }
        }
      },
    });
  }

  private accept(email: Email, from: string, recipients: readonly string[]): void {
    const foreign = new Map<string, string[]>();
    for (const rcpt of recipients) {
      if (this.isLocal(rcpt)) {
        this.account(userOf(rcpt))?.mailbox.push(email);
        this.addLog(`Message de ${from} remis à ${rcpt}`);
      } else {
        const domain = domainOf(rcpt);
        foreign.set(domain, [...(foreign.get(domain) ?? []), rcpt]);
      }
    }
    for (const [domain, rcpts] of foreign) this.relay(domain, { ...email, to: rcpts, cc: [] });
  }

  /** Forwards a message to the mail server of another domain (MX record). */
  private relay(domain: string, email: Email): void {
    this.host.dns.query(domain, 'MX', (result) => {
      const target = result.kind === 'ok' ? result.records.find((r) => r.type === 'MX')?.value : undefined;
      const server = target ?? domain;
      this.addLog(`Relais vers ${server} pour ${email.to.join(', ')}`);
      smtpSend(this.host, server, email, (sent) => {
        this.addLog(
          sent.kind === 'ok' ? `Relais vers ${server} réussi` : `Échec du relais : ${sent.message}`,
        );
      });
    });
  }

  private pop3Session(socket: TcpSocket): void {
    const reply = (line: string) => {
      socket.send(`${line}${CRLF}`);
    };
    const lines = new LineBuffer();
    let user = '';
    let account: MailAccount | null = null;
    const deleted = new Set<number>();
    reply('+OK Serveur POP3 prêt');
    socket.on({
      data: (chunk) => {
        for (const line of lines.push(chunk)) {
          const [command = '', arg = ''] = line.split(' ');
          const message = (n: string) => {
            const index = Number(n) - 1;
            return account && !deleted.has(index) ? (account.mailbox[index] ?? null) : null;
          };
          switch (command.toUpperCase()) {
            case 'USER':
              user = arg.toLowerCase();
              reply('+OK');
              break;
            case 'PASS': {
              const candidate = this.account(user);
              if (candidate?.password === line.slice(5)) {
                account = candidate;
                this.addLog(`Connexion POP3 de ${user} (${formatIp(socket.remoteIp)})`);
                reply('+OK Connecté');
              } else reply('-ERR Identifiant ou mot de passe incorrect');
              break;
            }
            case 'STAT':
              if (!account) reply('-ERR Non connecté');
              else
                reply(
                  `+OK ${account.mailbox.length} ${account.mailbox.reduce((n, m) => n + formatEmail(m).length, 0)}`,
                );
              break;
            case 'RETR': {
              const email = message(arg);
              if (!email) reply('-ERR Message inexistant');
              else
                socket.send(
                  [`+OK`, ...encodeData(formatEmail(email)), '.'].map((l) => `${l}${CRLF}`).join(''),
                );
              break;
            }
            case 'DELE':
              if (!message(arg)) reply('-ERR Message inexistant');
              else {
                deleted.add(Number(arg) - 1);
                reply('+OK Supprimé');
              }
              break;
            case 'QUIT':
              if (account) {
                const box = account;
                box.mailbox = box.mailbox.filter((_, i) => !deleted.has(i));
                this.host.changed();
              }
              reply('+OK Au revoir');
              socket.close();
              break;
            default:
              reply('-ERR Commande inconnue');
          }
        }
      },
    });
  }
}

/* ---------- client application ---------- */

export interface MailClientAccount {
  address: string;
  smtpServer: string;
  pop3Server: string;
  user: string;
  password: string;
}

/** E-mail program of a computer: one account, inbox and sent folder (persistent). */
export class MailClient {
  account: MailClientAccount = { address: '', smtpServer: '', pop3Server: '', user: '', password: '' };
  inbox: Email[] = [];
  sent: Email[] = [];

  constructor(private readonly host: Host) {}

  updateAccount(account: Partial<MailClientAccount>): void {
    this.account = { ...this.account, ...account };
    this.host.changed();
  }

  send(message: Pick<Email, 'to' | 'cc' | 'subject' | 'body'>, done: (result: MailResult) => void): void {
    const invalid = [...message.to, ...message.cc].find((a) => !isValidEmail(a));
    if (message.to.length === 0 || invalid !== undefined || !isValidEmail(this.account.address)) {
      this.host.stack.scheduler.schedule(0, () => {
        done({
          kind: 'error',
          message: invalid ? `Adresse invalide : ${invalid}` : 'Expéditeur ou destinataire manquant',
        });
      });
      return;
    }
    const email: Email = { ...message, from: this.account.address, date: this.host.stack.scheduler.now };
    smtpSend(this.host, this.account.smtpServer, email, (result) => {
      if (result.kind === 'ok') {
        this.sent.push(email);
        this.host.changed();
      }
      done(result);
    });
  }

  fetch(done: (result: { kind: 'ok'; count: number } | { kind: 'error'; message: string }) => void): void {
    const { pop3Server, user, password } = this.account;
    pop3Fetch(this.host, pop3Server, user, password, (result) => {
      if (result.kind === 'error') {
        done(result);
        return;
      }
      this.inbox.push(...result.emails);
      this.host.changed();
      done({ kind: 'ok', count: result.emails.length });
    });
  }
}
