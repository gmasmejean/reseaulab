// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Network } from '../engine/network';
import { MASK_24, ip } from '../engine/testing';
import { BUILTIN_ACTIVITIES } from '../learn/activity/builtin';
import { serializeProject } from '../project/serialize';
import { ManualFrames, MemoryStorage } from '../test/doubles';
import { App, INFO_NOTICE_MS } from './App';
import { serializePack } from '../learn/content/schema';
import { PACK_KEY, PROFILE_KEY, Session } from './session';

function setup() {
  const frames = new ManualFrames();
  const session = new Session(null, frames);
  render(<App session={session} />);
  return { session, frames };
}

/** Lets `ms` of real time elapse, frame by frame (100 ms per frame). */
function elapse(frames: ManualFrames, ms: number) {
  act(() => {
    for (let t = 0; t < ms; t += 100) frames.step(100);
  });
}

function commit(label: string, value: string, role: 'textbox' | 'spinbutton' = 'textbox') {
  const input = screen.getByRole(role, { name: label });
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('App', () => {
  test('ajoute un ordinateur depuis la palette et valide son adresse IP', () => {
    const { session } = setup();
    expect(screen.getByText('Le plan est vide.')).toBeInTheDocument();
    const palette = screen.getByRole('complementary', { name: 'Palette d’équipements' });
    fireEvent.click(within(palette).getByRole('button', { name: /Ordinateur/ }));
    expect(screen.getByRole('button', { name: 'Ordinateur 1 (sans adresse)' })).toBeInTheDocument();

    commit('Adresse IP', '192.168.1.300');
    expect(screen.getByRole('alert')).toHaveTextContent('Adresse invalide');
    commit('Adresse IP', '192.168.1.10');
    commit('Masque', '255.255.255.0');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ordinateur 1 (192.168.1.10)' })).toBeInTheDocument();
    const host = session.network.host(session.network.devices[0]?.id ?? '');
    expect(host.config.ip).toBe(ip('192.168.1.10'));
  });

  test('pose un câble avec l’outil câble puis le supprime au clavier', () => {
    const { session } = setup();
    session.addDevice('computer');
    session.addDevice('switch');
    fireEvent.click(screen.getByRole('button', { name: 'Câble' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: /^Ordinateur 1/ }));
    fireEvent.keyDown(screen.getByRole('button', { name: /^Switch 1/ }), { key: 'Enter' });
    expect(session.network.cables).toHaveLength(1);
    expect(screen.getByText(/Relie/)).toHaveTextContent('Relie Ordinateur 1 (port 0) à Switch 1');
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(session.network.cables).toHaveLength(0);
  });

  test('en simulation, le terminal d’un poste exécute un ping', () => {
    const { session, frames } = setup();
    const a = session.addDevice('computer');
    const b = session.addDevice('computer');
    const sw = session.addDevice('switch');
    session.network.host(a).updateConfig({ ip: ip('10.0.0.1'), mask: MASK_24 });
    session.network.host(b).updateConfig({ ip: ip('10.0.0.2'), mask: MASK_24 });
    act(() => {
      session.network.connect(a, sw);
      session.network.connect(b, sw);
      session.select({ kind: 'device', id: a });
    });

    fireEvent.click(screen.getByRole('radio', { name: /Simulation/ }));
    // Rien à ajouter pendant une simulation : la palette laisse sa place au plan.
    expect(screen.queryByRole('complementary', { name: 'Palette d’équipements' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le bureau' }));
    const desktop = screen.getByRole('dialog', { name: 'Bureau de Ordinateur 1' });
    fireEvent.click(within(desktop).getByRole('button', { name: 'Ligne de commande' }));
    const terminal = screen.getByRole('dialog', { name: 'Ligne de commande — Ordinateur 1' });
    const input = within(terminal).getByRole('textbox', { name: 'Commande' });
    fireEvent.change(input, { target: { value: 'ping -n 1 10.0.0.2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(within(terminal).getByText(/Commande en cours/)).toBeInTheDocument();
    act(() => {
      session.setSpeed(2);
    });
    elapse(frames, 3000);
    expect(within(terminal).getByRole('log')).toHaveTextContent('reçus = 1, perdus = 0');
    expect(within(terminal).queryByText(/Commande en cours/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Conception/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('affiche l’aide et les messages', () => {
    const { session } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Aide' }));
    expect(screen.getByRole('dialog', { name: 'Aide et connaissances' })).toBeInTheDocument();
    act(() => {
      session.notify('Bonjour');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Bonjour');
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le message' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Trafic automatique', () => {
  test('la case « Masquer le trafic automatique » cache les trames DHCP du plan', () => {
    const { session, frames } = setup();
    act(() => {
      session.loadExample();
      session.setMode('simulation');
    });
    elapse(frames, 100);
    const packets = () => document.querySelectorAll('.packet.dhcp').length;
    expect(packets()).toBeGreaterThan(0);
    const box = screen.getByRole('checkbox', { name: 'Masquer le trafic automatique' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(session.hideAutomatic).toBe(true);
    expect(packets()).toBe(0);
    elapse(frames, 2000);
    expect(packets()).toBe(0);
  });
});

describe('Interfaces du routeur', () => {
  test('ajoute une interface puis la retire, avec confirmation quand elle est câblée', () => {
    const { session } = setup();
    act(() => {
      session.addDevice('switch');
      session.addDevice('router');
    });
    const router = session.network.router(session.network.devices[1]?.id ?? '');
    expect(screen.queryByRole('button', { name: 'Retirer eth0' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une interface' }));
    expect(router.interfaces).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: 'IP eth2' })).toBeInTheDocument();

    // Une interface vide et non câblée part sans confirmation.
    fireEvent.click(screen.getByRole('button', { name: 'Retirer eth2' }));
    expect(router.interfaces).toHaveLength(2);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une interface' }));
    act(() => {
      session.network.connect(router.id, session.network.devices[0]?.id ?? '', { portA: 0 });
      router.setInterface(0, { ip: ip('192.168.1.1'), mask: MASK_24 });
      router.setStaticRoutes([
        { destination: ip('10.0.0.0'), mask: MASK_24, gateway: ip('192.168.1.254'), iface: 0 },
      ]);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retirer eth0' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Retirer l’interface eth0 ?' });
    expect(dialog).toHaveTextContent('Le câble vers « Switch 1 » sera supprimé.');
    expect(dialog).toHaveTextContent('Son adresse 192.168.1.1 sera perdue.');
    expect(dialog).toHaveTextContent('La route statique qui l’utilise sera supprimée.');
    expect(dialog).toHaveTextContent('renumérotées à partir de eth0');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(router.interfaces).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Retirer eth0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(router.interfaces).toHaveLength(2);
    expect(session.network.cables).toHaveLength(0);
    expect(router.staticRoutes).toEqual([]);
    expect(screen.getByRole('button', { name: 'Retirer eth0' })).toBeDisabled();
  });

  test('limite à 8 interfaces', () => {
    const { session } = setup();
    act(() => {
      session.addDevice('router');
    });
    const add = screen.getByRole('button', { name: 'Ajouter une interface' });
    for (let i = 0; i < 6; i++) fireEvent.click(add);
    expect(session.network.router(session.network.devices[0]?.id ?? '').interfaces).toHaveLength(8);
    expect(add).toBeDisabled();
  });
});

describe('Clic droit (menus contextuels)', () => {
  function menuItems() {
    return [...screen.getByRole('menu').querySelectorAll('[role^="menuitem"]')].map(
      (item) => item.getAttribute('aria-label') ?? item.textContent,
    );
  }

  function lan(session: Session) {
    let ids = { pc: '', sw: '', router: '' };
    act(() => {
      const pc = session.addDevice('computer');
      const sw = session.addDevice('switch');
      const router = session.addDevice('router');
      session.network.host(pc).updateConfig({ ip: ip('10.0.0.1'), mask: MASK_24 });
      session.network.router(router).setInterface(1, { ip: ip('10.0.0.254'), mask: MASK_24 });
      session.network.connect(pc, sw);
      session.network.connect(router, sw, { portA: 1 });
      ids = { pc, sw, router };
    });
    return ids;
  }

  test('conception : menu d’un équipement (Configurer, câbles, Supprimer)', () => {
    vi.useFakeTimers();
    try {
      const { session } = setup();
      const { pc, sw, router } = lan(session);
      fireEvent.contextMenu(screen.getByRole('button', { name: /^Ordinateur 1/ }));
      expect(screen.getByRole('menu', { name: 'Menu de « Ordinateur 1 »' })).toBeInTheDocument();
      expect(menuItems()).toEqual(['Configurer', 'Supprimer le câble', 'Supprimer', 'Qu’est-ce que c’est ?']);
      expect(session.selection).toEqual({ kind: 'device', id: pc });
      expect(screen.getByRole('menuitem', { name: 'Configurer' })).toHaveFocus();

      fireEvent.click(screen.getByRole('menuitem', { name: 'Configurer' }));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      act(() => {
        vi.runAllTimers();
      });
      expect(screen.getByRole('textbox', { name: 'Nom' })).toHaveFocus();

      fireEvent.contextMenu(screen.getByRole('button', { name: /^Switch 1/ }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer tous les câbles' }));
      expect(session.network.cables).toHaveLength(0);

      fireEvent.contextMenu(screen.getByRole('button', { name: /^Ordinateur 1/ }));
      expect(screen.getByRole('menuitem', { name: 'Supprimer le câble' })).toBeDisabled();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
      expect(session.network.device(pc)).toBeUndefined();
      expect(session.network.device(sw)).toBeDefined();
      expect(session.network.device(router)).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  test('conception : menu d’un câble ; rien sur le plan vide', () => {
    const { session } = setup();
    lan(session);
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Câble Ordinateur 1 – Switch 1' }));
    expect(menuItems()).toEqual(['Supprimer le câble']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer le câble' }));
    expect(session.network.cables).toHaveLength(1);
    expect(session.selection).toBeNull();

    const plan = screen.getByRole('application', { name: 'Plan du réseau' });
    expect(fireEvent.contextMenu(plan)).toBe(false); // menu du navigateur empêché
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('clavier : Maj+F10 ouvre le menu, flèches, Échap le ferme et rend le focus', () => {
    const { session } = setup();
    lan(session);
    const device = screen.getByRole('button', { name: /^Switch 1/ });
    device.focus();
    fireEvent.keyDown(device, { key: 'F10', shiftKey: true });
    const menu = screen.getByRole('menu');
    expect(screen.getByRole('menuitem', { name: 'Configurer' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Supprimer tous les câbles' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(screen.getByRole('menuitem', { name: 'Qu’est-ce que c’est ?' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Configurer' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Qu’est-ce que c’est ?' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(screen.getByRole('menuitem', { name: 'Configurer' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(device).toHaveFocus();

    // Touche « menu » du clavier, puis clic à l’extérieur.
    fireEvent.keyDown(device, { key: 'ContextMenu' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('conception : menu d’un texte (taille, style, couleur) et d’une zone', () => {
    const { session } = setup();
    let text = '';
    let zone = '';
    act(() => {
      text = session.addNote('text');
      zone = session.addNote('zone');
    });
    const canvas = screen.getByRole('application', { name: 'Plan du réseau' });
    const openText = () => {
      fireEvent.contextMenu(within(canvas).getByRole('button', { name: 'Texte : Texte' }));
    };
    openText();
    expect(screen.getByRole('menu', { name: 'Menu de le texte' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Très grande' }));
    expect(session.network.note(text)?.fontSize).toBe(24);
    openText();
    expect(screen.getByRole('menuitemradio', { name: 'Très grande' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Italique' }));
    expect(session.network.note(text)).toMatchObject({ italic: true, bold: false });
    openText();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Gras' }));
    expect(session.network.note(text)).toMatchObject({ italic: false, bold: true });
    openText();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Couleur #ff0000' }));
    expect(session.network.note(text)?.color).toBe('#ff0000');
    openText();
    expect(screen.getByRole('menuitemradio', { name: 'Couleur #ff0000' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    expect(session.network.note(text)).toBeUndefined();

    const zoneButton = within(canvas).getByRole('button', { name: 'Zone' });
    zoneButton.focus();
    fireEvent.keyDown(zoneButton, { key: 'ContextMenu' });
    expect(menuItems()).toEqual([
      ...[
        '#cccccc',
        '#ebebeb',
        '#ffffff',
        '#ffc9c9',
        '#fcc9a3',
        '#ffffe3',
        '#d4cfb5',
        '#ded4ff',
        '#d1e8ff',
        '#bfffdb',
        '#ccdead',
        '#e3eafc',
      ].map((c) => `Couleur ${c}`),
      'Supprimer',
    ]);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Couleur #d1e8ff' }));
    expect(session.network.note(zone)?.color).toBe('#d1e8ff');
  });

  test('simulation : bureau et échanges de données de chaque interface', () => {
    const { session } = setup();
    lan(session);
    fireEvent.click(screen.getByRole('radio', { name: /Simulation/ }));

    fireEvent.contextMenu(screen.getByRole('button', { name: /^Ordinateur 1/ }));
    expect(menuItems()).toEqual([
      'Afficher le bureau',
      'Afficher les échanges de données (10.0.0.1)',
      'Qu’est-ce que c’est ?',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Afficher le bureau' }));
    expect(screen.getByRole('dialog', { name: 'Bureau de Ordinateur 1' })).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole('button', { name: /^Routeur 1/ }));
    expect(menuItems()).toEqual([
      'Afficher les tables du routeur',
      'Afficher les échanges de données (eth0 – sans adresse)',
      'Afficher les échanges de données (eth1 – 10.0.0.254)',
      'Qu’est-ce que c’est ?',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: /eth1/ }));
    const capture = screen.getByRole('dialog', { name: 'Échanges de données — Routeur 1' });
    expect(within(capture).getByRole('combobox', { name: 'Interface' })).toHaveValue('1');
    // Même fenêtre, autre interface.
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Routeur 1/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /eth0/ }));
    expect(screen.getAllByRole('dialog', { name: 'Échanges de données — Routeur 1' })).toHaveLength(1);
    expect(within(capture).getByRole('combobox', { name: 'Interface' })).toHaveValue('0');

    fireEvent.contextMenu(screen.getByRole('button', { name: /^Switch 1/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Afficher la table des adresses MAC' }));
    expect(screen.getByRole('dialog', { name: 'Table des adresses MAC — Switch 1' })).toBeInTheDocument();

    // Pas de menu sur un câble en simulation.
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Câble Ordinateur 1 – Switch 1' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Wi-Fi', () => {
  test('le switch a un nom Wi-Fi ; un portable le rejoint en le choisissant', () => {
    const { session } = setup();
    let sw = '';
    let laptop = '';
    act(() => {
      sw = session.addDevice('switch');
      laptop = session.addDevice('laptop');
      session.select({ kind: 'device', id: sw });
    });
    expect(screen.getByRole('textbox', { name: 'Nom Wi-Fi (SSID)' })).toHaveValue('Wifi-1');
    commit('Nom Wi-Fi (SSID)', '   ');
    expect(screen.getByRole('alert')).toHaveTextContent('ne peut pas être vide');
    commit('Nom Wi-Fi (SSID)', 'CDI');
    expect(session.network.switches[0]?.ssid).toBe('CDI');
    expect(screen.getByText('Aucun poste connecté en Wi-Fi.')).toBeInTheDocument();

    act(() => {
      session.select({ kind: 'device', id: laptop });
    });
    expect(screen.getByRole('radio', { name: 'Filaire (LAN)' })).toBeChecked();
    expect(screen.getByText('Aucun câble : reliez ce poste avec l’outil Câble.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Sans fil (Wi-Fi)' }));
    expect(session.network.host(laptop).wifi).toBe(true);
    expect(screen.getByText('Non connecté : choisissez un réseau.')).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Réseau sans fil (SSID)' });
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      '— Choisir un réseau —',
      'CDI',
    ]);
    fireEvent.change(select, { target: { value: 'CDI' } });
    expect(screen.getByText('Connecté au réseau « CDI » (switch « Switch 1 »).')).toBeInTheDocument();
    const link = screen.getByRole('button', { name: 'Wi-Fi Portable 1 – Switch 1' });
    expect(link).toHaveClass('wireless');
    expect(screen.getByRole('button', { name: 'Switch 1 (Wi-Fi « CDI »)' })).toBeInTheDocument();

    // Panneau de la connexion sélectionnée, puis menu contextuel.
    fireEvent.pointerDown(link);
    expect(screen.getByText(/connecté sans fil/)).toHaveTextContent(
      'Portable 1 est connecté sans fil au réseau « CDI » de Switch 1 (port 0).',
    );
    fireEvent.contextMenu(link);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Déconnecter le Wi-Fi' }));
    expect(session.network.cables).toHaveLength(0);

    // Choisir « — Choisir un réseau — » déconnecte aussi.
    act(() => {
      session.network.joinWifi(laptop, 'CDI');
      session.select({ kind: 'device', id: laptop });
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Réseau sans fil (SSID)' }), {
      target: { value: '' },
    });
    expect(session.network.cables).toHaveLength(0);
  });

  test('passer de filaire à Wi-Fi demande confirmation quand un câble est branché', () => {
    const { session } = setup();
    let pc = '';
    act(() => {
      const sw = session.addDevice('switch');
      pc = session.addDevice('computer');
      session.network.connect(pc, sw);
    });
    expect(screen.getByText('Relié par câble à « Switch 1 ».')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Sans fil (Wi-Fi)' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Passer en Wi-Fi ?' });
    expect(dialog).toHaveTextContent('Le câble vers « Switch 1 » sera supprimé.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(session.network.host(pc).wifi).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: 'Sans fil (Wi-Fi)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }));
    expect(session.network.host(pc).wifi).toBe(true);
    expect(session.network.cables).toHaveLength(0);

    act(() => {
      session.network.joinWifi(pc, 'Wifi-1');
    });
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Ordinateur 1/ }));
    expect(screen.getByRole('menuitem', { name: 'Déconnecter le Wi-Fi' })).toBeEnabled();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('radio', { name: 'Filaire (LAN)' }));
    expect(screen.getByRole('alertdialog', { name: 'Passer en filaire ?' })).toHaveTextContent(
      'La connexion au réseau Wi-Fi « Wifi-1 » sera coupée.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Changer' }));
    expect(session.network.host(pc).wifi).toBe(false);
    expect(screen.getByRole('radio', { name: 'Filaire (LAN)' })).toBeChecked();
  });

  test('outil câble : un poste en Wi-Fi se connecte sans fil à un switch, pas à un routeur', () => {
    const { session } = setup();
    let laptop = '';
    act(() => {
      session.addDevice('switch');
      session.addDevice('router');
      laptop = session.addDevice('laptop');
      session.network.setHostWifi(laptop, true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Câble' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: /^Portable 1/ }));
    fireEvent.pointerDown(screen.getByRole('button', { name: /^Routeur 1/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Connexion sans fil impossible');
    fireEvent.pointerDown(screen.getByRole('button', { name: /^Portable 1/ }));
    fireEvent.pointerDown(screen.getByRole('button', { name: /^Switch 1/ }));
    expect(session.network.cables).toEqual([expect.objectContaining({ wireless: true })]);
    expect(session.network.wifiAccessPoint(session.network.host(laptop))?.ssid).toBe('Wifi-1');
  });
});

describe('Remplacement du réseau', () => {
  test('demande confirmation avant de remplacer un réseau non vide', () => {
    const { session } = setup();
    act(() => {
      session.addDevice('switch');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Exemple' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Remplacer le réseau ?' });
    expect(within(dialog).getByRole('button', { name: 'Annuler' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(session.network.devices).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remplacer' }));
    expect(session.network.devices).toHaveLength(0);
  });
});

describe('Annotations et import', () => {
  test('ajoute un texte depuis la palette, le modifie puis le supprime', () => {
    const { session } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Texte' }));
    expect(screen.getByRole('button', { name: 'Texte : Texte' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Texte' }), { target: { value: 'Salle 101' } });
    expect(screen.getByRole('button', { name: 'Texte : Salle 101' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Gras' }));
    commit('Taille du texte', '200', 'spinbutton');
    expect(screen.getByRole('alert')).toHaveTextContent('Entre 8 et 96.');
    commit('Taille du texte', '24', 'spinbutton');
    expect(session.network.notes[0]).toMatchObject({ text: 'Salle 101', bold: true, fontSize: 24 });
    fireEvent.click(screen.getByRole('button', { name: 'Zone' }));
    expect(screen.getByLabelText('Couleur de fond')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Couleur de fond'), { target: { value: '#ffcc00' } });
    expect(session.network.notes[1]?.color).toBe('#ffcc00');
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(session.network.notes).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Texte : Salle 101' }), { key: 'Enter' });
    expect(session.selection).toEqual({ kind: 'note', id: session.network.notes[0]?.id });
  });

  test('déplace et redimensionne une zone à la souris', () => {
    const { session } = setup();
    act(() => {
      session.addNote('zone');
    });
    const canvas = screen.getByRole('application', { name: 'Plan du réseau' });
    const zone = within(canvas).getByRole('button', { name: 'Zone' });
    const before = session.network.notes[0];
    fireEvent.pointerDown(zone, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 130 });
    fireEvent.pointerUp(canvas);
    expect(session.network.notes[0]).toMatchObject({ x: (before?.x ?? 0) + 50, y: (before?.y ?? 0) + 30 });
    const handle = document.querySelector('.note-handle');
    if (!handle) throw new Error('poignée absente');
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(canvas, { clientX: 40, clientY: -20 });
    fireEvent.pointerUp(canvas);
    expect(session.network.notes[0]).toMatchObject({
      width: (before?.width ?? 0) + 40,
      height: (before?.height ?? 0) - 20,
    });
  });

  test('affiche le rapport d’import d’un fichier Filius', () => {
    const { session } = setup();
    act(() => {
      session.importReport = { fileName: 'cours.fls', version: '2.5.1', warnings: ['Modem ignoré.'] };
      session.touch();
    });
    const dialog = screen.getByRole('dialog', { name: 'Projet Filius importé' });
    expect(dialog).toHaveTextContent('cours.fls');
    expect(dialog).toHaveTextContent('Filius 2.5.1');
    expect(dialog).toHaveTextContent('Modem ignoré.');
    fireEvent.click(screen.getByRole('button', { name: 'Compris' }));
    expect(screen.queryByRole('dialog', { name: 'Projet Filius importé' })).not.toBeInTheDocument();
  });
});

describe('Saisie et finitions', () => {
  function addComputer() {
    const palette = screen.getByRole('complementary', { name: 'Palette d’équipements' });
    fireEvent.click(within(palette).getByRole('button', { name: /Ordinateur/ }));
  }

  /** Types in a field without leaving it, as a pupil who has not pressed Enter yet. */
  function type(label: string, value: string) {
    const input = screen.getByRole('textbox', { name: label });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value } });
  }

  test('une adresse tapée est appliquée quand on clique sur le plan vide', () => {
    const { session } = setup();
    addComputer();
    const host = session.network.host(session.network.devices[0]?.id ?? '');
    type('Adresse IP', '192.168.1.10');
    fireEvent.pointerDown(screen.getByRole('application', { name: 'Plan du réseau' }));
    expect(host.config.ip).toBe(ip('192.168.1.10'));
    expect(session.selection).toBeNull();
  });

  test('une adresse invalide garde le poste sélectionné et affiche l’erreur', () => {
    const { session } = setup();
    addComputer();
    const id = session.network.devices[0]?.id ?? '';
    type('Adresse IP', '192.168.1.300');
    fireEvent.pointerDown(screen.getByRole('application', { name: 'Plan du réseau' }));
    expect(session.selection).toEqual({ kind: 'device', id });
    expect(screen.getByRole('alert')).toHaveTextContent('Adresse invalide');
    expect(session.network.host(id).config.ip).toBe(0);
  });

  test('une adresse tapée est appliquée avant d’ajouter un autre équipement', () => {
    const { session } = setup();
    addComputer();
    const first = session.network.host(session.network.devices[0]?.id ?? '');
    type('Adresse IP', '10.0.0.1');
    act(() => {
      session.addDevice('switch');
    });
    expect(first.config.ip).toBe(ip('10.0.0.1'));
  });

  test('le masque 255.255.255.0 est proposé avec la première adresse, sans écraser un masque choisi', () => {
    const { session } = setup();
    addComputer();
    const host = session.network.host(session.network.devices[0]?.id ?? '');
    const mask = screen.getByRole('textbox', { name: 'Masque' });
    expect(mask).toHaveValue('');
    expect(mask).toHaveAttribute('placeholder', 'ex. 255.255.255.0');
    commit('Adresse IP', '192.168.1.10');
    expect(mask).toHaveValue('255.255.255.0');
    commit('Masque', '255.255.0.0');
    commit('Adresse IP', '192.168.1.11');
    expect(host.config.mask).toBe(ip('255.255.0.0'));
  });

  test('le masque est aussi proposé pour une interface de routeur', () => {
    const { session } = setup();
    let id = '';
    act(() => {
      id = session.addDevice('router');
    });
    commit('IP eth0', '10.0.1.1');
    expect(session.network.router(id).interfaces[0]?.mask).toBe(MASK_24);
  });

  test('« Ouvrir… » demande confirmation avant de remplacer un réseau non vide', async () => {
    const { session } = setup();
    act(() => {
      session.addDevice('computer');
    });
    const other = new Network();
    other.addSwitch({ name: 'Cœur' });
    const json = serializeProject(other);
    // jsdom's File has no text(): provide it, as browsers do.
    const file = Object.assign(new File([json], 'cours.reseaulab.json', { type: 'application/json' }), {
      text: () => Promise.resolve(json),
    });
    fireEvent.change(screen.getByTestId('open-project'), { target: { files: [file] } });
    const dialog = screen.getByRole('alertdialog', { name: 'Remplacer le réseau ?' });
    expect(session.network.devices[0]?.name).toBe('Ordinateur 1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(session.network.devices[0]?.name).toBe('Ordinateur 1');

    fireEvent.change(screen.getByTestId('open-project'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Remplacer' }));
    expect(await screen.findByRole('button', { name: /^Cœur/ })).toBeInTheDocument();
    expect(session.fileName).toBe('cours.reseaulab.json');
  });

  test('« Enregistrer » demande le nom du fichier et le nettoie', () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      const { session } = setup();
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
      const dialog = screen.getByRole('dialog', { name: 'Enregistrer le projet' });
      const name = within(dialog).getByRole('textbox', { name: 'Nom du fichier' });
      expect(name).toHaveValue('reseau');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
      expect(click).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Nom du fichier' }), {
        target: { value: ' Dupont : salle/1 ' },
      });
      fireEvent.click(
        within(screen.getByRole('dialog', { name: 'Enregistrer le projet' })).getByRole('button', {
          name: 'Enregistrer',
        }),
      );
      expect(session.fileName).toBe('Dupont salle 1.reseaulab.json');
      expect(click).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toHaveTextContent('Dupont salle 1.reseaulab.json');
      expect(screen.queryByRole('dialog', { name: 'Enregistrer le projet' })).not.toBeInTheDocument();
    } finally {
      click.mockRestore();
    }
  });

  test('un message d’erreur reste affiché ; une information s’efface seule', () => {
    vi.useFakeTimers();
    try {
      const { session } = setup();
      act(() => {
        session.notify('Câble impossible', 'error');
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.getByRole('alert')).toHaveTextContent('Câble impossible');
      act(() => {
        session.notify('Projet ouvert');
      });
      act(() => {
        vi.advanceTimersByTime(INFO_NOTICE_MS - 1);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Projet ouvert');
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('un travail retrouvé sur le poste est proposé : continuer ou repartir de zéro', () => {
    const storage = new MemoryStorage();
    const first = new Session(storage, new ManualFrames(), () => new Date(2026, 10, 10, 9, 5).getTime());
    first.addDevice('computer');
    first.saveNow();

    const kept = new Session(storage, new ManualFrames());
    const view = render(<App session={kept} />);
    const banner = screen.getByRole('region', { name: 'Travail retrouvé' });
    expect(banner).toHaveTextContent('enregistré le 10/11 à 09:05');
    fireEvent.click(within(banner).getByRole('button', { name: 'Continuer ce travail' }));
    expect(screen.queryByRole('region', { name: 'Travail retrouvé' })).not.toBeInTheDocument();
    expect(kept.network.devices).toHaveLength(1);
    view.unmount();

    const fresh = new Session(storage, new ManualFrames());
    render(<App session={fresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau réseau' }));
    expect(fresh.network.devices).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Travail retrouvé' })).not.toBeInTheDocument();
  });

  test('les nombres s’écrivent avec une virgule', () => {
    const { session } = setup();
    // Les réglages de la simulation n'apparaissent que dans ce mode.
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    act(() => {
      session.setMode('simulation');
      session.setSpeed(0.25);
    });
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
    expect(screen.getByText('× 0,25')).toBeInTheDocument();
    expect(screen.getByTitle('Temps simulé')).toHaveTextContent('0,0 s');
  });
});

describe('Plan lisible', () => {
  test('annule et rétablit une modification, au bouton et au clavier', () => {
    const { session } = setup();
    const undo = screen.getByRole('button', { name: 'Annuler' });
    const redo = screen.getByRole('button', { name: 'Rétablir' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    act(() => {
      session.addDevice('computer');
      session.commitHistory();
      session.addDevice('switch');
      session.commitHistory();
      session.touch();
    });
    expect(session.network.devices).toHaveLength(2);

    fireEvent.click(undo);
    expect(screen.queryByRole('button', { name: /^Switch 1/ })).not.toBeInTheDocument();
    expect(session.selection).toBeNull();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(session.network.devices).toHaveLength(0);
    expect(undo).toBeDisabled();

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(session.network.devices.map((d) => d.name)).toEqual(['Ordinateur 1', 'Switch 1']);
    expect(redo).toBeDisabled();
  });

  test('Ctrl+Z dans un champ de texte reste celui du champ', () => {
    const { session } = setup();
    act(() => {
      session.addDevice('computer');
      session.commitHistory();
      session.touch();
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nom' }), { key: 'z', ctrlKey: true });
    expect(session.network.devices).toHaveLength(1);
  });

  test('zoom : boutons −, +, taille réelle et Ajuster', () => {
    const { session } = setup();
    const group = screen.getByRole('group', { name: 'Zoom du plan' });
    fireEvent.click(within(group).getByRole('button', { name: 'Réduire le plan' }));
    expect(session.zoom).toBe(0.9);
    expect(within(group).getByText('90 %')).toBeInTheDocument();
    expect(session.autoFit).toBe(false);
    fireEvent.click(within(group).getByRole('button', { name: 'Agrandir le plan' }));
    fireEvent.click(within(group).getByRole('button', { name: 'Agrandir le plan' }));
    expect(session.zoom).toBe(1.25);
    fireEvent.click(within(group).getByRole('button', { name: /Revenir à la taille réelle/ }));
    expect(session.zoom).toBe(1);
    fireEvent.click(within(group).getByRole('button', { name: 'Ajuster' }));
    expect(session.autoFit).toBe(true);
    expect(within(group).getByRole('button', { name: 'Ajuster' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('le plan est dessiné à l’échelle du zoom et les déplacements en tiennent compte', () => {
    const { session } = setup();
    let id = '';
    act(() => {
      id = session.addDevice('computer', { x: 200, y: 200 });
      session.setZoom(0.5);
    });
    const plan = screen.getByRole('application', { name: 'Plan du réseau' });
    expect(plan).toHaveAttribute('viewBox', '0 0 1400 900');
    expect(plan).toHaveAttribute('width', '700');
    const device = screen.getByRole('button', { name: /^Ordinateur 1/ });
    fireEvent.pointerDown(device, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(plan, { clientX: 150, clientY: 120 });
    fireEvent.pointerUp(plan);
    // 50 px à l'écran = 100 unités du plan à 50 %.
    expect(session.network.device(id)?.position).toEqual({ x: 300, y: 240 });
  });

  test('en simulation : Échap ferme la fenêtre du dessus ; ranger et tout fermer', () => {
    const { session } = setup();
    let a = '';
    let b = '';
    act(() => {
      a = session.addDevice('computer');
      b = session.addDevice('computer');
      session.setMode('simulation');
      session.openWindow({ type: 'desktop', deviceId: a });
      session.openWindow({ type: 'desktop', deviceId: b });
    });
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Bureau de Ordinateur 1');

    act(() => {
      session.openWindow({ type: 'capture', deviceId: b });
      session.moveWindow(`desktop:${a}`, 300, 200);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ranger les fenêtres' }));
    expect(session.windows.map((w) => [w.x, w.y])).toEqual([
      [80, 60],
      [108, 88],
    ]);
    // Échap dans une fenêtre ferme celle-ci, même si elle n'est pas au-dessus.
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Bureau de Ordinateur 1' }), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Échanges de données — Ordinateur 2');
    fireEvent.click(screen.getByRole('button', { name: 'Tout fermer' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tout fermer' })).not.toBeInTheDocument();
  });

  test('Échap dans le terminal ne ferme pas la fenêtre', () => {
    const { session } = setup();
    act(() => {
      const a = session.addDevice('computer');
      session.setMode('simulation');
      session.openWindow({ type: 'app', deviceId: a, app: 'terminal' });
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Commande' }), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Diagnostic', () => {
  /** Two computers on a switch, with addresses, in the session of a rendered App. */
  function lan(session: Session) {
    let a = '';
    let b = '';
    act(() => {
      a = session.addDevice('computer');
      b = session.addDevice('computer');
      const sw = session.addDevice('switch');
      session.network.host(a).updateConfig({ ip: ip('10.0.0.1'), mask: MASK_24 });
      session.network.host(b).updateConfig({ ip: ip('10.0.0.2'), mask: MASK_24 });
      session.network.connect(a, sw);
      session.network.connect(b, sw);
      session.select(null);
    });
    return { a, b };
  }

  test('signale un équipement mal configuré sur le plan, dans la barre d’outils et dans son panneau', () => {
    const { session } = setup();
    expect(screen.getByRole('button', { name: 'Vérifier' })).toBeInTheDocument();
    act(() => {
      session.addDevice('switch');
      session.addDevice('computer');
    });
    // Ni adresse ni câble : deux erreurs pour le même poste.
    expect(screen.getByRole('button', { name: 'Vérifier : 2 points repérés' })).toBeInTheDocument();
    const device = screen.getByRole('button', { name: 'Ordinateur 1 (sans adresse)' });
    expect(device.querySelector('.lint-mark.error title')).toHaveTextContent(
      'Ordinateur 1 n’est relié à rien — Ordinateur 1 n’a pas d’adresse IP',
    );
    const points = screen.getByRole('list', { name: 'Points à vérifier' });
    expect(points).toHaveTextContent('Ordinateur 1 n’a pas d’adresse IP. Donnez-lui une adresse IP');

    commit('Adresse IP', '10.0.0.1');
    expect(screen.getByRole('button', { name: 'Vérifier : 1 point repéré' })).toBeInTheDocument();
    expect(points).not.toHaveTextContent('adresse IP');
    expect(document.querySelectorAll('.lint-mark')).toHaveLength(1);
  });

  test('« Vérifier » liste les problèmes et montre l’équipement concerné', () => {
    const { session } = setup();
    const { a, b } = lan(session);
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    const dialog = screen.getByRole('dialog', { name: 'Vérifier mon réseau' });
    expect(dialog).toHaveTextContent('Aucun problème repéré dans la configuration.');

    act(() => {
      session.network.host(b).updateConfig({ ip: ip('10.0.0.1') });
    });
    expect(dialog).toHaveTextContent('Un point repéré dans la configuration');
    expect(dialog).toHaveTextContent('L’adresse 10.0.0.1 est utilisée plusieurs fois');
    expect(dialog).toHaveTextContent('Que faire ? Donnez une adresse différente à chacun.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Montrer' }));
    expect(session.selection).toEqual({ kind: 'device', id: a });
  });

  test('teste une communication sur une copie et signale un résultat périmé', () => {
    const { session } = setup();
    const { a, b } = lan(session);
    act(() => {
      session.select({ kind: 'device', id: a });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));
    const dialog = screen.getByRole('dialog', { name: 'Vérifier mon réseau' });
    const submit = within(dialog).getByRole('button', { name: 'Tester' });
    expect(submit).toBeDisabled();
    // L'équipement sélectionné est proposé comme point de départ.
    expect(within(dialog).getByRole('combobox', { name: 'Depuis' })).toHaveValue(a);
    fireEvent.change(within(dialog).getByRole('combobox', { name: /^Vers/ }), {
      target: { value: 'Ordinateur 2' },
    });
    fireEvent.click(submit);
    const result = within(dialog).getByRole('status');
    // La destination est nommée comme l'élève l'a désignée.
    expect(result).toHaveTextContent('Ordinateur 1 communique avec Ordinateur 2');
    expect(result).toHaveTextContent('Trajet de la demande : Ordinateur 1 → Switch 1 → Ordinateur 2 ✔');
    expect(session.mode).toBe('design');
    expect(session.network.running).toBe(false);

    act(() => {
      session.network.host(b).updateConfig({ ip: ip('10.0.0.3') });
    });
    expect(result).toHaveTextContent('Le réseau a changé depuis ce test');
    fireEvent.change(within(dialog).getByRole('combobox', { name: /^Vers/ }), {
      target: { value: '10.0.0.2' },
    });
    fireEvent.click(submit);
    expect(result).not.toHaveTextContent('Le réseau a changé');
    expect(result).toHaveTextContent('Personne n’a l’adresse 10.0.0.2');
    expect(result).toHaveTextContent('Trajet de la demande : Ordinateur 1 ✘');
  });

  test('après un ping raté, le terminal propose « Pourquoi ça ne marche pas ? »', () => {
    const { session, frames } = setup();
    const { a } = lan(session);
    act(() => {
      session.setMode('simulation');
      session.setSpeed(4);
      session.openWindow({ type: 'app', deviceId: a, app: 'terminal' });
    });
    const terminal = screen.getByRole('dialog', { name: 'Ligne de commande — Ordinateur 1' });
    const input = within(terminal).getByRole('textbox', { name: 'Commande' });
    const run = (line: string) => {
      fireEvent.change(input, { target: { value: line } });
      fireEvent.keyDown(input, { key: 'Enter' });
      elapse(frames, 6000);
    };
    run('ping -n 1 10.0.0.2');
    expect(within(terminal).getByRole('log')).toHaveTextContent('reçus = 1, perdus = 0');
    expect(screen.queryByRole('button', { name: 'Pourquoi ça ne marche pas ?' })).not.toBeInTheDocument();

    run('ping -n 1 10.0.0.77');
    expect(within(terminal).getByRole('log')).toHaveTextContent(
      'Hôte de destination inaccessible : aucun équipement n’a répondu à cette adresse sur le réseau.',
    );
    fireEvent.click(within(terminal).getByRole('button', { name: 'Pourquoi ça ne marche pas ?' }));
    const dialog = screen.getByRole('dialog', { name: 'Vérifier mon réseau' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Personne n’a l’adresse 10.0.0.77');
    expect(within(dialog).getByRole('combobox', { name: /^Vers/ })).toHaveValue('10.0.0.77');

    // La fenêtre de vérification reste ouverte en revenant à la conception.
    fireEvent.click(screen.getByRole('radio', { name: /Conception/ }));
    expect(screen.getByRole('dialog', { name: 'Vérifier mon réseau' })).toBeInTheDocument();
    // Une nouvelle commande retire la proposition.
    act(() => {
      session.setMode('simulation');
      session.openWindow({ type: 'app', deviceId: a, app: 'terminal' });
    });
    expect(screen.queryByRole('button', { name: 'Pourquoi ça ne marche pas ?' })).not.toBeInTheDocument();
  });
});

describe('Lecture de la simulation', () => {
  /** A — switch — B, plus C on the same switch, in simulation mode. */
  function threeHosts(session: Session) {
    const ids = { a: '', b: '', c: '' };
    act(() => {
      const sw = session.addDevice('switch');
      for (const [key, address] of [
        ['a', '10.0.0.1'],
        ['b', '10.0.0.2'],
        ['c', '10.0.0.3'],
      ] as const) {
        ids[key] = session.addDevice('computer');
        session.network.host(ids[key]).updateConfig({ ip: ip(address), mask: MASK_24 });
        session.network.connect(ids[key], sw);
      }
      session.setMode('simulation');
      session.setSpeed(4);
    });
    return ids;
  }

  test('les trames portent le nom de leur protocole ; la légende les explique', () => {
    const { session, frames } = setup();
    const { a } = threeHosts(session);
    act(() => {
      session.network.host(a).stack.icmp.ping(ip('10.0.0.2'), {}, () => undefined);
    });
    elapse(frames, 100);
    expect(document.querySelector('.packet.arp text')).toHaveTextContent('ARP');
    // À × 4, un câble se traverse en 100 ms : après l'aller-retour ARP vient la demande d'écho.
    elapse(frames, 500);
    expect(document.querySelector('.packet.icmp text')).toHaveTextContent('ICMP');

    expect(screen.queryByRole('list', { name: 'Légende des trames' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Légende des trames/ }));
    const legend = screen.getByRole('list', { name: 'Légende des trames' });
    expect(legend).toHaveTextContent('ARP : qui a cette adresse IP ?');
    expect(legend).toHaveTextContent('Abandon : l’équipement n’a pas pu aller plus loin');
    fireEvent.click(screen.getByRole('button', { name: /Légende des trames/ }));
    expect(screen.queryByRole('list', { name: 'Légende des trames' })).not.toBeInTheDocument();
  });

  test('un abandon est écrit sur le plan, à côté de l’équipement', () => {
    const { session, frames } = setup();
    const { a } = threeHosts(session);
    act(() => {
      session.network.host(a).stack.icmp.ping(ip('172.16.0.1'), {}, () => undefined);
    });
    elapse(frames, 100);
    expect(document.querySelector('.drop-mark text')).toHaveTextContent('✕ aucun chemin vers la destination');
  });

  test('pause signalée sur le plan ; « Trame suivante » avance d’un câble', () => {
    const { session, frames } = setup();
    const { a } = threeHosts(session);
    expect(screen.queryByText(/Simulation en pause/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('status')).toHaveTextContent('Simulation en pause');
    act(() => {
      session.network.host(a).stack.icmp.ping(ip('10.0.0.2'), {}, () => undefined);
    });
    const next = screen.getByRole('button', { name: 'Trame suivante' });
    fireEvent.click(next);
    expect(next).toBeDisabled();
    expect(screen.queryByText(/Simulation en pause/)).not.toBeInTheDocument();
    elapse(frames, 2000);
    expect(next).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Simulation en pause');
    expect(screen.getByRole('button', { name: 'Reprendre' })).toBeInTheDocument();
    // La demande ARP est arrivée au switch, qui la diffuse aux deux autres postes.
    expect(document.querySelectorAll('.packet.arp').length).toBeGreaterThanOrEqual(2);
    expect(session.network.host(a).stack.arp.entries).toHaveLength(0);
  });

  test('échanges de données : trames ignorées signalées, filtres par protocole', () => {
    const { session, frames } = setup();
    const { a, c } = threeHosts(session);
    act(() => {
      session.network.host(a).stack.icmp.ping(ip('10.0.0.2'), {}, () => undefined);
      session.openWindow({ type: 'capture', deviceId: c });
    });
    elapse(frames, 3000);
    const capture = screen.getByRole('dialog', { name: 'Échanges de données — Ordinateur 3' });
    // C n'a vu que la demande ARP diffusée à tous, qui ne le concerne pas.
    const rows = () => within(capture).getAllByRole('row').slice(1);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('← ignorée');
    expect(rows()[0]).toHaveClass('ignored');
    const hide = within(capture).getByRole('checkbox', { name: 'Masquer les trames ignorées (1)' });
    fireEvent.click(hide);
    expect(capture).toHaveTextContent('Aucune trame ne correspond aux filtres choisis.');
    expect(capture).toHaveTextContent('0 trame(s) sur 1');
    fireEvent.click(hide);

    act(() => {
      session.closeAllWindows();
      session.openWindow({ type: 'capture', deviceId: a });
    });
    const own = screen.getByRole('dialog', { name: 'Échanges de données — Ordinateur 1' });
    expect(own).toHaveTextContent('4 trame(s)');
    expect(own).toHaveTextContent('→ envoyée');
    expect(own).toHaveTextContent('← acceptée');
    expect(own).toHaveTextContent('Cliquez sur une trame pour voir son contenu');
    const protocol = within(own).getByRole('combobox', { name: 'Protocole' });
    expect(
      within(protocol)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Tous les protocoles', 'ARP', 'ICMP']);
    fireEvent.change(protocol, { target: { value: 'ICMP' } });
    expect(own).toHaveTextContent('2 trame(s) sur 4');
    expect(within(own).getAllByRole('row').slice(1)).toHaveLength(2);
  });

  test('les tables d’un poste se consultent sans la ligne de commande', () => {
    const { session, frames } = setup();
    const { a } = threeHosts(session);
    act(() => {
      session.select({ kind: 'device', id: a });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les tables' }));
    const tables = screen.getByRole('dialog', { name: 'Tables — Ordinateur 1' });
    expect(tables).toHaveTextContent('10.0.0.0');
    expect(tables).toHaveTextContent('carte réseau');
    expect(tables).toHaveTextContent('Vide : aucun échange pour l’instant.');
    act(() => {
      session.network.host(a).stack.icmp.ping(ip('10.0.0.2'), {}, () => undefined);
    });
    elapse(frames, 3000);
    expect(within(tables).getByRole('cell', { name: '10.0.0.2' })).toBeInTheDocument();
  });
});

describe('Aide et connaissances', () => {
  test('s’ouvre sur la prise en main ; les fiches se lisent de lien en lien, avec un retour', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Aide' }));
    const help = screen.getByRole('dialog', { name: 'Aide et connaissances' });
    expect(within(help).getByRole('article', { name: 'Construire un réseau' })).toBeInTheDocument();
    // Les rubriques : prise en main puis notions.
    const index = within(help).getByRole('navigation', { name: 'Fiches' });
    expect(within(index).getByRole('heading', { name: 'Prise en main' })).toBeInTheDocument();
    expect(within(index).getByRole('heading', { name: 'Adresses' })).toBeInTheDocument();

    fireEvent.click(within(index).getByRole('button', { name: 'Passerelle' }));
    const card = within(help).getByRole('article', { name: 'Passerelle' });
    expect(card).toHaveTextContent('3e');
    expect(card).toHaveTextContent('À retenir');
    expect(card).toHaveTextContent('Dans RéseauLab.');
    // Un lien dans le texte mène à une autre fiche.
    const [link] = within(card).getAllByRole('button', { name: 'masque' });
    expect(link).toBeDefined();
    if (link) fireEvent.click(link);
    expect(within(help).getByRole('article', { name: 'Masque et « même réseau »' })).toBeInTheDocument();
    fireEvent.click(within(help).getByRole('button', { name: '← Retour' }));
    expect(within(help).getByRole('article', { name: 'Passerelle' })).toBeInTheDocument();
    fireEvent.click(within(help).getByRole('button', { name: '← Retour' }));
    expect(within(help).getByRole('article', { name: 'Construire un réseau' })).toBeInTheDocument();
    expect(within(help).getByRole('button', { name: '← Retour' })).toBeDisabled();
  });

  test('« À retenir » vient juste après la définition ; « Fiche suivante » suit l’ordre de la liste', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Aide' }));
    const help = screen.getByRole('dialog', { name: 'Aide et connaissances' });
    const index = within(help).getByRole('navigation', { name: 'Fiches' });
    fireEvent.click(within(index).getByRole('button', { name: 'Adresse IP' }));
    const card = within(help).getByRole('article', { name: 'Adresse IP' });
    const remember = within(card).getByRole('region', { name: 'À retenir' });
    const explanation = within(card).getByText(/Pour envoyer un message, il faut savoir à qui/);
    expect(remember.compareDocumentPosition(explanation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Le niveau de chaque notion se lit dans la liste, sans changer le nom du bouton.
    expect(within(index).getByRole('button', { name: 'Adresse IP' })).toHaveTextContent('4e');

    fireEvent.click(within(help).getByRole('button', { name: 'Fiche suivante →' }));
    expect(within(help).getByRole('article', { name: 'Masque et « même réseau »' })).toBeInTheDocument();
    fireEvent.click(within(help).getByRole('button', { name: '← Retour' }));
    expect(within(help).getByRole('article', { name: 'Adresse IP' })).toBeInTheDocument();
    // La dernière fiche n’a pas de suivante.
    const items = within(index)
      .getAllByRole('button')
      .filter((b) => b.closest('li'));
    const last = items.at(-1);
    if (last) fireEvent.click(last);
    expect(within(help).queryByRole('button', { name: 'Fiche suivante →' })).not.toBeInTheDocument();
  });

  test('F1 ouvre l’aide selon le contexte ; la fiche lue et le retour survivent à la fermeture', () => {
    const { session } = setup();
    fireEvent.keyDown(window, { key: 'F1' });
    const help = () => screen.getByRole('dialog', { name: 'Aide et connaissances' });
    expect(within(help()).getByRole('article', { name: 'Construire un réseau' })).toBeInTheDocument();
    fireEvent.click(within(help()).getByRole('button', { name: 'Adresse IP' }));
    fireEvent.click(within(help()).getByRole('button', { name: /Fermer/ }));

    // Rouverte : la dernière fiche lue.
    fireEvent.click(screen.getByRole('button', { name: 'Aide' }));
    expect(within(help()).getByRole('article', { name: 'Adresse IP' })).toBeInTheDocument();
    fireEvent.click(within(help()).getByRole('button', { name: /Fermer/ }));

    // Un routeur sélectionné : sa fiche, et « Retour » ramène à la lecture en cours.
    act(() => {
      session.addDevice('router');
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nom' }), { key: 'F1' });
    expect(within(help()).getByRole('article', { name: 'Routeur' })).toBeInTheDocument();
    fireEvent.click(within(help()).getByRole('button', { name: '← Retour' }));
    expect(within(help()).getByRole('article', { name: 'Adresse IP' })).toBeInTheDocument();
    fireEvent.click(within(help()).getByRole('button', { name: '← Retour' }));
    expect(within(help()).getByRole('article', { name: 'Construire un réseau' })).toBeInTheDocument();
  });

  test('« Qu’est-ce que c’est ? » au clic droit d’un équipement, sur le plan et dans la palette', () => {
    const { session } = setup();
    act(() => {
      session.addDevice('switch');
    });
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Switch 1/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Qu’est-ce que c’est ?' }));
    const help = screen.getByRole('dialog', { name: 'Aide et connaissances' });
    expect(within(help).getByRole('article', { name: 'Switch (commutateur)' })).toBeInTheDocument();

    const palette = screen.getByRole('complementary', { name: 'Palette d’équipements' });
    fireEvent.contextMenu(within(palette).getByRole('button', { name: /Imprimante/ }));
    expect(screen.getByRole('menu', { name: 'Imprimante' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Qu’est-ce que c’est ?' }));
    expect(within(help).getByRole('article', { name: 'Terminal' })).toBeInTheDocument();
    fireEvent.contextMenu(within(palette).getByRole('button', { name: /Routeur/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ajouter au plan' }));
    expect(session.network.devices.map((d) => d.kind)).toEqual(['switch', 'router']);
  });

  test('recherche sans accents, filtre par niveau et lexique', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Aide' }));
    const help = screen.getByRole('dialog', { name: 'Aide et connaissances' });
    const index = within(help).getByRole('navigation', { name: 'Fiches' });
    const search = within(index).getByRole('searchbox', { name: 'Chercher une notion' });
    fireEvent.change(search, { target: { value: 'reseau' } });
    expect(within(index).getAllByRole('listitem')[0]).toHaveTextContent('Réseau informatique');
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(index).toHaveTextContent('Aucune fiche ne correspond.');
    fireEvent.change(search, { target: { value: '' } });

    expect(within(index).getByRole('button', { name: 'Routeur' })).toBeInTheDocument();
    fireEvent.change(within(index).getByRole('combobox', { name: 'Niveau' }), { target: { value: '4e' } });
    expect(within(index).queryByRole('button', { name: 'Routeur' })).not.toBeInTheDocument();
    expect(within(index).getByRole('button', { name: 'Adresse IP' })).toBeInTheDocument();
    // La prise en main reste proposée à tous les niveaux.
    expect(within(index).getByRole('button', { name: 'Lancer la simulation' })).toBeInTheDocument();

    fireEvent.click(within(index).getByRole('button', { name: 'Lexique' }));
    expect(within(index).getByRole('heading', { name: 'C' })).toBeInTheDocument();
    fireEvent.click(within(index).getByRole('button', { name: /^commutateur/ }));
    expect(within(help).getByRole('article', { name: 'Switch (commutateur)' })).toBeInTheDocument();

    // Un mot du texte seulement : la fiche, avec le passage où il se trouve.
    fireEvent.change(within(index).getByRole('combobox', { name: 'Niveau' }), { target: { value: 'all' } });
    fireEvent.change(search, { target: { value: 'colis' } });
    const [hit] = within(index).getAllByRole('listitem');
    expect(hit).toHaveTextContent(/Les couches : qui fait quoi.*comme un colis/);
    expect(hit?.querySelector('mark')).toHaveTextContent('colis');
  });

  test('le « ? » d’un champ donne la définition et mène à la fiche, sans changer le nom du champ', () => {
    setup();
    const palette = screen.getByRole('complementary', { name: 'Palette d’équipements' });
    fireEvent.click(within(palette).getByRole('button', { name: /Ordinateur/ }));
    // Le champ garde son nom : « Passerelle ».
    expect(screen.getByRole('textbox', { name: 'Passerelle' })).toBeInTheDocument();
    const help = screen.getByRole('button', { name: 'Qu’est-ce que : Passerelle ?' });
    expect(help).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(help);
    const bubble = screen.getByRole('note');
    expect(bubble).toHaveTextContent('La passerelle est l’adresse du routeur');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    fireEvent.click(help);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    fireEvent.click(help);
    fireEvent.click(within(screen.getByRole('note')).getByRole('button', { name: 'En savoir plus' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Aide et connaissances' });
    expect(within(dialog).getByRole('article', { name: 'Passerelle' })).toBeInTheDocument();

    // Demander une autre fiche l'ouvre dans la même fenêtre.
    fireEvent.click(screen.getByRole('button', { name: 'Qu’est-ce que : Masque ?' }));
    fireEvent.click(within(screen.getByRole('note')).getByRole('button', { name: 'En savoir plus' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(within(dialog).getByRole('article', { name: 'Masque et « même réseau »' })).toBeInTheDocument();
  });

  test('un constat du diagnostic renvoie à sa fiche', () => {
    const { session } = setup();
    act(() => {
      session.addDevice('switch');
      session.addDevice('computer');
      session.openWindow({ type: 'diagnose' });
    });
    const check = screen.getByRole('dialog', { name: 'Vérifier mon réseau' });
    fireEvent.click(within(check).getByRole('button', { name: 'Fiche : Adresse IP' }));
    const help = screen.getByRole('dialog', { name: 'Aide et connaissances' });
    expect(within(help).getByRole('article', { name: 'Adresse IP' })).toBeInTheDocument();
  });

  test('le pack de l’enseignant, gardé dans le navigateur, complète et reformule le contenu', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      PACK_KEY,
      serializePack({
        notions: [
          {
            id: 'passerelle',
            title: 'Passerelle (porte de sortie)',
            aliases: [],
            level: '4e',
            category: 'adressage',
            short: 'La porte de sortie du réseau.',
            body: 'Texte de l’enseignant, avec un lien vers une fiche masquée : [[box]].',
            remember: [],
            related: ['box', 'routeur'],
            curriculum: 'Référence choisie par l’enseignant',
          },
        ],
        hidden: ['box'],
        messages: { 'ip-missing': { title: '{device} : adresse à compléter' } },
      }),
    );
    const session = new Session(storage, new ManualFrames());
    render(<App session={session} />);
    act(() => {
      session.addDevice('computer');
      session.openKnowledge('passerelle');
    });
    const card = screen.getByRole('article', { name: 'Passerelle (porte de sortie)' });
    expect(card).toHaveTextContent('4e');
    expect(card).toHaveTextContent('Programme : Référence choisie par l’enseignant');
    // La fiche masquée n'est plus proposée, ni en lien ni dans « Voir aussi ».
    expect(within(card).queryByRole('button', { name: 'box' })).not.toBeInTheDocument();
    expect(card).toHaveTextContent('Voir aussi : Routeur');
    const knowledge = screen.getByRole('dialog', { name: 'Aide et connaissances' });
    expect(within(knowledge).queryByRole('button', { name: 'Box Internet' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Points à vérifier' })).toHaveTextContent(
      'Ordinateur 1 : adresse à compléter',
    );

    // Un pack illisible est ignoré : le contenu par défaut reste disponible.
    storage.setItem(PACK_KEY, '{cassé');
    expect(new Session(storage).notion('box')?.title).toBe('Box Internet');
  });
});

describe('Profils par niveau', () => {
  function withLevel(level: '5e' | '4e' | '3e') {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify({ base: level }));
    const frames = new ManualFrames();
    const session = new Session(storage, frames);
    render(<App session={session} />);
    return { session, frames, storage };
  }

  test('le niveau se choisit dans les réglages et reste mémorisé sur le poste', () => {
    const storage = new MemoryStorage();
    const session = new Session(storage, new ManualFrames());
    render(<App session={session} />);
    const palette = screen.getByRole('complementary', { name: 'Palette d’équipements' });
    expect(within(palette).getByRole('button', { name: /Routeur/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    const settings = screen.getByRole('dialog', { name: 'Réglages' });
    expect(within(settings).getByRole('radio', { name: /^Complet/ })).toBeChecked();
    expect(settings).toHaveTextContent('Rien : tout est proposé.');
    fireEvent.click(within(settings).getByRole('radio', { name: /^4e/ }));
    expect(within(palette).queryByRole('button', { name: /Routeur/ })).not.toBeInTheDocument();
    const hidden = within(settings).getByRole('region', { name: 'Ce qui est masqué' });
    expect(hidden).toHaveTextContent('Équipements : Routeur.');
    expect(hidden).toHaveTextContent('Commandes : traceroute, arp, route, netstat, nslookup.');
    expect(hidden).toHaveTextContent('passerelle');
    expect(storage.getItem(PROFILE_KEY)).toBe('{"base":"4e"}');
    expect(new Session(storage).profile).toEqual({ base: '4e' });
  });

  test('en 4e : ni passerelle ni DNS à régler, ni constat à leur sujet', () => {
    const { session } = withLevel('4e');
    act(() => {
      session.addDevice('switch');
      session.addDevice('computer');
    });
    expect(screen.getByRole('textbox', { name: 'Adresse IP' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Configuration automatique (DHCP)' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Passerelle' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Serveur DNS' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Qu’est-ce que : Adresse IP ?' })).toBeInTheDocument();
  });

  test('ce qui est déjà utilisé reste visible au-delà du niveau', () => {
    const { session } = withLevel('4e');
    let host = '';
    let router = '';
    act(() => {
      router = session.addDevice('router');
      host = session.addDevice('computer');
      session.network.host(host).updateConfig({ ip: ip('10.0.0.2'), mask: MASK_24, gateway: ip('10.0.0.1') });
      session.network.router(router).setInterface(0, { ip: ip('10.0.0.1'), mask: MASK_24 });
      session.network.connect(host, router);
      session.select({ kind: 'device', id: host });
    });
    // La passerelle est renseignée : le champ reste, mais sans son aide de niveau 3e.
    expect(screen.getByRole('textbox', { name: 'Passerelle' })).toHaveValue('10.0.0.1');
    expect(screen.queryByRole('button', { name: 'Qu’est-ce que : Passerelle ?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Serveur DNS' })).not.toBeInTheDocument();
    // Le routeur posé par l'enseignant fonctionne ; ses onglets avancés sont masqués.
    act(() => {
      session.select({ kind: 'device', id: router });
    });
    expect(screen.getByRole('tab', { name: 'Interfaces' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Routage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Pare-feu' })).not.toBeInTheDocument();
    act(() => {
      session.network.router(router).firewall.setEnabled(true);
      session.touch();
    });
    expect(screen.getByRole('tab', { name: 'Pare-feu' })).toBeInTheDocument();
  });

  test('en 4e : logiciels et commandes du niveau seulement', () => {
    const { session, frames } = withLevel('4e');
    let a = '';
    act(() => {
      a = session.addDevice('computer');
      session.network.host(a).install('mailclient');
      session.setMode('simulation');
      session.openWindow({ type: 'app', deviceId: a, app: 'software' });
    });
    const installer = screen.getByRole('dialog', { name: 'Installer des logiciels — Ordinateur 1' });
    expect(installer).toHaveTextContent('Serveur DHCP');
    expect(installer).not.toHaveTextContent('Serveur DNS');
    // Déjà installée par l'enseignant : la messagerie reste listée.
    expect(installer).toHaveTextContent('Messagerie');

    act(() => {
      session.closeAllWindows();
      session.select({ kind: 'device', id: a });
      session.openWindow({ type: 'app', deviceId: a, app: 'terminal' });
    });
    const terminal = screen.getByRole('dialog', { name: 'Ligne de commande — Ordinateur 1' });
    const input = within(terminal).getByRole('textbox', { name: 'Commande' });
    fireEvent.change(input, { target: { value: 'traceroute 10.0.0.1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    elapse(frames, 100);
    expect(within(terminal).getByRole('log')).toHaveTextContent('Commande inconnue : traceroute');
    fireEvent.change(input, { target: { value: 'help' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(within(terminal).getByRole('log')).toHaveTextContent('ping');
    expect(screen.getByRole('button', { name: 'Afficher les échanges de données' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Afficher les tables' })).not.toBeInTheDocument();
  });

  test('en 5e : pas de ligne de commande à installer, pas d’échanges de données, fiches du niveau', () => {
    const { session } = withLevel('5e');
    let a = '';
    act(() => {
      a = session.addDevice('computer');
      session.setMode('simulation');
      session.select({ kind: 'device', id: a });
    });
    expect(
      screen.queryByRole('button', { name: 'Afficher les échanges de données' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le bureau' }));
    const desktop = screen.getByRole('dialog', { name: 'Bureau de Ordinateur 1' });
    expect(within(desktop).queryByRole('button', { name: 'Échanges de données' })).not.toBeInTheDocument();
    // La ligne de commande, installée d'origine, reste sur le bureau.
    expect(within(desktop).getByRole('button', { name: 'Ligne de commande' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aide' }));
    const help = screen.getByRole('dialog', { name: 'Aide et connaissances' });
    const index = within(help).getByRole('navigation', { name: 'Fiches' });
    expect(within(index).getByRole('combobox', { name: 'Niveau' })).toHaveValue('5e');
    expect(within(index).getByRole('button', { name: 'Switch (commutateur)' })).toBeInTheDocument();
    expect(within(index).queryByRole('button', { name: 'Adresse IP' })).not.toBeInTheDocument();
  });
});

describe('Terminaux variés', () => {
  test('la palette propose serveur, imprimante, objet connecté, smartphone et tablette', () => {
    const { session } = setup();
    const palette = screen.getByRole('complementary', { name: 'Palette d’équipements' });
    for (const name of ['Serveur', 'Imprimante', 'Objet connecté', 'Smartphone', 'Tablette']) {
      expect(within(palette).getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(within(palette).getByRole('button', { name: 'Objet connecté' }));
    fireEvent.click(within(palette).getByRole('button', { name: 'Smartphone' }));
    expect(session.network.devices.map((d) => d.kind)).toEqual(['object', 'smartphone']);
    expect(screen.getByRole('button', { name: 'Objet connecté 1 (sans adresse)' })).toBeInTheDocument();
    // Le smartphone est en Wi-Fi : son panneau propose de choisir un réseau sans fil.
    expect(screen.getByRole('radio', { name: 'Sans fil (Wi-Fi)' })).toBeChecked();
  });

  test('l’objet connecté n’est proposé qu’à partir de la 4e', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify({ base: '5e' }));
    render(<App session={new Session(storage, new ManualFrames())} />);
    const palette = screen.getByRole('complementary', { name: 'Palette d’équipements' });
    expect(within(palette).getByRole('button', { name: 'Imprimante' })).toBeInTheDocument();
    expect(within(palette).queryByRole('button', { name: 'Objet connecté' })).not.toBeInTheDocument();
  });
});

describe('Box Internet', () => {
  test('se pose depuis la palette, déjà réglée comme à la maison', () => {
    const { session } = setup();
    const palette = screen.getByRole('complementary', { name: 'Palette d’équipements' });
    fireEvent.click(within(palette).getByRole('button', { name: 'Box Internet' }));
    expect(screen.getByRole('button', { name: 'Box 1 (192.168.1.1)' })).toBeInTheDocument();
    const box = session.network.box(session.network.devices[0]?.id ?? '');
    expect(screen.getByRole('textbox', { name: 'Nom Wi-Fi (SSID)' })).toHaveValue('Box-1');
    expect(screen.getByRole('textbox', { name: 'Adresse IP de la box' })).toHaveValue('192.168.1.1');
    expect(screen.getByRole('checkbox', { name: 'Distribuer les adresses (serveur DHCP)' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Première adresse distribuée' })).toHaveValue('192.168.1.10');
    expect(screen.getByText('Prise Internet : non reliée.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Points à vérifier' })).not.toBeInTheDocument();

    // Changer l'adresse de la box déplace la plage distribuée avec elle.
    commit('Adresse IP de la box', '192.168.50.1');
    expect(screen.getByRole('textbox', { name: 'Première adresse distribuée' })).toHaveValue('192.168.50.10');
    expect(screen.getByRole('button', { name: 'Box 1 (192.168.50.1)' })).toBeInTheDocument();
    // Une plage choisie hors du réseau est signalée.
    commit('Dernière adresse distribuée', '10.0.0.9');
    expect(screen.getByRole('list', { name: 'Points à vérifier' })).toHaveTextContent(
      'Box 1 distribue des adresses (192.168.50.10 à 10.0.0.9) qui ne sont pas dans son réseau',
    );
    commit('Dernière adresse distribuée', '192.168.50.50');

    commit('Nom Wi-Fi (SSID)', 'Maison');
    expect(box.ssid).toBe('Maison');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Distribuer les adresses (serveur DHCP)' }));
    expect(box.dhcp.active).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Première adresse distribuée' })).toBeDisabled();

    commit('Adresse IP côté Internet', '10.0.0.2');
    expect(screen.getByRole('textbox', { name: 'Masque côté Internet' })).toHaveValue('255.255.255.0');
    commit('Passerelle vers Internet', '10.0.0.1');
    expect(box.gateway).toBe(ip('10.0.0.1'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Routage automatique (RIP)' }));
    expect(box.rip).toBe(true);
  });

  test('un routeur se branche sur sa prise Internet, un terminal côté maison', () => {
    const { session } = setup();
    let box = '';
    act(() => {
      box = session.addDevice('box');
      const router = session.addDevice('router');
      const pc = session.addDevice('computer');
      session.network.connect(box, router);
      const cable = session.network.connect(pc, box);
      session.select({ kind: 'cable', id: cable.id });
    });
    expect(screen.getByText(/Relie/)).toHaveTextContent('Relie Ordinateur 1 (port 0) à Box 1 (prise 1)');
    // Sur le plan, la prise Internet est nommée au bout du câble, comme les interfaces du routeur.
    const plan = screen.getByRole('application');
    expect([...plan.querySelectorAll('.port-label')].map((l) => l.textContent)).toEqual(['Internet', 'eth0']);
    act(() => {
      session.select({ kind: 'device', id: box });
    });
    expect(screen.getByText('Prise Internet : reliée à « Routeur 1 ».')).toBeInTheDocument();
    expect(screen.getByText('1 terminal(aux) relié(s) côté maison, dont 0 en Wi-Fi.')).toBeInTheDocument();
  });

  test('un smartphone rejoint son Wi-Fi et reçoit une adresse en simulation', () => {
    const { session, frames } = setup();
    let box = '';
    let phone = '';
    act(() => {
      box = session.addDevice('box');
      phone = session.addDevice('smartphone');
      session.network.host(phone).updateConfig({ useDhcp: true });
      session.select({ kind: 'device', id: phone });
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Réseau sans fil (SSID)' }), {
      target: { value: 'Box-1' },
    });
    expect(screen.getByText('Connecté au réseau « Box-1 » (box « Box 1 »).')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Points à vérifier' })).not.toBeInTheDocument();
    act(() => {
      session.setMode('simulation');
    });
    elapse(frames, 20_000);
    expect(screen.getByRole('button', { name: 'Smartphone 1 (192.168.1.10)' })).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole('button', { name: /^Box 1/ }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Afficher les tables de la box',
      'Afficher les échanges de données (Internet – sans adresse)',
      'Afficher les échanges de données (Maison – 192.168.1.1)',
      'Qu’est-ce que c’est ?',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Afficher les tables de la box' }));
    const tables = screen.getByRole('dialog', { name: 'Box — Box 1' });
    const mac = session.network.host(phone).mac;
    expect(within(tables).getByText('Adresses distribuées (DHCP)')).toBeInTheDocument();
    expect(within(tables).getAllByText(mac)).toHaveLength(2);
    expect(within(tables).getByText('attribuée')).toBeInTheDocument();
    expect(within(tables).getByText(/Le switch de la box apprend/)).toBeInTheDocument();
    // Les routes : son réseau de la maison, relié directement.
    expect(within(tables).getAllByText('Maison').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Afficher les échanges de données' }));
    const capture = screen.getByRole('dialog', { name: 'Échanges de données — Box 1' });
    const options = within(capture).getByRole('combobox', { name: 'Interface' }).querySelectorAll('option');
    expect([...options].map((o) => o.textContent)).toEqual(['Toutes les interfaces', 'Internet', 'Maison']);
    expect(session.network.box(box).dhcp.leases).toHaveLength(1);
  });

  test('en 5e, la box est proposée sans ses réglages de DHCP ni son côté Internet', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify({ base: '5e' }));
    const session = new Session(storage, new ManualFrames());
    render(<App session={session} />);
    const palette = screen.getByRole('complementary', { name: 'Palette d’équipements' });
    fireEvent.click(within(palette).getByRole('button', { name: 'Box Internet' }));
    expect(screen.getByRole('textbox', { name: 'Adresse IP de la box' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nom Wi-Fi (SSID)' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /serveur DHCP/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Passerelle vers Internet' })).not.toBeInTheDocument();
    // Un côté Internet déjà utilisé reste visible.
    act(() => {
      session.network.connect(session.network.devices[0]?.id ?? '', session.network.addRouter().id);
    });
    expect(screen.getByRole('textbox', { name: 'Passerelle vers Internet' })).toBeInTheDocument();
    act(() => {
      session.setMode('simulation');
    });
    expect(screen.queryByRole('button', { name: 'Afficher les tables de la box' })).not.toBeInTheDocument();
  });

  test('en 4e, ses tables montrent les adresses distribuées, pas encore le routage', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify({ base: '4e' }));
    const session = new Session(storage, new ManualFrames());
    render(<App session={session} />);
    act(() => {
      session.addDevice('box');
      session.setMode('simulation');
    });
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Box 1/ }));
    expect(screen.getByRole('menuitem', { name: 'Afficher les tables de la box' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les tables de la box' }));
    const tables = screen.getByRole('dialog', { name: 'Box — Box 1' });
    expect(within(tables).getByText('Aucune adresse distribuée pour l’instant.')).toBeInTheDocument();
    expect(within(tables).queryByText('Table de routage')).not.toBeInTheDocument();
    act(() => {
      session.network.box(session.network.devices[0]?.id ?? '').dhcp.setActive(false);
    });
    expect(within(tables).getByText('Le serveur DHCP de la box est arrêté.')).toBeInTheDocument();
  });
});

describe('Activités guidées', () => {
  function startFirst() {
    const context = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Activités' }));
    const list = screen.getByRole('dialog', { name: 'Activités' });
    expect(list).toHaveTextContent('Dépannage : le site du collège ne s’affiche plus');
    fireEvent.click(within(list).getByRole('button', { name: 'Commencer : Mon premier réseau' }));
    return context;
  }

  test('choisir une activité ouvre son panneau, à côté du plan', () => {
    startFirst();
    expect(screen.queryByRole('dialog', { name: 'Activités' })).not.toBeInTheDocument();
    const panel = screen.getByRole('complementary', { name: 'Activité' });
    expect(within(panel).getByRole('heading', { name: 'Mon premier réseau' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('0 objectif sur 9');
    expect(panel).toHaveTextContent('Deux ordinateurs doivent pouvoir échanger des fichiers.');
    // Seule l'étape en cours est dépliée.
    expect(within(panel).getByRole('button', { name: /Poser les équipements/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(panel).getByRole('button', { name: /Relier les ordinateurs/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    // L'activité est de niveau 4e : le routeur n'est pas proposé.
    const palette = screen.getByRole('complementary', { name: 'Palette d’équipements' });
    expect(within(palette).queryByRole('button', { name: 'Routeur' })).not.toBeInTheDocument();
  });

  test('les objectifs se cochent seuls et l’étape suivante s’ouvre', () => {
    startFirst();
    const panel = screen.getByRole('complementary', { name: 'Activité' });
    const palette = screen.getByRole('complementary', { name: 'Palette d’équipements' });
    fireEvent.click(within(palette).getByRole('button', { name: 'Ordinateur' }));
    const objectives = within(panel).getByRole('list', { name: 'Objectifs : Poser les équipements' });
    expect(within(objectives).getAllByRole('listitem')[0]).toHaveTextContent(
      'À faire : Il y a deux ordinateurs sur le plan 1 sur 2.',
    );
    fireEvent.click(within(palette).getByRole('button', { name: 'Ordinateur' }));
    expect(within(objectives).getAllByRole('listitem')[0]).toHaveTextContent(
      'Atteint : Il y a deux ordinateurs',
    );
    expect(panel).toHaveTextContent('1 objectif sur 9');
    fireEvent.click(within(palette).getByRole('button', { name: 'Switch' }));
    expect(panel).toHaveTextContent('2 objectifs sur 9');
    // L'étape terminée se replie, la suivante s'ouvre.
    expect(within(panel).getByRole('button', { name: /Poser les équipements/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(
      within(panel).getByRole('list', { name: 'Objectifs : Relier les ordinateurs au switch' }),
    ).toBeInTheDocument();
  });

  test('indices donnés un par un, fiches liées, panneau repliable, sortie de l’activité', () => {
    const { session } = startFirst();
    const panel = screen.getByRole('complementary', { name: 'Activité' });
    fireEvent.click(within(panel).getByRole('button', { name: /Relier les ordinateurs/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Un indice (0/2)' }));
    expect(panel).toHaveTextContent('Indice 1. L’outil Câble est dans la palette');
    fireEvent.click(within(panel).getByRole('button', { name: 'Un autre indice (1/2)' }));
    expect(panel).toHaveTextContent('Indice 2.');
    // Tous les indices de cette étape sont donnés : plus de bouton pour en demander un autre.
    expect(within(panel).queryByRole('button', { name: /Un autre indice/ })).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Fiche : Topologie d’un réseau' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Aide et connaissances' })).getByRole('article', {
        name: 'Topologie d’un réseau',
      }),
    ).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Réduire l’activité' }));
    const folded = screen.getByRole('complementary', { name: 'Activité' });
    expect(folded).toHaveTextContent('Activité (0/9)');
    fireEvent.click(within(folded).getByRole('button'));
    fireEvent.click(
      within(screen.getByRole('complementary', { name: 'Activité' })).getByRole('button', {
        name: 'Quitter l’activité',
      }),
    );
    expect(screen.queryByRole('complementary', { name: 'Activité' })).not.toBeInTheDocument();
    expect(session.activity).toBeNull();
  });

  test('commencer une activité demande confirmation quand un réseau est en cours', () => {
    const { session } = setup();
    act(() => {
      session.addDevice('router');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Activités' }));
    fireEvent.click(screen.getByRole('button', { name: 'Commencer : Relier deux réseaux' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Remplacer le réseau ?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Annuler' }));
    expect(session.activity).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Commencer : Relier deux réseaux' }));
    fireEvent.click(screen.getByRole('button', { name: 'Commencer l’activité' }));
    expect(session.activity?.id).toBe('deux-reseaux');
    expect(session.network.devices).toHaveLength(6);
  });

  test('« Vérifier mon travail » valide une communication ; la fin de l’activité est annoncée', () => {
    const { session } = setup();
    const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === 'premier-reseau');
    act(() => {
      if (builtin) session.startActivity(builtin);
      const a = session.addDevice('computer');
      const b = session.addDevice('computer');
      const sw = session.addDevice('switch');
      session.network.host(a).updateConfig({ ip: ip('192.168.1.1'), mask: MASK_24 });
      session.network.host(b).updateConfig({ ip: ip('192.168.1.2'), mask: MASK_24 });
      session.network.connect(a, sw);
      session.network.connect(b, sw);
      session.setMode('simulation');
      session.recordCommand(a, 'ping');
    });
    const panel = screen.getByRole('complementary', { name: 'Activité' });
    expect(panel).toHaveTextContent('8 objectifs sur 9');
    expect(panel).toHaveTextContent('Se vérifie avec le bouton « Vérifier mon travail ».');
    fireEvent.click(within(panel).getByRole('button', { name: 'Vérifier mon travail' }));
    expect(panel).toHaveTextContent('9 objectifs sur 9');
    expect(panel).toHaveTextContent('Tous les objectifs sont atteints. Bravo !');
  });

  test('une commande tapée dans la ligne de commande compte pour l’objectif', () => {
    const { session, frames } = setup();
    const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === 'depannage');
    let poste = '';
    act(() => {
      if (builtin) session.startActivity(builtin);
      poste = session.network.devices.find((d) => d.name === 'Poste 1')?.id ?? '';
      session.setMode('simulation');
      session.openWindow({ type: 'app', deviceId: poste, app: 'terminal' });
    });
    const input = screen.getByRole('textbox', { name: 'Commande' });
    fireEvent.change(input, { target: { value: 'ping -n 1 192.168.1.2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    elapse(frames, 200);
    expect(session.work.commands).toEqual([`${poste}:ping`]);
    expect(screen.getByRole('complementary', { name: 'Activité' })).toHaveTextContent('2 objectifs sur 6');
  });
});

describe('Compte rendu', () => {
  test('nom, classe et conclusion s’écrivent dans le compte rendu, avec le plan et la table d’adressage', () => {
    const { session } = setup();
    act(() => {
      const a = session.addDevice('computer');
      const sw = session.addDevice('switch');
      session.network.host(a).updateConfig({ ip: ip('192.168.1.10'), mask: MASK_24 });
      session.network.connect(a, sw);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Compte rendu' }));
    const dialog = screen.getByRole('dialog', { name: 'Compte rendu' });
    const preview = within(dialog).getByLabelText('Aperçu du compte rendu');
    expect(within(preview).getByRole('heading', { name: 'Compte rendu de réseau' })).toBeInTheDocument();
    expect(within(preview).getByRole('img', { name: 'Plan du réseau' })).toBeInTheDocument();
    const row = within(preview).getByRole('row', { name: /^Ordinateur 1/ });
    expect(row).toHaveTextContent('Ordinateur 1OrdinateurSwitch 1192.168.1.10255.255.255.0');
    // Sans activité : pas de liste d'objectifs.
    expect(within(preview).queryByRole('heading', { name: /Objectifs/ })).not.toBeInTheDocument();
    expect(within(preview).getByLabelText('À compléter')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nom et prénom' }), {
      target: { value: 'Camille Dupont' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Classe' }), { target: { value: '4e B' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Ce que j’ai appris/ }), {
      target: { value: 'Le switch relie les postes.' },
    });
    expect(preview).toHaveTextContent('NomCamille Dupont');
    expect(preview).toHaveTextContent('Classe4e B');
    expect(preview).toHaveTextContent('Le switch relie les postes.');
    expect(session.work.student).toEqual({ name: 'Camille Dupont', className: '4e B' });
  });

  test('pour une activité : objectifs atteints ou non, indices et commandes ; l’impression est lancée', () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    try {
      const { session } = setup();
      const builtin = BUILTIN_ACTIVITIES.find((a) => a.id === 'premier-reseau');
      act(() => {
        if (builtin) session.startActivity(builtin);
        const a = session.addDevice('computer');
        session.addDevice('computer');
        session.addDevice('switch');
        session.revealHint('relier');
        session.setMode('simulation');
        session.recordCommand(a, 'ping');
        session.openWindow({ type: 'report' });
      });
      const preview = within(screen.getByRole('dialog', { name: 'Compte rendu' })).getByLabelText(
        'Aperçu du compte rendu',
      );
      expect(within(preview).getByRole('heading', { name: 'Mon premier réseau' })).toBeInTheDocument();
      expect(
        within(preview).getByRole('heading', { name: 'Objectifs de l’activité : 2 sur 9' }),
      ).toBeInTheDocument();
      expect(preview).toHaveTextContent('Atteint : Il y a deux ordinateurs sur le plan');
      expect(preview).toHaveTextContent('Non atteint : Ordinateur 1 est relié au switch');
      expect(preview).toHaveTextContent('Indices demandés : 1.');
      expect(preview).toHaveTextContent('Commandes utilisées : ping (Ordinateur 1).');
      // La copie imprimée est hors de la fenêtre, seule sur la page.
      expect(document.querySelector('body > .print-root .report')).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Imprimer ou enregistrer en PDF' }));
      expect(print).toHaveBeenCalledTimes(1);
      act(() => {
        session.closeAllWindows();
      });
      expect(document.querySelector('.print-root')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Quiz', () => {
  /** Answers the question on screen, rightly or not, and returns to the next one. */
  function answer(quiz: HTMLElement, right: boolean) {
    const prompt = quiz.querySelector('.quiz-prompt')?.textContent ?? '';
    if (prompt.startsWith('De combien de nombres')) {
      fireEvent.change(within(quiz).getByRole('textbox'), { target: { value: right ? ' Quatre ' : 'six' } });
    } else if (prompt.startsWith('Laquelle de ces écritures')) {
      fireEvent.click(within(quiz).getByRole('radio', { name: right ? '192.168.1.25' : '192.168.1.300' }));
    } else {
      fireEvent.click(
        within(quiz).getByRole('radio', {
          name: right ? /^Non : une adresse doit être unique/ : 'Oui, s’ils sont de la même marque',
        }),
      );
    }
    fireEvent.click(within(quiz).getByRole('button', { name: 'Valider' }));
  }

  test('depuis une fiche : questions corrigées une à une, puis bilan qui renvoie à la fiche', () => {
    const { session } = setup();
    act(() => {
      session.openKnowledge('adresse-ip');
    });
    fireEvent.click(screen.getByRole('button', { name: 'S’entraîner sur cette notion' }));
    const quiz = screen.getByRole('dialog', { name: 'Quiz' });
    expect(within(quiz).getByRole('heading', { name: 'Quiz : Adresse IP' })).toBeInTheDocument();
    fireEvent.click(within(quiz).getByRole('button', { name: 'Commencer (3 questions)' }));

    expect(quiz).toHaveTextContent('Question 1 sur 3');
    expect(within(quiz).getByRole('button', { name: 'Valider' })).toBeDisabled();
    answer(quiz, true);
    expect(quiz).toHaveTextContent('✔ Bonne réponse !');
    expect(within(quiz).queryByRole('button', { name: 'Valider' })).not.toBeInTheDocument();
    fireEvent.click(within(quiz).getByRole('button', { name: 'Question suivante' }));

    expect(quiz).toHaveTextContent('Question 2 sur 3');
    answer(quiz, false);
    expect(quiz).toHaveTextContent('✘ Ce n’est pas ça.');
    expect(quiz).toHaveTextContent('Réponse attendue :');
    fireEvent.click(within(quiz).getByRole('button', { name: 'Question suivante' }));
    answer(quiz, true);
    fireEvent.click(within(quiz).getByRole('button', { name: 'Voir le bilan' }));

    expect(
      within(quiz).getByRole('heading', { name: 'Bilan : 2 bonnes réponses sur 3' }),
    ).toBeInTheDocument();
    const row = within(quiz).getByRole('row', { name: /Adresse IP/ });
    expect(row).toHaveTextContent('2 sur 3');
    expect(row).toHaveTextContent('en cours');
    expect(session.work.quizzes).toEqual([{ right: 2, total: 3 }]);
    fireEvent.click(within(row).getByRole('button', { name: 'Revoir la fiche' }));
    expect(
      within(screen.getByRole('dialog', { name: 'Aide et connaissances' })).getByRole('article', {
        name: 'Adresse IP',
      }),
    ).toBeInTheDocument();

    // On peut recommencer : nouveau tirage, nouveau score noté.
    fireEvent.click(within(quiz).getByRole('button', { name: 'Recommencer avec d’autres questions' }));
    expect(quiz).toHaveTextContent('Question 1 sur 3');
  });

  test('quiz général : au niveau de la classe, huit questions, choix multiples et listes à ordonner', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, JSON.stringify({ base: '5e' }));
    const session = new Session(storage, new ManualFrames());
    render(<App session={session} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quiz d’entraînement' }));
    const quiz = screen.getByRole('dialog', { name: 'Quiz' });
    expect(within(quiz).getByRole('combobox', { name: 'Questions' })).toHaveValue('5e');
    fireEvent.click(within(quiz).getByRole('button', { name: 'Commencer (8 questions)' }));
    // Répondre à tout en cochant le premier choix : le quiz va jusqu'au bilan.
    for (let i = 0; i < 8; i++) {
      const boxes = within(quiz).queryAllByRole('checkbox');
      const first = boxes[0] ?? within(quiz).getAllByRole('radio')[0];
      if (first) fireEvent.click(first);
      fireEvent.click(within(quiz).getByRole('button', { name: 'Valider' }));
      fireEvent.click(
        within(quiz).getByRole('button', { name: i === 7 ? 'Voir le bilan' : 'Question suivante' }),
      );
    }
    expect(
      within(quiz).getByRole('heading', { name: /^Bilan : \d bonnes? réponses? sur 8$/ }),
    ).toBeInTheDocument();
    expect(session.work.quizzes).toHaveLength(1);
  });

  test('une liste à remettre dans l’ordre se manipule avec les flèches', () => {
    const { session } = setup();
    act(() => {
      session.openQuiz('couches');
    });
    const quiz = screen.getByRole('dialog', { name: 'Quiz' });
    fireEvent.click(within(quiz).getByRole('button', { name: 'Commencer (1 question)' }));
    const wanted = ['Application', 'Transport', 'Réseau', 'Liaison'];
    const current = () =>
      within(quiz)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('span')?.textContent ?? '');
    expect(current()).not.toEqual(wanted);
    // Tri par sélection, comme le ferait un élève : amener chaque élément à sa place.
    wanted.forEach((entry, target) => {
      for (let position = current().indexOf(entry); position > target; position--) {
        fireEvent.click(within(quiz).getByRole('button', { name: `Monter : ${entry}` }));
      }
    });
    expect(current()).toEqual(wanted);
    fireEvent.click(within(quiz).getByRole('button', { name: 'Valider' }));
    expect(quiz).toHaveTextContent('✔ Bonne réponse !');
    fireEvent.click(within(quiz).getByRole('button', { name: 'Voir le bilan' }));
    expect(within(quiz).getByRole('row', { name: /Les couches/ })).toHaveTextContent('acquis');
  });

  test('les quiz faits figurent sur le compte rendu', () => {
    const { session } = setup();
    act(() => {
      session.recordQuiz(6, 8);
      session.recordQuiz(8, 8);
      session.openWindow({ type: 'report' });
    });
    expect(
      within(screen.getByRole('dialog', { name: 'Compte rendu' })).getByLabelText('Aperçu du compte rendu'),
    ).toHaveTextContent('2 quiz faits : 6 sur 8, 8 sur 8.');
  });
});

describe('Espace enseignant', () => {
  test('créer une activité : objectifs proposés depuis la solution, contrôle, fichier, essai', () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      const { session } = setup();
      act(() => {
        const a = session.addDevice('computer');
        const b = session.addDevice('computer');
        const sw = session.addDevice('switch');
        session.network.host(a).updateConfig({ ip: ip('10.0.0.1'), mask: MASK_24 });
        session.network.host(b).updateConfig({ ip: ip('10.0.0.2'), mask: MASK_24 });
        session.network.connect(a, sw);
        session.network.connect(b, sw);
      });
      fireEvent.click(screen.getByRole('button', { name: 'Réglages' }));
      fireEvent.click(
        within(screen.getByRole('dialog', { name: 'Réglages' })).getByRole('button', {
          name: 'Créer une activité',
        }),
      );
      const author = screen.getByRole('dialog', { name: 'Créer une activité' });

      // Sans titre, le contrôle dit ce qui manque.
      fireEvent.click(within(author).getByRole('button', { name: 'Contrôler l’activité' }));
      expect(within(author).getByRole('alert')).toHaveTextContent('Donnez un titre à l’activité.');
      fireEvent.change(within(author).getByRole('textbox', { name: 'Titre de l’activité' }), {
        target: { value: 'Adresser deux postes' },
      });
      fireEvent.change(within(author).getByRole('textbox', { name: 'Étape 1 : titre' }), {
        target: { value: 'Donner les adresses' },
      });
      fireEvent.change(within(author).getByRole('textbox', { name: 'Indices (un par ligne)' }), {
        target: { value: 'Même début d’adresse' },
      });
      fireEvent.change(within(author).getByRole('combobox', { name: 'Fiches à lire' }), {
        target: { value: 'adresse-ip' },
      });
      expect(within(author).getByRole('button', { name: 'Adresse IP ✕' })).toBeInTheDocument();

      fireEvent.click(within(author).getByRole('button', { name: 'Choisir parmi les objectifs proposés…' }));
      const proposals = within(author).getByRole('group', { name: 'Objectifs proposés pour l’étape 1' });
      fireEvent.click(
        within(proposals).getByRole('button', { name: '+ Ordinateur 1 a une adresse du réseau 10.0.0.0' }),
      );
      fireEvent.click(
        within(proposals).getByRole('button', { name: '+ Ordinateur 1 communique avec Ordinateur 2' }),
      );
      // Un objectif choisi n'est plus proposé ; sa phrase se reformule.
      expect(
        within(proposals).queryByRole('button', { name: '+ Ordinateur 1 a une adresse du réseau 10.0.0.0' }),
      ).not.toBeInTheDocument();
      fireEvent.change(within(author).getByRole('textbox', { name: 'Étape 1, objectif 2' }), {
        target: { value: 'Les deux postes communiquent' },
      });

      fireEvent.click(within(author).getByRole('button', { name: 'Contrôler l’activité' }));
      const verdict = within(author).getByRole('status');
      expect(verdict).toHaveTextContent('Votre réseau (la solution) atteint 2 des 2 objectifs');
      expect(verdict).toHaveTextContent('Au départ, aucun n’est déjà atteint');
      // Départ « tel quel » : tout serait déjà fait, et le contrôle le signale.
      fireEvent.click(within(author).getByRole('radio', { name: 'Le réseau tel qu’il est maintenant' }));
      fireEvent.click(within(author).getByRole('button', { name: 'Contrôler l’activité' }));
      expect(within(author).getByRole('status')).toHaveTextContent(
        'Déjà atteints sur le réseau de départ (rien à faire pour l’élève) : Ordinateur 1 a une adresse du réseau 10.0.0.0 ; Les deux postes communiquent.',
      );
      fireEvent.click(within(author).getByRole('radio', { name: 'Le même réseau, sans les adresses' }));

      fireEvent.click(within(author).getByRole('button', { name: 'Enregistrer le fichier d’activité' }));
      expect(click).toHaveBeenCalledTimes(1);
      expect(session.notice?.text).toContain('adresser-deux-postes.activite.reseaulab.json');

      // Le brouillon survit à la fermeture de la fenêtre.
      fireEvent.click(within(author).getByRole('button', { name: 'Fermer Créer une activité' }));
      act(() => {
        session.openWindow({ type: 'author' });
      });
      expect(screen.getByRole('textbox', { name: 'Titre de l’activité' })).toHaveValue(
        'Adresser deux postes',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Essayer comme un élève' }));
      const panel = screen.getByRole('complementary', { name: 'Activité' });
      expect(within(panel).getByRole('heading', { name: 'Adresser deux postes' })).toBeInTheDocument();
      expect(panel).toHaveTextContent('0 objectif sur 2');
      expect(screen.getByRole('button', { name: 'Ordinateur 1 (sans adresse)' })).toBeInTheDocument();
    } finally {
      click.mockRestore();
    }
  });

  test('importer un pack depuis les réglages, puis revenir au contenu d’origine', async () => {
    const { session } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    const settings = screen.getByRole('dialog', { name: 'Réglages' });
    const section = within(settings).getByRole('region', { name: 'Pack pédagogique' });
    expect(section).toHaveTextContent('Contenu d’origine, sans modification.');
    const text = serializePack({
      hidden: ['box'],
      messages: { 'ip-missing': { title: 'Adresse à compléter' } },
    });
    const file = Object.assign(new File([text], 'mon.pack.reseaulab.json'), {
      text: () => Promise.resolve(text),
    });
    fireEvent.change(within(settings).getByTestId('import-pack'), { target: { files: [file] } });
    expect(await within(section).findByText(/Pack installé sur ce poste : 0 fiche\(s\)/)).toBeInTheDocument();
    expect(section).toHaveTextContent('1 message(s) modifiés, 1 élément(s) masqué(s)');
    expect(session.notion('box')).toBeUndefined();

    const bad = Object.assign(new File(['{'], 'x.json'), { text: () => Promise.resolve('{') });
    fireEvent.change(within(settings).getByTestId('import-pack'), { target: { files: [bad] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('JSON illisible');
    // Un fichier refusé ne remplace pas le pack en place.
    expect(session.notion('box')).toBeUndefined();

    fireEvent.click(within(section).getByRole('button', { name: 'Revenir au contenu d’origine' }));
    expect(section).toHaveTextContent('Contenu d’origine, sans modification.');
    expect(session.notion('box')).toBeDefined();
  });
});
