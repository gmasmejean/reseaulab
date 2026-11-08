import { useRef, useState } from 'react';
import type { Host } from '../../engine/devices/host';
import { joinPath, normalizePath, splitPath, type FileSystem } from '../../engine/fs/filesystem';
import { downloadDataUrl, downloadText, isImageData, readLocalFile } from '../files';

/** Every file path of a file system, depth first. */
export function allFiles(fs: FileSystem, dir = '/'): string[] {
  return fs.list(dir).flatMap((e) => {
    const path = normalizePath(e.name, dir);
    return e.type === 'dir' ? allFiles(fs, path) : [path];
  });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TextEditorApp({ host }: { host: Host }) {
  const [path, setPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [newPath, setNewPath] = useState('/document.txt');
  const [message, setMessage] = useState<string | null>(null);
  const files = allFiles(host.fs).filter((f) => !isImageData(host.fs.readFile(f) ?? ''));
  const dirty = path !== null && host.fs.readFile(path) !== content;

  const open = (file: string) => {
    setPath(file);
    setContent(host.fs.readFile(file) ?? '');
    setMessage(null);
  };

  return (
    <div className="editor">
      <div className="editor-bar">
        <select
          aria-label="Fichier à ouvrir"
          value={path ?? ''}
          onChange={(e) => {
            if (e.target.value) open(e.target.value);
          }}
        >
          <option value="">— Ouvrir un fichier —</option>
          {files.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const target = normalizePath(newPath);
              if (host.fs.exists(target)) throw new Error(`${target} existe déjà.`);
              host.fs.mkdir(joinPath(splitPath(target).slice(0, -1)), true);
              host.fs.writeFile(target, '');
              open(target);
            } catch (error) {
              setMessage(errorText(error));
            }
          }}
        >
          <input
            aria-label="Nouveau fichier"
            value={newPath}
            onChange={(e) => {
              setNewPath(e.target.value);
            }}
          />
          <button type="submit">Nouveau</button>
        </form>
        <button
          type="button"
          className="primary"
          disabled={path === null || !dirty}
          onClick={() => {
            if (path === null) return;
            try {
              host.fs.writeFile(path, content);
              setMessage(`Enregistré : ${path}`);
            } catch (error) {
              setMessage(errorText(error));
            }
          }}
        >
          Enregistrer
        </button>
      </div>
      {message && <p className="muted small">{message}</p>}
      <textarea
        aria-label="Contenu du fichier"
        value={content}
        disabled={path === null}
        spellCheck={false}
        placeholder="Ouvrez ou créez un fichier."
        onChange={(e) => {
          setContent(e.target.value);
        }}
      />
    </div>
  );
}

export function FileExplorerApp({ host }: { host: Host }) {
  const [dir, setDir] = useState('/');
  const [message, setMessage] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const fs = host.fs;
  const current = fs.isDirectory(dir) ? dir : '/';
  const entries = fs.list(current);
  const importFile = async (file: File) => {
    try {
      const content = await readLocalFile(file);
      fs.writeFile(normalizePath(file.name, current), content);
      setMessage(`Importé : ${file.name}`);
    } catch (error) {
      setMessage(errorText(error));
    }
  };
  const [renaming, setRenaming] = useState<{ readonly from: string; readonly draft: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const attempt = (action: () => void) => {
    try {
      action();
      setMessage(null);
    } catch (error) {
      setMessage(errorText(error));
    }
  };
  return (
    <div className="explorer">
      <div className="editor-bar">
        <button
          type="button"
          disabled={current === '/'}
          onClick={() => {
            setDir(normalizePath('..', current));
          }}
        >
          ↑ Dossier parent
        </button>
        <code className="path">{current}</code>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            attempt(() => {
              fs.mkdir(normalizePath(folderName, current));
              setFolderName('');
            });
          }}
        >
          <input
            aria-label="Nom du dossier"
            placeholder="nouveau dossier"
            value={folderName}
            onChange={(e) => {
              setFolderName(e.target.value);
            }}
          />
          <button type="submit" disabled={!folderName.trim()}>
            Créer
          </button>
        </form>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Importer un fichier…
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          data-testid="import-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </div>
      {message && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>Nom</th>
            <th>Taille</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                Dossier vide.
              </td>
            </tr>
          )}
          {entries.map((e) => {
            const path = normalizePath(e.name, current);
            return (
              <tr key={e.name}>
                <td>
                  {renaming?.from === e.name ? (
                    <form
                      className="inline-form"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        const name = renaming.draft.trim();
                        setRenaming(null);
                        if (name && name !== e.name)
                          attempt(() => {
                            fs.rename(path, name);
                          });
                      }}
                    >
                      <input
                        aria-label={`Nouveau nom de ${e.name}`}
                        value={renaming.draft}
                        autoFocus
                        onChange={(ev) => {
                          setRenaming({ from: e.name, draft: ev.target.value });
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Escape') setRenaming(null);
                        }}
                      />
                      <button type="submit">OK</button>
                    </form>
                  ) : e.type === 'dir' ? (
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setDir(path);
                      }}
                    >
                      📁 {e.name}
                    </button>
                  ) : (
                    <span>📄 {e.name}</span>
                  )}
                </td>
                <td>{e.type === 'dir' ? `${e.size} élément(s)` : `${e.size} octets`}</td>
                <td className="row-actions">
                  {deleting === e.name ? (
                    <>
                      <span>Supprimer ?</span>{' '}
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          setDeleting(null);
                          attempt(() => {
                            fs.remove(path, true);
                          });
                        }}
                      >
                        Oui
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleting(null);
                        }}
                      >
                        Non
                      </button>
                    </>
                  ) : (
                    <>
                      {e.type === 'file' && (
                        <button
                          type="button"
                          onClick={() => {
                            const content = fs.readFile(path) ?? '';
                            if (isImageData(content)) downloadDataUrl(e.name, content);
                            else downloadText(e.name, content, 'text/plain');
                          }}
                        >
                          Exporter
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRenaming({ from: e.name, draft: e.name });
                        }}
                      >
                        Renommer
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          setDeleting(e.name);
                        }}
                      >
                        Supprimer
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ImageViewerApp({ host }: { host: Host }) {
  const images = allFiles(host.fs).filter((f) => isImageData(host.fs.readFile(f) ?? ''));
  const [selected, setSelected] = useState<string | null>(images[0] ?? null);
  const content = selected ? host.fs.readFile(selected) : null;
  return (
    <div className="viewer">
      <select
        aria-label="Image"
        value={selected ?? ''}
        onChange={(e) => {
          setSelected(e.target.value || null);
        }}
      >
        <option value="">— Choisir une image —</option>
        {images.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      {images.length === 0 && (
        <p className="muted">Aucune image. Importez-en une avec l’explorateur de fichiers.</p>
      )}
      {content && isImageData(content) && <img src={content} alt={selected ?? ''} />}
    </div>
  );
}
