/* Read-only ZIP support (stored and deflated entries, no ZIP64, no
 * encryption), relying on the platform's DecompressionStream. */

export class ZipError extends Error {}

export interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;
/** Largest accepted uncompressed entry, against "zip bombs". */
export const MAX_ENTRY_SIZE = 50_000_000;

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const data = view(bytes);
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= lowest; i--) {
    if (data.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  throw new ZipError('Ce fichier n’est pas une archive ZIP valide.');
}

export function listZip(bytes: Uint8Array): ZipEntry[] {
  const data = view(bytes);
  const eocd = findEndOfCentralDirectory(bytes);
  const count = data.getUint16(eocd + 10, true);
  let offset = data.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || data.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new ZipError('Répertoire de l’archive ZIP corrompu.');
    }
    const nameLength = data.getUint16(offset + 28, true);
    const extraLength = data.getUint16(offset + 30, true);
    const commentLength = data.getUint16(offset + 32, true);
    entries.push({
      method: data.getUint16(offset + 10, true),
      compressedSize: data.getUint32(offset + 20, true),
      size: data.getUint32(offset + 24, true),
      localHeaderOffset: data.getUint32(offset + 42, true),
      name: decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(input: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([input.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await reader.read();
    } catch {
      throw new ZipError('Données compressées corrompues.');
    }
    if (result.done) break;
    total += result.value.length;
    if (total > limit) {
      await reader.cancel();
      throw new ZipError('Fichier trop volumineux une fois décompressé.');
    }
    chunks.push(result.value);
  }
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

export async function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const data = view(bytes);
  const local = entry.localHeaderOffset;
  if (local + 30 > bytes.length || data.getUint32(local, true) !== LOCAL_SIGNATURE) {
    throw new ZipError('Entrée de l’archive ZIP corrompue.');
  }
  if (data.getUint16(local + 6, true) & 1) throw new ZipError('Archive ZIP chiffrée non prise en charge.');
  const start = local + 30 + data.getUint16(local + 26, true) + data.getUint16(local + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw new ZipError('Archive ZIP tronquée.');
  if (entry.size > MAX_ENTRY_SIZE) throw new ZipError('Fichier trop volumineux une fois décompressé.');
  const raw = bytes.subarray(start, end);
  if (entry.method === STORED) return raw.slice();
  if (entry.method === DEFLATED) return inflateRaw(raw, MAX_ENTRY_SIZE);
  throw new ZipError(`Méthode de compression ZIP non prise en charge (${String(entry.method)}).`);
}
