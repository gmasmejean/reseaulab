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
    expect(mimeType('/webserver/mesures.csv')).toBe('text/csv');
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

  test('dossier en lecture seule : on lit, on ne change rien, ni dedans ni au-dessus', () => {
    let changes = 0;
    const fs = new FileSystem(() => changes++);
    fs.mkdir('/Documents/Commun/Archives', true);
    fs.mkdir('/Documents/3A');
    fs.writeFile('/Documents/Commun/charte.pdf', 'Charte');
    expect(() => {
      fs.setReadOnly('/Documents/Absent');
    }).toThrow('Dossier introuvable : /Documents/Absent');
    fs.setReadOnly('/Documents/Commun/');
    expect(fs.readOnlyPaths()).toEqual(['/Documents/Commun']);
    expect(fs.isReadOnly('/Documents/Commun')).toBe(true);
    expect(fs.isReadOnly('/Documents/Commun/Archives/x.txt')).toBe(true);
    // Un nom qui commence pareil n'est pas « dedans ».
    expect(fs.isReadOnly('/Documents/Communs')).toBe(false);
    expect(fs.isReadOnly('/Documents')).toBe(false);

    // Lire reste possible.
    expect(fs.readFile('/Documents/Commun/charte.pdf')).toBe('Charte');
    expect(fs.list('/Documents/Commun').map((e) => e.name)).toEqual(['Archives', 'charte.pdf']);

    // Rien ne change dedans : ni création, ni écriture, ni nouveau nom, ni suppression.
    const before = changes;
    const refused = 'Dossier en lecture seule : /Documents/Commun';
    for (const attempt of [
      () => {
        fs.mkdir('/Documents/Commun/Nouveau');
      },
      () => {
        fs.mkdir('/Documents/Commun/a/b', true);
      },
      () => {
        fs.writeFile('/Documents/Commun/moi.txt', 'x');
      },
      () => {
        fs.writeFile('/Documents/Commun/charte.pdf', 'modifiée');
      },
      () => {
        fs.rename('/Documents/Commun/charte.pdf', 'autre.pdf');
      },
      () => {
        fs.remove('/Documents/Commun/charte.pdf');
      },
      () => {
        fs.remove('/Documents/Commun/Archives');
      },
      () => {
        fs.rename('/Documents/Commun', 'Partage');
      },
      () => {
        fs.remove('/Documents/Commun', true);
      },
    ])
      expect(attempt).toThrow(refused);
    // Ni au-dessus : supprimer ou renommer Documents emporterait Commun.
    for (const attempt of [
      () => {
        fs.remove('/Documents', true);
      },
      () => {
        fs.rename('/Documents', 'Docs');
      },
    ])
      expect(attempt).toThrow('Ce dossier contient un dossier en lecture seule : /Documents/Commun');
    expect(changes).toBe(before);
    expect(fs.toJSON()).toEqual({
      Documents: { Commun: { Archives: {}, 'charte.pdf': 'Charte' }, '3A': {} },
    });

    // À côté, tout reste permis ; un dossier qui existe déjà n'est pas « créé ».
    fs.writeFile('/Documents/3A/notes.txt', 'x');
    fs.mkdir('/Documents/Commun', true);
    fs.rename('/Documents/3A', '3B');
    expect(fs.exists('/Documents/3B/notes.txt')).toBe(true);

    // Rendu modifiable, le dossier se comporte comme les autres.
    fs.setReadOnly('/Documents/Commun', false);
    expect(fs.readOnlyPaths()).toEqual([]);
    fs.writeFile('/Documents/Commun/moi.txt', 'x');
    expect(fs.readFile('/Documents/Commun/moi.txt')).toBe('x');
  });

  test('la lecture seule se recharge avec les fichiers ; un dossier disparu est oublié', () => {
    const fs = new FileSystem();
    fs.mkdir('/Documents/Commun', true);
    fs.setReadOnly('/Documents/Commun');
    const copy = new FileSystem();
    copy.load(fs.toJSON(), [...fs.readOnlyPaths(), '/Absent', 'Documents/Commun/']);
    expect(copy.readOnlyPaths()).toEqual(['/Documents/Commun']);
    expect(() => {
      copy.writeFile('/Documents/Commun/x.txt', 'x');
    }).toThrow(FsError);
    // Sans liste (ancien fichier), tout est modifiable.
    copy.load(fs.toJSON());
    expect(copy.readOnlyPaths()).toEqual([]);
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
