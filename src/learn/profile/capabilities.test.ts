import { APP_IDS } from '../../engine/services/catalog';
import { TERMINAL_COMMANDS } from '../../engine/terminal/terminal';
import { LINT_CODES } from '../diagnose/findings';
import {
  CAPABILITIES,
  CAPABILITY_LEVEL,
  FEATURES,
  FULL_PROFILE,
  PROFILE_LABEL,
  PROFILE_LEVELS,
  allowedApps,
  allowedCommands,
  can,
  concerns,
  parseProfile,
  teaches,
} from './capabilities';

describe('Profils par niveau', () => {
  test('chaque logiciel, commande et réglage a un niveau', () => {
    for (const app of APP_IDS) expect(CAPABILITY_LEVEL[`app:${app}`]).toBeDefined();
    for (const command of TERMINAL_COMMANDS) expect(CAPABILITY_LEVEL[`cmd:${command}`]).toBeDefined();
    for (const feature of FEATURES) expect(CAPABILITY_LEVEL[`feature:${feature}`]).toBeDefined();
    expect(CAPABILITIES).toHaveLength(4 + APP_IDS.length + TERMINAL_COMMANDS.length + FEATURES.length);
    for (const level of PROFILE_LEVELS) expect(PROFILE_LABEL[level]).not.toBe('');
  });

  test('un niveau offre ce qui est abordé jusque-là', () => {
    expect(can({ base: '5e' }, 'device:switch')).toBe(true);
    expect(can({ base: '5e' }, 'app:terminal')).toBe(false);
    expect(can({ base: '4e' }, 'cmd:ping')).toBe(true);
    expect(can({ base: '4e' }, 'device:router')).toBe(false);
    expect(can({ base: '4e' }, 'feature:gateway')).toBe(false);
    expect(can({ base: '3e' }, 'device:router')).toBe(true);
    expect(can({ base: '3e' }, 'feature:rip')).toBe(false);
    for (const capability of CAPABILITIES) expect(can(FULL_PROFILE, capability), capability).toBe(true);
    // Chaque niveau contient le précédent.
    for (const capability of CAPABILITIES) {
      if (can({ base: '5e' }, capability)) expect(can({ base: '4e' }, capability), capability).toBe(true);
      if (can({ base: '4e' }, capability)) expect(can({ base: '3e' }, capability), capability).toBe(true);
    }
  });

  test('l’enseignant ajoute ou retire des éléments ; retirer l’emporte', () => {
    const profile = {
      base: '4e',
      show: ['device:router', 'cmd:arp'],
      hide: ['app:echoclient', 'cmd:arp'],
    } as const;
    expect(can(profile, 'device:router')).toBe(true);
    expect(can(profile, 'app:echoclient')).toBe(false);
    expect(can(profile, 'cmd:arp')).toBe(false);
  });

  test('commandes et logiciels proposés', () => {
    expect([...allowedCommands({ base: '5e' })]).toEqual([]);
    expect(allowedCommands({ base: '4e' }).has('ping')).toBe(true);
    expect(allowedCommands({ base: '4e' }).has('traceroute')).toBe(false);
    expect(allowedCommands(FULL_PROFILE).size).toBe(TERMINAL_COMMANDS.length);
    expect(allowedApps({ base: '5e' })).toEqual([
      'browser',
      'texteditor',
      'fileexplorer',
      'imageviewer',
      'webserver',
    ]);
    expect(allowedApps(FULL_PROFILE)).toHaveLength(APP_IDS.length);
  });

  test('fiches de connaissances du niveau', () => {
    expect(teaches({ base: '4e' }, '5e')).toBe(true);
    expect(teaches({ base: '4e' }, '4e')).toBe(true);
    expect(teaches({ base: '4e' }, '3e')).toBe(false);
    expect(teaches(FULL_PROFILE, '3e')).toBe(true);
  });

  test('un constat que l’élève ne peut pas corriger à son niveau n’est pas signalé', () => {
    expect(concerns({ base: '4e' }, 'gateway-missing')).toBe(false);
    expect(concerns({ base: '4e' }, 'dns-missing')).toBe(false);
    expect(concerns({ base: '4e' }, 'ip-missing')).toBe(true);
    expect(concerns({ base: '5e' }, 'dhcp-no-server')).toBe(false);
    expect(concerns({ base: '3e' }, 'gateway-missing')).toBe(true);
    for (const code of LINT_CODES) expect(concerns(FULL_PROFILE, code), code).toBe(true);
  });

  test('lit un profil enregistré, en ignorant ce qui est inconnu ou invalide', () => {
    expect(parseProfile(null)).toEqual(FULL_PROFILE);
    expect(parseProfile('{"base":"4e"}')).toEqual({ base: '4e' });
    expect(parseProfile('{"base":"4e","show":["device:router","inconnu"],"hide":["cmd:ping"]}')).toEqual({
      base: '4e',
      show: ['device:router'],
      hide: ['cmd:ping'],
    });
    expect(parseProfile('{"base":"6e"}')).toEqual(FULL_PROFILE);
    expect(parseProfile('"4e"')).toEqual(FULL_PROFILE);
    expect(parseProfile('null')).toEqual(FULL_PROFILE);
    expect(parseProfile('{cassé')).toEqual(FULL_PROFILE);
  });
});
