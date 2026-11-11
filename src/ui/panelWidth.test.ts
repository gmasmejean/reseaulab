import { describe, expect, test } from 'vitest';
import { ACTIVITY_MIN_WIDTH, MIN_STAGE_WIDTH, clampActivityWidth, parseActivityWidth } from './panelWidth';

describe('largeur du panneau d’activité', () => {
  test('jamais plus étroit que le minimum', () => {
    expect(clampActivityWidth(100, 1200)).toBe(ACTIVITY_MIN_WIDTH);
  });

  test('le plan garde toujours sa place', () => {
    // Écran de salle : 1366 px, palette de 156 px.
    const available = 1366 - 156;
    expect(clampActivityWidth(2000, available)).toBe(available - MIN_STAGE_WIDTH);
    expect(clampActivityWidth(600.4, available)).toBe(600);
  });

  test('place trop petite : le minimum l’emporte', () => {
    expect(clampActivityWidth(500, 400)).toBe(ACTIVITY_MIN_WIDTH);
  });

  test('place inconnue : seul le minimum compte', () => {
    expect(clampActivityWidth(900, 0)).toBe(900);
  });

  test('valeur relue dans le navigateur', () => {
    expect(parseActivityWidth('480')).toBe(480);
    expect(parseActivityWidth(null)).toBeNull();
    expect(parseActivityWidth('')).toBeNull();
    expect(parseActivityWidth('large')).toBeNull();
    expect(parseActivityWidth('100')).toBeNull();
    expect(parseActivityWidth('99999')).toBeNull();
  });
});
