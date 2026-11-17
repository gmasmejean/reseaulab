// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ManualFrames } from '../../test/doubles';
import { App } from '../App';
import { Session } from '../session';

function openExplorer() {
  const session = new Session(null, new ManualFrames());
  const id = session.addDevice('computer');
  const host = session.network.host(id);
  host.fs.writeFile('/notes.txt', 'bonjour');
  render(<App session={session} />);
  act(() => {
    session.setMode('simulation');
    session.openWindow({ type: 'app', deviceId: id, app: 'fileexplorer' });
  });
  const win = screen.getByRole('dialog', { name: 'Explorateur de fichiers — Ordinateur 1' });
  return { host, win };
}

describe('Explorateur de fichiers', () => {
  test('renomme un fichier directement dans la liste', () => {
    const { host, win } = openExplorer();
    fireEvent.click(within(win).getByRole('button', { name: 'Renommer' }));
    const input = within(win).getByRole('textbox', { name: 'Nouveau nom de notes.txt' });
    fireEvent.change(input, { target: { value: 'cours.txt' } });
    fireEvent.submit(input);
    expect(host.fs.readFile('/cours.txt')).toBe('bonjour');
    expect(within(win).getByText(/cours\.txt/)).toBeInTheDocument();
  });

  test('demande confirmation avant de supprimer', () => {
    const { host, win } = openExplorer();
    fireEvent.click(within(win).getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(within(win).getByRole('button', { name: 'Non' }));
    expect(host.fs.exists('/notes.txt')).toBe(true);
    fireEvent.click(within(win).getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(within(win).getByRole('button', { name: 'Oui' }));
    expect(host.fs.exists('/notes.txt')).toBe(false);
    expect(within(win).getByText('Dossier vide.')).toBeInTheDocument();
  });

  test('dossier en lecture seule : signalé, et toute modification est refusée avec un message', () => {
    const { host, win } = openExplorer();
    act(() => {
      host.fs.mkdir('/Commun');
      host.fs.writeFile('/Commun/charte.pdf', 'Charte');
      host.fs.setReadOnly('/Commun');
    });
    // Dans la liste, le dossier est marqué ; à côté, rien n'est signalé.
    expect(within(win).getByRole('button', { name: /Commun/ })).toHaveTextContent('🔒 lecture seule');
    expect(within(win).queryByRole('note')).toBeNull();
    fireEvent.click(within(win).getByRole('button', { name: /Commun/ }));
    expect(within(win).getByRole('note')).toHaveTextContent('Dossier en lecture seule');

    // Créer un dossier, renommer, supprimer : refusé, et le serveur le dit.
    fireEvent.change(within(win).getByRole('textbox', { name: 'Nom du dossier' }), {
      target: { value: 'Nouveau' },
    });
    fireEvent.click(within(win).getByRole('button', { name: 'Créer' }));
    expect(within(win).getByRole('alert')).toHaveTextContent('Dossier en lecture seule : /Commun');
    fireEvent.click(within(win).getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(within(win).getByRole('button', { name: 'Oui' }));
    expect(within(win).getByRole('alert')).toHaveTextContent('Dossier en lecture seule : /Commun');
    expect(host.fs.list('/Commun').map((e) => e.name)).toEqual(['charte.pdf']);
    // Lire reste possible : le fichier s'exporte.
    expect(within(win).getByRole('button', { name: 'Exporter' })).toBeEnabled();
  });

  test('signale un nom de dossier invalide', () => {
    const { win } = openExplorer();
    fireEvent.change(within(win).getByRole('textbox', { name: 'Nom du dossier' }), {
      target: { value: 'a/b' },
    });
    fireEvent.click(within(win).getByRole('button', { name: 'Créer' }));
    expect(within(win).getByRole('alert')).toBeInTheDocument();
  });
});
