/**
 * IPv4 addresses are handled internally as unsigned 32-bit integers.
 * Conversion to/from dotted-decimal strings only happens at the boundaries.
 */
export type Ipv4 = number;

export const IP_ANY: Ipv4 = 0;
export const IP_BROADCAST: Ipv4 = 0xffffffff;

const OCTET = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/** Parses "192.168.0.1"; returns null when the text is not a valid address. */
export function parseIp(text: string): Ipv4 | null {
  const parts = text.trim().split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!OCTET.test(part)) return null;
    value = value * 256 + Number(part);
  }
  return value >>> 0;
}

export function formatIp(ip: Ipv4): string {
  return [ip >>> 24, (ip >>> 16) & 0xff, (ip >>> 8) & 0xff, ip & 0xff].join('.');
}

/** A mask is valid when its binary form is a run of 1s followed by 0s. */
export function isValidMask(mask: Ipv4): boolean {
  const inverted = ~mask >>> 0;
  return (inverted & (inverted + 1)) === 0;
}

export function parseMask(text: string): Ipv4 | null {
  const mask = parseIp(text);
  return mask !== null && isValidMask(mask) ? mask : null;
}

export function maskToPrefix(mask: Ipv4): number {
  let prefix = 0;
  for (let bit = 31; bit >= 0 && (mask >>> bit) & 1; bit--) prefix++;
  return prefix;
}

export function prefixToMask(prefix: number): Ipv4 {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32)
    throw new RangeError(`Préfixe invalide : ${prefix}`);
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function networkOf(ip: Ipv4, mask: Ipv4): Ipv4 {
  return (ip & mask) >>> 0;
}

export function broadcastOf(ip: Ipv4, mask: Ipv4): Ipv4 {
  return (networkOf(ip, mask) | ~mask) >>> 0;
}

export function sameNetwork(a: Ipv4, b: Ipv4, mask: Ipv4): boolean {
  return networkOf(a, mask) === networkOf(b, mask);
}

/** True when ip can be assigned to a host of the network defined by mask. */
export function isUsableHostAddress(ip: Ipv4, mask: Ipv4): boolean {
  if (ip === IP_ANY || ip === IP_BROADCAST) return false;
  if (maskToPrefix(mask) >= 31) return true;
  return ip !== networkOf(ip, mask) && ip !== broadcastOf(ip, mask);
}

export function formatCidr(ip: Ipv4, mask: Ipv4): string {
  return `${formatIp(networkOf(ip, mask))}/${maskToPrefix(mask)}`;
}
