/** Splits a TCP byte stream into lines (CRLF or LF). */
export class LineBuffer {
  private buffer = '';

  push(chunk: string): string[] {
    this.buffer += chunk;
    const parts = this.buffer.split('\n');
    this.buffer = parts.pop() ?? '';
    return parts.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  }

  /** Text received after the last complete line. */
  get rest(): string {
    return this.buffer;
  }
}

export const CRLF = '\r\n';

export function normalizeDomain(name: string): string {
  return name.trim().toLowerCase().replace(/\.$/, '');
}

const EMAIL = /^[^@\s<>]+@[^@\s<>]+$/;

export function isValidEmail(address: string): boolean {
  return EMAIL.test(address.trim());
}

export function domainOf(address: string): string {
  return normalizeDomain(address.slice(address.lastIndexOf('@') + 1));
}

export function userOf(address: string): string {
  return address.slice(0, address.lastIndexOf('@')).trim().toLowerCase();
}
