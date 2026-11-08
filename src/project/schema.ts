import { z } from 'zod';
import { isValidMask, parseIp } from '../engine/core/ipv4';
import { isValidMac } from '../engine/core/mac';
import type { FsJson } from '../engine/fs/filesystem';
import { APP_IDS } from '../engine/services/catalog';

/* Project file format, version 1. IPv4 addresses are stored as dotted strings
 * so that files stay readable. Every field is validated when loading. */

export const PROJECT_FORMAT = 'reseaulab';
export const PROJECT_VERSION = 1;
/** Maximum accepted size of a project file (characters). */
export const MAX_PROJECT_SIZE = 20_000_000;

const text = (max: number) => z.string().max(max);
const name = z.string().trim().min(1).max(64);
const ip = z.string().refine((v) => parseIp(v) !== null, { message: 'Adresse IPv4 invalide' });
const mask = z.string().refine(
  (v) => {
    const m = parseIp(v);
    return m !== null && isValidMask(m);
  },
  { message: 'Masque invalide' },
);
const mac = z.string().refine(isValidMac, { message: 'Adresse MAC invalide' });
const coordinate = z.number().min(-100_000).max(100_000);
const port = z.number().int().min(1).max(65535);

const fsJson: z.ZodType<FsJson> = z.lazy(() => z.record(text(64), z.union([text(5_000_000), fsJson])));

const firewallRule = z.object({
  action: z.enum(['accept', 'drop']),
  protocol: z.enum(['any', 'tcp', 'udp', 'icmp']),
  source: ip,
  sourceMask: mask,
  destination: ip,
  destinationMask: mask,
  port: z.number().int().min(0).max(65535),
});

const firewall = z.object({ enabled: z.boolean(), rules: z.array(firewallRule).max(200) });

const email = z.object({
  from: text(200),
  to: z.array(text(200)).max(50),
  cc: z.array(text(200)).max(50),
  subject: text(500),
  body: text(100_000),
  date: z.number().min(0),
});

const dnsRecord = z.object({ name: text(253), type: z.enum(['A', 'MX', 'NS']), value: text(253) });

const hostSchema = z.object({
  id: text(32),
  kind: z.enum(['computer', 'laptop']),
  name,
  x: coordinate,
  y: coordinate,
  mac,
  showIpAsName: z.boolean(),
  config: z.object({ ip, mask, gateway: ip, dns: ip, useDhcp: z.boolean() }),
  installed: z.array(z.enum(APP_IDS)).max(APP_IDS.length),
  fs: fsJson,
  firewall,
  dhcpServer: z.object({
    active: z.boolean(),
    rangeStart: ip,
    rangeEnd: ip,
    gateway: ip,
    dns: ip,
    reservations: z.array(z.object({ mac, ip })).max(256),
  }),
  dnsServer: z.object({ active: z.boolean(), recursion: z.boolean(), records: z.array(dnsRecord).max(1000) }),
  webServer: z.object({ active: z.boolean() }),
  echoServer: z.object({ active: z.boolean(), port }),
  mailServer: z.object({
    active: z.boolean(),
    domain: text(253),
    accounts: z
      .array(z.object({ user: text(64), password: text(128), mailbox: z.array(email).max(1000) }))
      .max(200),
  }),
  mailClient: z.object({
    account: z.object({
      address: text(200),
      smtpServer: text(253),
      pop3Server: text(253),
      user: text(64),
      password: text(128),
    }),
    inbox: z.array(email).max(1000),
    sent: z.array(email).max(1000),
  }),
});

const switchSchema = z.object({
  id: text(32),
  kind: z.literal('switch'),
  name,
  x: coordinate,
  y: coordinate,
  ports: z.number().int().min(1).max(256),
});

const routerSchema = z.object({
  id: text(32),
  kind: z.literal('router'),
  name,
  x: coordinate,
  y: coordinate,
  interfaces: z.array(z.object({ mac, ip, mask })).min(2).max(8),
  routes: z
    .array(z.object({ destination: ip, mask, gateway: ip, iface: z.number().int().min(0).max(7) }))
    .max(200),
  rip: z.boolean(),
  firewall,
});

const cableSchema = z.object({
  id: text(32),
  a: text(32),
  portA: z.number().int().min(0).max(255),
  b: text(32),
  portB: z.number().int().min(0).max(255),
});

export const projectSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(PROJECT_VERSION),
  devices: z.array(z.discriminatedUnion('kind', [hostSchema, switchSchema, routerSchema])).max(500),
  cables: z.array(cableSchema).max(2000),
});

export type ProjectFile = z.infer<typeof projectSchema>;
export type HostJson = z.infer<typeof hostSchema>;
export type RouterJson = z.infer<typeof routerSchema>;
export type FirewallJson = z.infer<typeof firewall>;
