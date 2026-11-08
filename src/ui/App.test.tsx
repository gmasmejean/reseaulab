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
