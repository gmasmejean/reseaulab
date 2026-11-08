import type { Network } from '../../engine/network';
import { ProjectError, validateProject } from '../serialize';
import { convertFilius } from './convert';
import { decodeXmlEncoder } from './decoder';
import { parseXml } from './xml';
import { listZip, readZipEntry } from './zip';

/* Import of Filius project files (.fls): a ZIP archive whose
 * projekt/konfiguration.xml is a java.beans.XMLEncoder document. */

export const FILIUS_CONFIG_ENTRY = 'projekt/konfiguration.xml';
/** Largest accepted .fls file. */
export const MAX_FLS_SIZE = 30_000_000;

export interface FilsImport {
  readonly network: Network;
  readonly warnings: readonly string[];
  /** Filius version that wrote the file, when known. */
  readonly version: string | null;
}

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new ProjectError(`Import du fichier Filius impossible : ${message}`);
}

export async function importFilius(bytes: Uint8Array): Promise<FilsImport> {
  if (bytes.length > MAX_FLS_SIZE) throw new ProjectError('Fichier Filius trop volumineux.');
  let xml: string;
  try {
    const entry = listZip(bytes).find((e) => e.name === FILIUS_CONFIG_ENTRY);
    if (!entry) throw new Error(`${FILIUS_CONFIG_ENTRY} absent de l’archive.`);
    xml = new TextDecoder('utf-8', { fatal: true }).decode(await readZipEntry(bytes, entry));
  } catch (error) {
    fail(error);
  }
  try {
    const values = decodeXmlEncoder(parseXml(xml));
    const header = values.find((v): v is string => typeof v === 'string');
    const version = header?.match(/version:\s*([^\s(]+)/i)?.[1] ?? null;
    const { project, warnings } = convertFilius(values);
    return { network: validateProject(project), warnings, version };
  } catch (error) {
    if (error instanceof ProjectError) throw error;
    fail(error);
  }
}

/** True when the bytes look like a ZIP archive (".fls" files are ZIP). */
export function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
  );
}
