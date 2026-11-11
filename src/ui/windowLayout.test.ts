import { clampWindow, defaultWindowSize, fitWindow, placeWindow } from './windowLayout';

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

  test('l’aide, lue pour elle-même, peut prendre les trois quarts de la zone', () => {
    const stage = { width: 1210, height: 640 };
    expect(fitWindow(defaultWindowSize({ type: 'help' }), stage, { type: 'help' })).toEqual({
      width: 908,
      height: 620,
    });
    expect(fitWindow({ width: 960, height: 620 }, stage, { type: 'report' })).toEqual({
      width: 666,
      height: 620,
    });
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

  test('la barre de titre d’une fenêtre reste attrapable', () => {
    expect(clampWindow({ x: -50, y: -10 }, STAGE)).toEqual({ x: 0, y: 0 });
    expect(clampWindow({ x: 5000, y: 5000 }, STAGE)).toEqual({ x: 1246, y: 524 });
    expect(clampWindow({ x: 300.4, y: 20.6 }, STAGE)).toEqual({ x: 300, y: 21 });
    expect(clampWindow({ x: -5, y: 4000 }, null)).toEqual({ x: 0, y: 4000 });
  });
});
