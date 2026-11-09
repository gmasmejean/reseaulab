// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MASK_24, ip } from '../engine/testing';
import { ManualFrames } from '../test/doubles';
import { App } from './App';
import { Session } from './session';

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
    expect(screen.getByRole('button', { name: 'Ordinateur' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le bureau' }));
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
    expect(screen.getByRole('dialog', { name: 'Aide' })).toBeInTheDocument();
    act(() => {
      session.notify('Bonjour');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Bonjour');
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le message' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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
      expect(menuItems()).toEqual(['Configurer', 'Supprimer le câble', 'Supprimer']);
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
    expect(screen.getByRole('menuitem', { name: 'Supprimer' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Configurer' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: 'Supprimer' })).toHaveFocus();
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
    expect(menuItems()).toEqual(['Afficher le bureau', 'Afficher les échanges de données (10.0.0.1)']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Afficher le bureau' }));
    expect(screen.getByRole('dialog', { name: 'Bureau de Ordinateur 1' })).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole('button', { name: /^Routeur 1/ }));
    expect(menuItems()).toEqual([
      'Afficher les tables du routeur',
      'Afficher les échanges de données (eth0 – sans adresse)',
      'Afficher les échanges de données (eth1 – 10.0.0.254)',
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
