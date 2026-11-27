import {
  chooseWindowPlace,
  clampWindow,
  defaultWindowSize,
  fitWindow,
  placeWindow,
  widenFromRight,
} from './windowLayout';

const STAGE = { width: 1366, height: 560 };

describe('Disposition des fenêtres', () => {
  test('chaque sorte de fenêtre a une taille par défaut', () => {
    expect(defaultWindowSize({ type: 'desktop' })).toEqual({ width: 560, height: 360 });
    expect(defaultWindowSize({ type: 'app', app: 'terminal' })).toEqual({ width: 640, height: 400 });
    expect(defaultWindowSize({ type: 'app', app: 'software' })).toEqual({ width: 560, height: 520 });
    expect(defaultWindowSize({ type: 'app', app: 'echoclient' })).toEqual({ width: 600, height: 440 });
  });

  test('une fenêtre tient dans la zone et n’en prend pas plus de la moitié environ', () => {
    expect(fitWindow({ width: 900, height: 520 }, STAGE)).toEqual({ width: 751, height: 520 });
    expect(fitWindow({ width: 700, height: 600 }, STAGE)).toEqual({ width: 700, height: 544 });
    // Zone minuscule : la fenêtre garde une taille utilisable.
    expect(fitWindow({ width: 700, height: 440 }, { width: 300, height: 100 })).toEqual({
      width: 320,
      height: 180,
    });
    expect(fitWindow({ width: 700, height: 440 }, null)).toEqual({ width: 700, height: 440 });
  });

  test('l’aide, lue pour elle-même, peut prendre presque toute la largeur de la zone', () => {
    const stage = { width: 900, height: 640 };
    expect(fitWindow(defaultWindowSize({ type: 'help' }), stage, { type: 'help' })).toEqual({
      width: 765,
      height: 620,
    });
    expect(fitWindow({ width: 960, height: 620 }, stage, { type: 'report' })).toEqual({
      width: 495,
      height: 620,
    });
  });

  test('une fiche lue seule : une colonne étroite, aussi haute que la zone le permet', () => {
    const alone = { type: 'help', alone: true } as const;
    expect(defaultWindowSize(alone)).toEqual({ width: 560, height: 720 });
    expect(defaultWindowSize({ type: 'help', alone: false })).toEqual({ width: 960, height: 620 });
    // Écran de 1366 × 768, panneau d'activité ouvert.
    expect(fitWindow(defaultWindowSize(alone), { width: 890, height: 678 }, alone)).toEqual({
      width: 560,
      height: 662,
    });
    // Sans le panneau d'activité : la moitié de la zone.
    expect(fitWindow(defaultWindowSize(alone), { width: 1210, height: 678 }, alone).width).toBe(605);
    // Zone très large : pas plus de 720 px, pour des lignes qui restent lisibles.
    expect(fitWindow(defaultWindowSize(alone), { width: 1444, height: 990 }, alone)).toEqual({
      width: 720,
      height: 720,
    });
    expect(fitWindow(defaultWindowSize(alone), { width: 1764, height: 990 }, alone).width).toBe(720);
    // L'aide avec sa liste garde sa largeur.
    expect(
      fitWindow(defaultWindowSize({ type: 'help' }), { width: 1764, height: 990 }, { type: 'help' }).width,
    ).toBe(960);
  });

  test('une fenêtre qui change de largeur garde son bord droit, sans sortir de la zone', () => {
    const stage = { width: 890, height: 678 };
    const window = { x: 322, y: 8, width: 560, height: 662 };
    expect(widenFromRight(window, 757, stage)).toBe(125);
    expect(widenFromRight({ ...window, x: 125, width: 757 }, 560, stage)).toBe(322);
    // Déplacée contre le bord gauche, elle s'élargit vers la droite.
    expect(widenFromRight({ ...window, x: 20 }, 757, stage)).toBe(8);
    // À moitié sortie à droite, elle revient dans la zone.
    expect(widenFromRight({ ...window, x: 700 }, 757, stage)).toBe(125);
    expect(widenFromRight({ ...window, x: 100 }, 960, null)).toBe(0);
  });

  test('les fenêtres s’ouvrent contre le bord demandé, chacune une barre de titre plus bas', () => {
    const size = { width: 560, height: 360 };
    expect(placeWindow(size, STAGE, 'right', 0)).toEqual({ x: 798, y: 8 });
    expect(placeWindow(size, STAGE, 'right', 2)).toEqual({ x: 798, y: 60 });
    expect(placeWindow(size, STAGE, 'left', 1)).toEqual({ x: 8, y: 34 });
    // La cascade reprend au bout de six fenêtres et ne dépasse jamais le bas de la zone.
    expect(placeWindow(size, STAGE, 'left', 6)).toEqual({ x: 8, y: 8 });
    expect(placeWindow({ width: 560, height: 544 }, STAGE, 'left', 3)).toEqual({ x: 8, y: 8 });
    expect(placeWindow({ width: 2000, height: 900 }, STAGE, 'right', 0)).toEqual({ x: 8, y: 8 });
    expect(placeWindow(size, null, 'right', 1)).toEqual({ x: 108, y: 88 });
  });

  describe('une fenêtre s’ouvre là où elle cache le moins le plan', () => {
    const stage = { width: 1000, height: 600 };
    const size = { width: 400, height: 300 };
    /** Un équipement de 100 × 100 dont le coin est en (x, y). */
    const device = (x: number, y: number) => ({ x, y, width: 100, height: 100 });
    const nothing = { devices: [], windows: [] };

    test('rien à éviter : en haut du bord demandé, à sa taille', () => {
      expect(chooseWindowPlace(size, stage, 'right', nothing)).toEqual({ x: 592, y: 8, ...size });
      expect(chooseWindowPlace(size, stage, 'left', nothing)).toEqual({ x: 8, y: 8, ...size });
    });

    test('elle descend sous les équipements du haut plutôt que de les recouvrir', () => {
      const devices = [device(700, 20), device(850, 60)];
      // Premier cran de la cascade sous le plus bas des deux (160) : 8 + 6 × 26.
      expect(chooseWindowPlace(size, stage, 'right', { devices, windows: [] })).toEqual({
        x: 592,
        y: 164,
        ...size,
      });
    });

    test('elle change de bord quand l’autre cache moins, mais jamais sur son propre équipement', () => {
      const right = [device(650, 50), device(650, 250), device(650, 450)];
      expect(chooseWindowPlace(size, stage, 'right', { devices: right, windows: [] })).toMatchObject({
        x: 8,
        y: 8,
      });
      // À gauche se trouve le poste d'où la fenêtre est ouverte : elle s'ouvre dessous.
      const own = device(100, 100);
      expect(
        chooseWindowPlace(size, stage, 'right', { devices: [...right, own], own, windows: [] }),
      ).toMatchObject({ x: 8, y: 216 });
      // Ce poste occupe toute la hauteur du bord gauche : mieux vaut cacher un autre équipement que lui.
      const tall = { x: 100, y: 0, width: 100, height: 600 };
      expect(
        chooseWindowPlace(size, stage, 'right', { devices: [...right, tall], own: tall, windows: [] }).x,
      ).toBe(592);
    });

    test('près du bas, elle s’ouvre moins haute, sans descendre sous les trois quarts de sa hauteur', () => {
      // Des équipements de y = 0 à 340 : il reste 252 px sous eux, pour une fenêtre de 300.
      const devices = [device(700, 0), device(700, 240), device(100, 0), device(100, 240)];
      const chosen = chooseWindowPlace(size, stage, 'right', { devices, windows: [] });
      // Premier cran sous eux : 8 + 13 × 26 = 346, d'où 600 − 8 − 346 = 246 px de haut.
      expect(chosen).toEqual({ x: 592, y: 346, width: 400, height: 246 });
      // Trop peu de place pour 225 px (les trois quarts) : elle garde sa taille et cache un équipement.
      const lower = [device(700, 0), device(700, 300), device(100, 0), device(100, 300)];
      expect(chooseWindowPlace(size, stage, 'right', { devices: lower, windows: [] }).height).toBe(300);
    });

    test('les fenêtres s’empilent : une barre de titre plus bas, sur ce qui est déjà caché', () => {
      const devices = [
        device(700, 20),
        device(700, 300),
        device(100, 20),
        device(100, 300),
        device(100, 450),
      ];
      // Impossible de n'en cacher aucun : la première en cache un seul, sous celui du haut.
      const first = chooseWindowPlace(size, stage, 'right', { devices, windows: [] });
      expect(first).toMatchObject({ x: 592, y: 138, height: 300 });
      // Cet équipement est déjà sous la première fenêtre : la seconde peut le
      // recouvrir, et laisse dépasser la barre de titre de la première.
      const second = chooseWindowPlace(size, stage, 'right', { devices, windows: [first] });
      expect(second).toMatchObject({ x: 592, y: first.y + 26, height: 300 });
    });

    test('pas la place une barre de titre plus bas : elle s’écarte du bord, le bouton de fermeture reste visible', () => {
      // Une fenêtre déjà ouverte en bas à droite, et des équipements partout au-dessus.
      const first = { x: 592, y: 292, ...size };
      const devices = [
        device(700, 20),
        device(700, 150),
        device(100, 20),
        device(100, 150),
        device(100, 400),
      ];
      // La seconde, plus haute, ne peut ni descendre ni se réduire assez.
      const second = chooseWindowPlace({ width: 400, height: 340 }, stage, 'right', {
        devices,
        windows: [first],
      });
      expect(second).toMatchObject({ x: 592 - 44, y: 252, height: 340 });
      // L'extrémité droite de la barre de titre de la première dépasse : 44 px, avec son bouton.
      expect(second.x + second.width).toBe(first.x + first.width - 44);
    });

    test('elle cache un équipement de plus plutôt que la barre de titre d’une autre fenêtre', () => {
      // Une fenêtre en bas à droite, trop basse pour qu'une autre s'ouvre une barre de titre dessous.
      const first = { x: 592, y: 320, width: 400, height: 272 };
      const devices = [
        device(700, 20),
        device(700, 150),
        // Le bord gauche est occupé du haut en bas.
        device(100, 20),
        device(100, 150),
        device(100, 300),
        device(250, 450),
        // Juste à gauche de la première fenêtre.
        device(470, 400),
      ];
      const second = chooseWindowPlace({ width: 400, height: 340 }, stage, 'right', {
        devices,
        windows: [first],
      });
      // Écartée du bord, elle recouvre un équipement ; contre le bord, elle n'aurait rien
      // caché de plus, mais la première fenêtre ne se serait plus ni attrapée ni fermée.
      expect(second).toMatchObject({ x: 592 - 44, y: 252, height: 340 });
    });

    test('zone plus petite que la fenêtre : dans le coin, sans erreur', () => {
      expect(chooseWindowPlace({ width: 2000, height: 900 }, stage, 'right', nothing)).toMatchObject({
        x: 8,
        y: 8,
      });
    });
  });

  test('la barre de titre d’une fenêtre reste attrapable', () => {
    expect(clampWindow({ x: -50, y: -10 }, STAGE)).toEqual({ x: 0, y: 0 });
    expect(clampWindow({ x: 5000, y: 5000 }, STAGE)).toEqual({ x: 1246, y: 524 });
    expect(clampWindow({ x: 300.4, y: 20.6 }, STAGE)).toEqual({ x: 300, y: 21 });
    expect(clampWindow({ x: -5, y: 4000 }, null)).toEqual({ x: 0, y: 4000 });
  });
});
