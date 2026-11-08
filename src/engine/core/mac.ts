/** MAC addresses are kept as upper-case "AA:BB:CC:DD:EE:FF" strings. */
export type Mac = string;

export const MAC_BROADCAST: Mac = 'FF:FF:FF:FF:FF:FF';

const MAC_PATTERN = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

export function isValidMac(text: string): boolean {
  return MAC_PATTERN.test(text);
}

export function normalizeMac(text: string): Mac | null {
  const candidate = text.trim().toUpperCase().replaceAll('-', ':');
  return isValidMac(candidate) ? candidate : null;
}

/**
 * Deterministic MAC allocator. Addresses are locally administered
 * (first octet 0x02) so they never collide with real vendor prefixes.
 */
export class MacAllocator {
  private next: number;
  private readonly used = new Set<Mac>();

  constructor(start = 1) {
    this.next = start;
  }

  allocate(): Mac {
    let mac: Mac;
    do {
      mac = MacAllocator.format(this.next++);
    } while (this.used.has(mac));
    this.used.add(mac);
    return mac;
  }

  /** Registers an existing address (e.g. loaded from a project file). */
  reserve(mac: Mac): void {
    this.used.add(mac);
  }

  release(mac: Mac): void {
    this.used.delete(mac);
  }

  private static format(counter: number): Mac {
    const bytes = [0x02, 0x00];
    for (let shift = 24; shift >= 0; shift -= 8) bytes.push((counter >>> shift) & 0xff);
    return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(':');
  }
}
