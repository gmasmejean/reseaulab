/**
 * In-memory hierarchical file system of a simulated computer.
 * Text files hold plain strings; binary files (images) hold data: URLs.
 */
export interface FileNode {
  readonly type: 'file';
  content: string;
}

export interface DirNode {
  readonly type: 'dir';
  readonly children: Map<string, FsNode>;
}

export type FsNode = FileNode | DirNode;

export interface DirEntry {
  readonly name: string;
  readonly type: 'file' | 'dir';
  readonly size: number;
}

/** Serialized form: nested objects, files as strings. */
export interface FsJson {
  readonly [name: string]: string | FsJson;
}

export class FsError extends Error {}

// Control characters are forbidden in file names, hence the explicit range.
// eslint-disable-next-line no-control-regex
const NAME_PATTERN = /^[^/\\:*?"<>|\u0000-\u001f]{1,64}$/;

export function isValidFileName(name: string): boolean {
  return NAME_PATTERN.test(name) && name !== '.' && name !== '..' && name.trim() === name;
}

/** Turns a path into normalized segments, resolving "." and "..". */
export function splitPath(path: string, cwd = '/'): string[] {
  const absolute = path.startsWith('/') ? path : `${cwd}/${path}`;
  const segments: string[] = [];
  for (const part of absolute.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return segments;
}

export function joinPath(segments: readonly string[]): string {
  return `/${segments.join('/')}`;
}

export function normalizePath(path: string, cwd = '/'): string {
  return joinPath(splitPath(path, cwd));
}

/** Whether `path` is `dir` or lies inside it (both normalized). */
function isWithin(path: string, dir: string): boolean {
  return path === dir || dir === '/' || path.startsWith(`${dir}/`);
}

export class FileSystem {
  private root: DirNode = { type: 'dir', children: new Map() };
  /** Folders whose content can be read but not changed, as normalized paths. */
  private readOnly = new Set<string>();

  constructor(private readonly onChange: () => void = () => undefined) {}

  /**
   * Makes a folder read-only (or writable again): nothing can be created,
   * changed, renamed or removed in it, and it cannot be renamed or removed
   * itself. Like the shared folder of a school network.
   */
  setReadOnly(path: string, readOnly = true): void {
    const dir = normalizePath(path);
    if (!this.isDirectory(dir)) throw new FsError(`Dossier introuvable : ${dir}`);
    if (readOnly) this.readOnly.add(dir);
    else this.readOnly.delete(dir);
    this.onChange();
  }

  /** Whether a path is a read-only folder, or lies inside one. */
  isReadOnly(path: string): boolean {
    const target = normalizePath(path);
    return [...this.readOnly].some((dir) => isWithin(target, dir));
  }

  /** The read-only folders, sorted (for the saved file). */
  readOnlyPaths(): string[] {
    return [...this.readOnly].sort();
  }

  /** Refuses a change of what is at `path`: created, written, renamed or removed. */
  private checkWritable(path: string): void {
    const target = normalizePath(path);
    const inside = [...this.readOnly].find((dir) => isWithin(target, dir));
    if (inside !== undefined) throw new FsError(`Dossier en lecture seule : ${inside}`);
  }

  /** Refuses to move or remove a folder that holds a read-only one. */
  private checkMovable(path: string): void {
    this.checkWritable(path);
    const target = normalizePath(path);
    const held = [...this.readOnly].find((dir) => isWithin(dir, target));
    if (held !== undefined) throw new FsError(`Ce dossier contient un dossier en lecture seule : ${held}`);
  }

  stat(path: string): FsNode | null {
    let node: FsNode = this.root;
    for (const segment of splitPath(path)) {
      if (node.type !== 'dir') return null;
      const child = node.children.get(segment);
      if (!child) return null;
      node = child;
    }
    return node;
  }

  exists(path: string): boolean {
    return this.stat(path) !== null;
  }

  isDirectory(path: string): boolean {
    return this.stat(path)?.type === 'dir';
  }

  readFile(path: string): string | null {
    const node = this.stat(path);
    return node?.type === 'file' ? node.content : null;
  }

  list(path: string): DirEntry[] {
    const node = this.stat(path);
    if (node?.type !== 'dir') throw new FsError(`Dossier introuvable : ${normalizePath(path)}`);
    return [...node.children]
      .map(([name, child]) => ({
        name,
        type: child.type,
        size: child.type === 'file' ? child.content.length : child.children.size,
      }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  }

  mkdir(path: string, recursive = false): void {
    let node: DirNode = this.root;
    const segments = splitPath(path);
    segments.forEach((segment, index) => {
      const child = node.children.get(segment);
      if (child?.type === 'file') throw new FsError(`« ${segment} » est un fichier`);
      if (child) {
        if (index === segments.length - 1 && !recursive) throw new FsError(`« ${segment} » existe déjà`);
        node = child;
        return;
      }
      if (index < segments.length - 1 && !recursive) throw new FsError(`Dossier introuvable : ${segment}`);
      FileSystem.checkName(segment);
      this.checkWritable(joinPath(segments.slice(0, index + 1)));
      const created: DirNode = { type: 'dir', children: new Map() };
      node.children.set(segment, created);
      node = created;
    });
    this.onChange();
  }

  writeFile(path: string, content: string): void {
    const segments = splitPath(path);
    const name = segments.pop();
    if (name === undefined) throw new FsError('Chemin de fichier vide');
    FileSystem.checkName(name);
    const parent = this.stat(joinPath(segments));
    if (parent?.type !== 'dir') throw new FsError(`Dossier introuvable : ${joinPath(segments)}`);
    const existing = parent.children.get(name);
    if (existing?.type === 'dir') throw new FsError(`« ${name} » est un dossier`);
    this.checkWritable(path);
    parent.children.set(name, { type: 'file', content });
    this.onChange();
  }

  remove(path: string, recursive = false): void {
    const segments = splitPath(path);
    const name = segments.pop();
    if (name === undefined) throw new FsError('Impossible de supprimer la racine');
    const parent = this.stat(joinPath(segments));
    const node = parent?.type === 'dir' ? parent.children.get(name) : undefined;
    if (parent?.type !== 'dir' || !node) throw new FsError(`Introuvable : ${normalizePath(path)}`);
    if (node.type === 'dir' && node.children.size > 0 && !recursive) {
      throw new FsError(`Le dossier « ${name} » n’est pas vide`);
    }
    this.checkMovable(path);
    parent.children.delete(name);
    this.onChange();
  }

  rename(path: string, newName: string): void {
    FileSystem.checkName(newName);
    const segments = splitPath(path);
    const name = segments.pop();
    const parent = this.stat(joinPath(segments));
    if (name === undefined || parent?.type !== 'dir') throw new FsError('Introuvable');
    const node = parent.children.get(name);
    if (!node) throw new FsError(`Introuvable : ${normalizePath(path)}`);
    if (parent.children.has(newName)) throw new FsError(`« ${newName} » existe déjà`);
    this.checkMovable(path);
    parent.children.delete(name);
    parent.children.set(newName, node);
    this.onChange();
  }

  toJSON(): FsJson {
    return FileSystem.dirToJson(this.root);
  }

  /** Replaces everything; `readOnly` lists the read-only folders (those that do not exist are left out). */
  load(json: FsJson, readOnly: readonly string[] = []): void {
    this.root = FileSystem.dirFromJson(json);
    this.readOnly = new Set(
      readOnly.map((path) => normalizePath(path)).filter((dir) => this.isDirectory(dir)),
    );
    this.onChange();
  }

  private static checkName(name: string): void {
    if (!isValidFileName(name)) throw new FsError(`Nom invalide : « ${name} »`);
  }

  private static dirToJson(dir: DirNode): FsJson {
    const out: Record<string, string | FsJson> = {};
    for (const [name, child] of dir.children) {
      out[name] = child.type === 'file' ? child.content : FileSystem.dirToJson(child);
    }
    return out;
  }

  private static dirFromJson(json: FsJson): DirNode {
    const dir: DirNode = { type: 'dir', children: new Map() };
    for (const [name, value] of Object.entries(json)) {
      FileSystem.checkName(name);
      dir.children.set(
        name,
        typeof value === 'string' ? { type: 'file', content: value } : FileSystem.dirFromJson(value),
      );
    }
    return dir;
  }
}

const MIME: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  txt: 'text/plain',
  csv: 'text/csv',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

export function mimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}
