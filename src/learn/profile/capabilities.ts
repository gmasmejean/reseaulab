import type { DeviceKind } from '../../engine/devices/device';
import { APP_IDS, type AppId } from '../../engine/services/catalog';
import { TERMINAL_COMMANDS, type TerminalCommand } from '../../engine/terminal/terminal';
import { LEVELS, type Level } from '../content/types';
import type { FindingCode } from '../diagnose/findings';

/* A profile adapts the interface to a class: what is not taught yet is not
 * shown. It hides controls, it never disables the simulation: a router placed
 * by the teacher in a 4e activity still routes. */

/** Parts of the interface that are neither a device, an application nor a command. */
export const FEATURES = [
  /** Wi-Fi network card and SSID. */
  'wifi',
  /** « Configuration automatique (DHCP) » on a computer. */
  'dhcp-client',
  /** Gateway field of a computer. */
  'gateway',
  /** DNS server field of a computer. */
  'dns-field',
  /** Static routes of a router. */
  'static-routes',
  /** RIP on a router. */
  'rip',
  /** Firewall tab of a router. */
  'router-firewall',
  /** « Échanges de données ». */
  'capture',
  /** MAC address table of a switch. */
  'mac-table',
  /** Routing and ARP tables of a computer or a router. */
  'tables',
  /** Text and zone annotations. */
  'notes',
] as const;
export type Feature = (typeof FEATURES)[number];

export type Capability =
  `device:${DeviceKind}` | `app:${AppId}` | `cmd:${TerminalCommand}` | `feature:${Feature}`;

/** A school year, or everything RéseauLab offers. */
export const PROFILE_LEVELS = [...LEVELS, 'complet'] as const;
export type ProfileLevel = Level | 'complet';

export const PROFILE_LABEL: Record<ProfileLevel, string> = {
  '5e': '5e',
  '4e': '4e',
  '3e': '3e',
  complet: 'Complet',
};

/**
 * From which level each capability is offered. The table lists every
 * capability: adding an application or a command without deciding its level
 * does not compile. The split is a proposal, to be adjusted by the teacher
 * (see `ProfileSpec.hide` and `show`).
 */
export const CAPABILITY_LEVEL: Record<Capability, ProfileLevel> = {
  'device:computer': '5e',
  'device:laptop': '5e',
  'device:switch': '5e',
  'device:router': '3e',

  'app:terminal': '4e',
  'app:browser': '5e',
  'app:texteditor': '5e',
  'app:fileexplorer': '5e',
  'app:imageviewer': '5e',
  'app:webserver': '5e',
  'app:dhcpserver': '4e',
  'app:echoclient': '4e',
  'app:echoserver': '4e',
  'app:mailclient': '3e',
  'app:mailserver': '3e',
  'app:dnsserver': '3e',
  'app:firewall': '3e',

  'cmd:help': '4e',
  'cmd:ipconfig': '4e',
  'cmd:ping': '4e',
  'cmd:hostname': '4e',
  'cmd:ls': '4e',
  'cmd:cd': '4e',
  'cmd:pwd': '4e',
  'cmd:cat': '4e',
  'cmd:mkdir': '4e',
  'cmd:rm': '4e',
  'cmd:touch': '4e',
  'cmd:echo': '4e',
  'cmd:clear': '4e',
  'cmd:traceroute': '3e',
  'cmd:arp': '3e',
  'cmd:route': '3e',
  'cmd:netstat': '3e',
  'cmd:nslookup': '3e',

  'feature:wifi': '5e',
  'feature:notes': '5e',
  'feature:dhcp-client': '4e',
  'feature:capture': '4e',
  'feature:mac-table': '4e',
  'feature:gateway': '3e',
  'feature:dns-field': '3e',
  'feature:static-routes': '3e',
  'feature:router-firewall': '3e',
  'feature:tables': '3e',
  'feature:rip': 'complet',
};

export const CAPABILITIES = Object.keys(CAPABILITY_LEVEL) as Capability[];

/** A level, with what the teacher adds to it or removes from it. */
export interface ProfileSpec {
  readonly base: ProfileLevel;
  readonly hide?: readonly Capability[] | undefined;
  readonly show?: readonly Capability[] | undefined;
}

export const FULL_PROFILE: ProfileSpec = { base: 'complet' };

function rank(level: ProfileLevel): number {
  return PROFILE_LEVELS.indexOf(level);
}

/** Whether a profile offers a capability. `hide` wins over `show`. */
export function can(profile: ProfileSpec, capability: Capability): boolean {
  if (profile.hide?.includes(capability)) return false;
  if (profile.show?.includes(capability)) return true;
  return rank(CAPABILITY_LEVEL[capability]) <= rank(profile.base);
}

/** Whether a knowledge card of this school year belongs to the profile. */
export function teaches(profile: ProfileSpec, level: Level): boolean {
  return rank(level) <= rank(profile.base);
}

/** Commands of the terminal a profile offers. */
export function allowedCommands(profile: ProfileSpec): Set<TerminalCommand> {
  return new Set(TERMINAL_COMMANDS.filter((command) => can(profile, `cmd:${command}`)));
}

/** Applications a profile offers for installation. */
export function allowedApps(profile: ProfileSpec): AppId[] {
  return APP_IDS.filter((app) => can(profile, `app:${app}`));
}

/**
 * What a finding of the verification is about: when the profile hides it,
 * the pupil could not correct the problem and is not told about it.
 */
const FINDING_NEEDS: Partial<Record<FindingCode, Capability>> = {
  'gateway-outside': 'feature:gateway',
  'gateway-nobody': 'feature:gateway',
  'gateway-not-router': 'feature:gateway',
  'gateway-missing': 'feature:gateway',
  'dns-missing': 'feature:dns-field',
  'dns-no-server': 'feature:dns-field',
  'dhcp-no-server': 'feature:dhcp-client',
  'dhcp-server-dynamic': 'feature:dhcp-client',
  'wifi-not-joined': 'feature:wifi',
  'router-iface-unconfigured': 'device:router',
  'router-ifaces-same-network': 'device:router',
};

export function concerns(profile: ProfileSpec, code: FindingCode): boolean {
  const needed = FINDING_NEEDS[code];
  return needed === undefined || can(profile, needed);
}

/** Reads a profile kept as text; the full profile when it is missing or invalid. */
export function parseProfile(text: string | null): ProfileSpec {
  if (text === null) return FULL_PROFILE;
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== 'object' || data === null) return FULL_PROFILE;
    const { base, hide, show } = data as { base?: unknown; hide?: unknown; show?: unknown };
    if (!PROFILE_LEVELS.includes(base as ProfileLevel)) return FULL_PROFILE;
    const known = (list: unknown): Capability[] =>
      Array.isArray(list) ? CAPABILITIES.filter((capability) => list.includes(capability)) : [];
    const [hidden, shown] = [known(hide), known(show)];
    return {
      base: base as ProfileLevel,
      ...(hidden.length > 0 ? { hide: hidden } : {}),
      ...(shown.length > 0 ? { show: shown } : {}),
    };
  } catch {
    return FULL_PROFILE;
  }
}
