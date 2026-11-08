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

export class FileSystem {
  private root: DirNode = { type: 'dir', children: new Map() };

  constructor(private readonly onChange: () => void = () => undefined) {}

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
    parent.children.delete(name);
    parent.children.set(newName, node);
    this.onChange();
  }

  toJSON(): FsJson {
    return FileSystem.dirToJson(this.root);
  }

  load(json: FsJson): void {
    this.root = FileSystem.dirFromJson(json);
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
