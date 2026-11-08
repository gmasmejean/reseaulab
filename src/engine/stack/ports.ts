export const EPHEMERAL_MIN = 49152;
export const EPHEMERAL_MAX = 65535;

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** Hands out ephemeral ports in a deterministic round-robin fashion. */
export class EphemeralPorts {
  private next = EPHEMERAL_MIN;

  allocate(inUse: (port: number) => boolean): number {
    for (let tries = 0; tries <= EPHEMERAL_MAX - EPHEMERAL_MIN; tries++) {
      const port = this.next;
      this.next = port >= EPHEMERAL_MAX ? EPHEMERAL_MIN : port + 1;
      if (!inUse(port)) return port;
    }
    throw new Error('Plus aucun port disponible');
  }

  reset(): void {
    this.next = EPHEMERAL_MIN;
  }
}
