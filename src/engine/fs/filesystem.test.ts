import { FileSystem, FsError, isValidFileName, mimeType, normalizePath, splitPath } from './filesystem';

describe('Chemins', () => {
  test('normalisation', () => {
    expect(splitPath('a/./b/../c', '/x')).toEqual(['x', 'a', 'c']);
    expect(normalizePath('/../..')).toBe('/');
    expect(normalizePath('docs', '/home')).toBe('/home/docs');
  });

  test('noms de fichiers', () => {
    expect(isValidFileName('index.html')).toBe(true);
    expect(isValidFileName('mon fichier.txt')).toBe(true);
    for (const bad of ['', '.', '..', 'a/b', 'a\\b', ' espace', 'x'.repeat(65), 'tab\t', 'a:b']) {
      expect(isValidFileName(bad)).toBe(false);
    }
  });

  test('types MIME', () => {
    expect(mimeType('/a/b.HTML')).toBe('text/html');
    expect(mimeType('photo.jpg')).toBe('image/jpeg');
    expect(mimeType('sans-extension')).toBe('application/octet-stream');
  });
});

describe('FileSystem', () => {
  test('créer, lire, lister, renommer et supprimer', () => {
    let changes = 0;
    const fs = new FileSystem(() => changes++);
    fs.mkdir('/a/b', true);
    fs.writeFile('/a/b/note.txt', 'bonjour');
    fs.writeFile('/a/z.txt', '!');
    expect(fs.readFile('/a/b/note.txt')).toBe('bonjour');
    expect(fs.readFile('/a/b')).toBeNull();
    expect(fs.isDirectory('/a/b')).toBe(true);
    expect(fs.list('/a')).toEqual([
      { name: 'b', type: 'dir', size: 1 },
      { name: 'z.txt', type: 'file', size: 1 },
    ]);
    fs.rename('/a/z.txt', 'y.txt');
    expect(fs.exists('/a/y.txt')).toBe(true);
    expect(() => {
      fs.rename('/a/y.txt', 'b');
    }).toThrow(/existe déjà/);
    expect(() => {
      fs.rename('/a/absent', 'c');
    }).toThrow(FsError);
    expect(() => {
      fs.rename('/', 'c');
    }).toThrow(FsError);
    expect(() => {
      fs.remove('/a');
    }).toThrow(/n’est pas vide/);
    fs.remove('/a/y.txt');
    fs.remove('/a', true);
    expect(fs.list('/')).toEqual([]);
    expect(changes).toBeGreaterThan(5);
  });

  test('erreurs', () => {
    const fs = new FileSystem();
    fs.writeFile('/f', 'x');
    expect(() => fs.list('/f')).toThrow(/introuvable/);
    expect(() => {
      fs.mkdir('/f/g', true);
    }).toThrow(/est un fichier/);
    expect(() => {
      fs.mkdir('/x/y');
    }).toThrow(/introuvable/);
    fs.mkdir('/d');
    expect(() => {
      fs.mkdir('/d');
    }).toThrow(/existe déjà/);
    fs.mkdir('/d', true);
    expect(() => {
      fs.writeFile('/d', 'x');
    }).toThrow(/est un dossier/);
    expect(() => {
      fs.writeFile('/', 'x');
    }).toThrow(/vide/);
    expect(() => {
      fs.writeFile('/absent/f', 'x');
    }).toThrow(/introuvable/);
    expect(() => {
      fs.writeFile('/a:b', 'x');
    }).toThrow(/Nom invalide/);
    expect(() => {
      fs.remove('/');
    }).toThrow(/racine/);
    expect(() => {
      fs.remove('/absent');
    }).toThrow(/Introuvable/);
    expect(fs.stat('/f/sous')).toBeNull();
  });

  test('sérialisation aller-retour et validation', () => {
    const fs = new FileSystem();
    fs.mkdir('/web');
    fs.writeFile('/web/index.html', '<p>x</p>');
    const json = fs.toJSON();
    expect(json).toEqual({ web: { 'index.html': '<p>x</p>' } });
    const copy = new FileSystem();
    copy.load(json);
    expect(copy.readFile('/web/index.html')).toBe('<p>x</p>');
    expect(() => {
      copy.load({ 'a/b': 'x' });
    }).toThrow(FsError);
  });
});
