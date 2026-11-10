import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeZip } from '../../src/test/zip';

const SHOTS = process.env.E2E_SCREENSHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function openTerminal(page: Page, device: string) {
  await page
    .getByRole('button', { name: new RegExp(`^${device}`) })
    .first()
    .click();
  const desktop = page.getByRole('dialog', { name: `Bureau de ${device}` });
  await desktop.getByRole('button', { name: 'Ligne de commande' }).click();
  return page.getByRole('dialog', { name: `Ligne de commande — ${device}` });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
});

test('conception : ajouter, câbler et configurer deux ordinateurs', async ({ page }) => {
  await expect(page.getByText('Le plan est vide.')).toBeVisible();
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  await palette.getByRole('button', { name: /Ordinateur/ }).click();
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).fill('192.168.0.1');
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).press('Enter');
  await page.getByRole('textbox', { name: 'Masque', exact: true }).fill('255.255.255.0');
  await page.getByRole('textbox', { name: 'Masque', exact: true }).press('Enter');
  await palette.getByRole('button', { name: /Ordinateur/ }).click();
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).fill('192.168.0.300');
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).press('Enter');
  await expect(page.getByRole('alert')).toContainText('Adresse invalide');
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).fill('192.168.0.2');
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).press('Enter');
  await page.getByRole('textbox', { name: 'Masque', exact: true }).fill('255.255.255.0');
  await page.getByRole('textbox', { name: 'Masque', exact: true }).press('Enter');
  await palette.getByRole('button', { name: /Switch/ }).click();

  await palette.getByRole('button', { name: 'Câble' }).click();
  for (const pair of [
    ['Ordinateur 1', 'Switch 1'],
    ['Ordinateur 2', 'Switch 1'],
  ]) {
    for (const name of pair) await page.locator(`[aria-label^="${name}"]`).click();
  }
  await expect(page.locator('.cable')).toHaveCount(2);
  await shot(page, '01-conception');

  await page.getByRole('radio', { name: /Simulation/ }).click();
  const terminal = await openTerminal(page, 'Ordinateur 1');
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).fill('ping -n 2 192.168.0.2');
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).press('Enter');
  await expect(terminal.getByRole('log')).toContainText('reçus = 2, perdus = 0', { timeout: 20_000 });
  await shot(page, '02-ping');
});

test('exemple : DHCP, DNS, web et messagerie', async ({ page }) => {
  await page.getByRole('button', { name: 'chargez le réseau d’exemple' }).click();
  await expect(page.locator('.device')).toHaveCount(10);
  await page.getByRole('radio', { name: /Simulation/ }).click();
  await page.getByRole('slider').fill('5'); // fastest speed

  const terminal = await openTerminal(page, 'Poste 1');
  await expect(page.locator('[aria-label^="Poste 1 (192.168.1.10"]')).toBeVisible({ timeout: 20_000 });
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).fill('ipconfig');
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).press('Enter');
  await expect(terminal.getByRole('log')).toContainText('192.168.2.53');
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).fill('traceroute www.college.fr');
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).press('Enter');
  await expect(terminal.getByRole('log')).toContainText('Itinéraire déterminé.', { timeout: 20_000 });
  await shot(page, '03-traceroute');
  await terminal.getByRole('button', { name: /Fermer/ }).click();

  await page
    .getByRole('dialog', { name: 'Bureau de Poste 1' })
    .getByRole('button', { name: 'Navigateur web' })
    .click();
  const browser = page.getByRole('dialog', { name: 'Navigateur web — Poste 1' });
  await browser.getByRole('textbox', { name: 'Adresse', exact: true }).fill('www.college.fr');
  await browser.getByRole('button', { name: 'Aller' }).click();
  await expect(browser.getByRole('heading', { name: 'Bienvenue sur le site du collège' })).toBeVisible({
    timeout: 20_000,
  });
  await browser.getByText('Menu de la cantine').click();
  await expect(browser.getByText('Lasagnes')).toBeVisible({ timeout: 20_000 });
  await shot(page, '04-navigateur');
  await browser.getByRole('button', { name: /Fermer/ }).click();

  await page
    .getByRole('dialog', { name: 'Bureau de Poste 1' })
    .getByRole('button', { name: 'Messagerie' })
    .click();
  const mail = page.getByRole('dialog', { name: 'Messagerie — Poste 1' });
  await mail.getByRole('tab', { name: 'Nouveau message' }).click();
  await mail.getByRole('textbox', { name: 'À', exact: true }).fill('eleve2@college.fr');
  await mail.getByRole('textbox', { name: 'Objet', exact: true }).fill('Exposé');
  await mail.getByRole('textbox', { name: 'Message', exact: true }).fill('On travaille sur les réseaux ?');
  await mail.getByRole('button', { name: 'Envoyer' }).click();
  await expect(mail.getByText('Message envoyé.')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /^Poste 2/ }).click();
  await page
    .getByRole('dialog', { name: 'Bureau de Poste 2' })
    .getByRole('button', { name: 'Messagerie' })
    .click();
  const mail2 = page.getByRole('dialog', { name: 'Messagerie — Poste 2' });
  await mail2.getByRole('button', { name: 'Relever le courrier' }).click();
  await expect(mail2.getByText('1 nouveau(x) message(s).')).toBeVisible({ timeout: 20_000 });
  await mail2.getByRole('cell', { name: 'Exposé' }).click();
  await expect(mail2.getByText('On travaille sur les réseaux ?')).toBeVisible();
  await shot(page, '05-messagerie');

  // Les fenêtres des postes de gauche s'ouvrent à droite, par-dessus les serveurs.
  await page.getByRole('button', { name: 'Tout fermer' }).click();
  await page.getByRole('button', { name: /^Serveur web/ }).click();
  await page
    .getByRole('dialog', { name: 'Bureau de Serveur web' })
    .getByRole('button', { name: 'Échanges de données' })
    .click();
  const capture = page.getByRole('dialog', { name: 'Échanges de données — Serveur web' });
  await capture.getByRole('cell', { name: 'HTTP' }).first().click();
  await expect(capture.getByLabel('Détail de la trame')).toContainText('Application — HTTP');
  await shot(page, '06-echanges');
});

async function configureHost(page: Page, name: string, ip: string, gateway: string) {
  await page.locator(`[aria-label^="${name}"]`).click();
  for (const [label, value] of [
    ['Adresse IP', ip],
    ['Masque', '255.255.255.0'],
    ['Passerelle', gateway],
  ] as const) {
    const field = page.getByRole('textbox', { name: label, exact: true });
    await field.fill(value);
    await field.press('Enter');
  }
}

async function pingFrom(page: Page, device: string, target: string) {
  await page.getByRole('radio', { name: /Simulation/ }).click();
  await page.getByRole('slider').fill('5');
  const terminal = await openTerminal(page, device);
  const input = terminal.getByRole('textbox', { name: 'Commande', exact: true });
  await input.fill(`ping -n 1 ${target}`);
  await input.press('Enter');
  const log = terminal.getByRole('log');
  await expect(log).toContainText('Statistiques', { timeout: 20_000 });
  const text = (await log.textContent()) ?? '';
  await page.getByRole('radio', { name: /Conception/ }).click();
  return text;
}

test('routage entre deux réseaux et pare-feu du routeur', async ({ page }) => {
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  await palette.getByRole('button', { name: /Ordinateur/ }).click();
  await palette.getByRole('button', { name: /Ordinateur/ }).click();
  await palette.getByRole('button', { name: /Routeur/ }).click();
  await configureHost(page, 'Ordinateur 1', '10.0.1.10', '10.0.1.1');
  await configureHost(page, 'Ordinateur 2', '10.0.2.10', '10.0.2.1');

  await page.locator('[aria-label^="Routeur"]').click();
  for (const [label, value] of [
    ['IP eth0', '10.0.1.1'],
    ['Masque eth0', '255.255.255.0'],
    ['IP eth1', '10.0.2.1'],
    ['Masque eth1', '255.255.255.0'],
  ] as const) {
    const field = page.getByRole('textbox', { name: label, exact: true });
    await field.fill(value);
    await field.press('Enter');
  }
  await palette.getByRole('button', { name: 'Câble' }).click();
  for (const name of ['Ordinateur 1', 'Routeur 1', 'Ordinateur 2', 'Routeur 1']) {
    await page.locator(`[aria-label^="${name}"]`).click();
  }
  await expect(page.locator('.cable')).toHaveCount(2);
  await shot(page, '07-routeur');

  expect(await pingFrom(page, 'Ordinateur 1', '10.0.2.10')).toContain('reçus = 1, perdus = 0');

  await page.locator('[aria-label^="Routeur"]').click();
  await page.getByRole('tab', { name: 'Pare-feu' }).click();
  await page.getByRole('checkbox', { name: 'Pare-feu activé' }).check();
  expect(await pingFrom(page, 'Ordinateur 1', '10.0.2.10')).toContain('reçus = 0, perdus = 1');

  await page.locator('[aria-label^="Routeur"]').click();
  await page.getByRole('tab', { name: 'Pare-feu' }).click();
  await page.getByRole('combobox', { name: 'Protocole' }).selectOption('icmp');
  await page.getByRole('button', { name: 'Ajouter la règle' }).click();
  await shot(page, '08-pare-feu');
  expect(await pingFrom(page, 'Ordinateur 1', '10.0.2.10')).toContain('reçus = 1, perdus = 0');
});

test('le projet est sauvegardé automatiquement et rechargé', async ({ page }) => {
  await page.getByRole('button', { name: 'Exemple', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator('.device')).toHaveCount(10);
  // Sur un poste partagé, ce travail peut être celui de l'élève précédent : on le demande.
  const banner = page.getByRole('region', { name: 'Travail retrouvé' });
  await expect(banner).toContainText('Un travail a été retrouvé sur ce poste (enregistré le');
  await shot(page, '21-reprise');
  await banner.getByRole('button', { name: 'Continuer ce travail' }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator('.device')).toHaveCount(10);

  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByRole('button', { name: 'Nouveau réseau' }).click();
  await expect(page.getByText('Le plan est vide.')).toBeVisible();
});

test('saisie : une adresse tapée est gardée quand on clique sur le plan, le masque est proposé', async ({
  page,
}) => {
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  const plan = page.getByRole('application', { name: 'Plan du réseau' });
  const address = page.getByRole('textbox', { name: 'Adresse IP', exact: true });
  await palette.getByRole('button', { name: /Ordinateur/ }).click();
  await address.click();
  await page.keyboard.type('192.168.0.1');
  // Geste naturel pour « valider » : cliquer ailleurs, sur le plan vide.
  await plan.click({ position: { x: 700, y: 300 } });
  await expect(page.locator('[aria-label="Ordinateur 1 (192.168.0.1)"]')).toBeVisible();

  await page.locator('[aria-label^="Ordinateur 1"]').click();
  await expect(page.getByRole('textbox', { name: 'Masque', exact: true })).toHaveValue('255.255.255.0');
  await address.fill('192.168.0.300');
  await plan.click({ position: { x: 700, y: 300 } });
  await expect(page.getByRole('alert')).toContainText('Adresse invalide');
  await expect(address).toHaveValue('192.168.0.300');
  await shot(page, '22-saisie-invalide');
  await address.fill('192.168.0.2');
  await plan.click({ position: { x: 700, y: 300 } });
  await expect(page.locator('[aria-label="Ordinateur 1 (192.168.0.2)"]')).toBeVisible();

  // Enregistrer demande un nom de fichier.
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Enregistrer le projet' });
  await dialog.getByRole('textbox', { name: 'Nom du fichier' }).fill('Dupont - activité 1');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  expect((await download).suggestedFilename()).toBe('Dupont - activité 1.reseaulab.json');
});

test('fonctionne ouvert directement depuis le fichier, sans serveur', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const file = fileURLToPath(new URL('../../dist/index.html', import.meta.url));
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('button', { name: 'chargez le réseau d’exemple' }).click();
  await page.getByRole('radio', { name: /Simulation/ }).click();
  await page.getByRole('slider').fill('5');
  const terminal = await openTerminal(page, 'Serveur DNS');
  const input = terminal.getByRole('textbox', { name: 'Commande', exact: true });
  await input.fill('nslookup mail.college.fr');
  await input.press('Enter');
  await expect(terminal.getByRole('log')).toContainText('192.168.2.25', { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('importe un projet Filius (.fls) avec ses annotations', async ({ page }) => {
  const xml = readFileSync(
    fileURLToPath(new URL('../../src/project/filius/fixtures/konfiguration.xml', import.meta.url)),
    'utf8',
  );
  const fls = await makeZip({ 'projekt/konfiguration.xml': xml }, { deflate: true });
  await page.getByTestId('open-project').setInputFiles({
    name: 'salle-101.fls',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(fls),
  });
  const report = page.getByRole('dialog', { name: 'Projet Filius importé' });
  await expect(report).toContainText('Les modems ne sont pas pris en charge');
  await shot(page, '09-import-rapport');
  await report.getByRole('button', { name: 'Compris' }).click();
  await expect(page.locator('.device')).toHaveCount(6);
  await expect(page.getByText('Salle 101')).toBeVisible();
  await shot(page, '10-import-filius');

  await page.getByRole('radio', { name: /Simulation/ }).click();
  await page.getByRole('slider').fill('5');
  const terminal = await openTerminal(page, '192.168.0.10');
  const input = terminal.getByRole('textbox', { name: 'Commande', exact: true });
  await input.fill('ping -n 1 10.0.0.53');
  await input.press('Enter');
  await expect(terminal.getByRole('log')).toContainText('reçus = 1, perdus = 0', { timeout: 20_000 });
});

test('clic droit : menus contextuels comme dans Filius', async ({ page }) => {
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  await palette.getByRole('button', { name: /Ordinateur/ }).click();
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).fill('192.168.0.1');
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).press('Enter');
  await palette.getByRole('button', { name: /Switch/ }).click();
  await palette.getByRole('button', { name: 'Câble' }).click();
  for (const name of ['Ordinateur 1', 'Switch 1']) await page.locator(`[aria-label^="${name}"]`).click();
  await expect(page.locator('.cable')).toHaveCount(1);

  // Conception : le menu du navigateur est remplacé par celui de RéseauLab.
  const computer = page.locator('[aria-label^="Ordinateur 1"]');
  await computer.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Menu de « Ordinateur 1 »' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText(['Configurer', 'Supprimer le câble', 'Supprimer']);
  await shot(page, '10-menu-conception');
  await menu.getByRole('menuitem', { name: 'Configurer' }).click();
  await expect(page.getByRole('textbox', { name: 'Nom' })).toBeFocused();

  await palette.getByRole('button', { name: 'Texte' }).click();
  const canvas = page.getByRole('application', { name: 'Plan du réseau' });
  await canvas.getByRole('button', { name: 'Texte : Texte' }).click({ button: 'right' });
  await page.getByRole('menuitemradio', { name: 'Gras' }).click();
  await expect(page.getByRole('checkbox', { name: 'Gras' })).toBeChecked();

  // Simulation : bureau et échanges de données.
  await page.getByRole('radio', { name: /Simulation/ }).click();
  await computer.click({ button: 'right' });
  await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText([
    'Afficher le bureau',
    'Afficher les échanges de données (192.168.0.1)',
  ]);
  await shot(page, '11-menu-simulation');
  await page.getByRole('menuitem', { name: 'Afficher les échanges de données (192.168.0.1)' }).click();
  await expect(page.getByRole('dialog', { name: 'Échanges de données — Ordinateur 1' })).toBeVisible();
  await computer.click({ button: 'right' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('Wi-Fi : un portable rejoint le réseau sans fil d’un switch puis répond au ping', async ({ page }) => {
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  await palette.getByRole('button', { name: /Switch/ }).click();
  await page.getByRole('textbox', { name: 'Nom Wi-Fi (SSID)' }).fill('CDI');
  await page.getByRole('textbox', { name: 'Nom Wi-Fi (SSID)' }).press('Enter');

  await palette.getByRole('button', { name: /Ordinateur/ }).click();
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).fill('192.168.0.1');
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).press('Enter');
  await palette.getByRole('button', { name: 'Câble' }).click();
  for (const name of ['Ordinateur 1', 'Switch 1']) await page.locator(`[aria-label^="${name}"]`).click();
  await palette.getByRole('button', { name: 'Câble' }).click();

  await palette.getByRole('button', { name: /Portable/ }).click();
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).fill('192.168.0.2');
  await page.getByRole('textbox', { name: 'Adresse IP', exact: true }).press('Enter');
  await page.getByRole('radio', { name: 'Sans fil (Wi-Fi)' }).check();
  await page.getByRole('combobox', { name: 'Réseau sans fil (SSID)' }).selectOption('CDI');
  await expect(page.getByText('Connecté au réseau « CDI » (switch « Switch 1 »).')).toBeVisible();
  // A horizontal link has an empty geometric box: check its presence, not its visibility.
  await expect(page.getByRole('button', { name: 'Wi-Fi Portable 1 – Switch 1' })).toHaveClass(/wireless/);
  await expect(page.locator('[aria-label="Switch 1 (Wi-Fi « CDI »)"]')).toBeVisible();
  await shot(page, '20-wifi');

  await page.getByRole('radio', { name: /Simulation/ }).click();
  await page.getByRole('slider').fill('5'); // vitesse maximale
  const terminal = await openTerminal(page, 'Portable 1');
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).fill('ipconfig');
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).press('Enter');
  await expect(terminal.getByRole('log')).toContainText('Wi-Fi, réseau « CDI »');
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).fill('ping -n 1 192.168.0.1');
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).press('Enter');
  await expect(terminal.getByRole('log')).toContainText('reçus = 1, perdus = 0', { timeout: 20_000 });
});

test('plan lisible : zoom ajusté, fenêtres à côté de l’équipement, annulation', async ({ page }) => {
  // Écran courant d'une salle informatique.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'chargez le réseau d’exemple' }).click();

  // Tout le réseau est visible, sans barre de défilement.
  const fits = () =>
    page.evaluate(
      `(() => {
        const el = document.querySelector('.canvas-scroll');
        return el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight;
      })()`,
    );
  await expect.poll(fits).toBe(true);
  expect((await page.getByRole('banner').boundingBox())?.height).toBeLessThan(60);
  for (const name of ['Poste 1', 'Portable', 'Serveur DHCP', 'Serveur mail']) {
    await expect(page.locator(`[aria-label^="${name}"]`)).toBeInViewport({ ratio: 1 });
  }
  const zoom = page.getByRole('group', { name: 'Zoom du plan' });
  await zoom.getByRole('button', { name: 'Agrandir le plan' }).click();
  expect(await fits()).toBe(false);
  await zoom.getByRole('button', { name: 'Ajuster' }).click();
  expect(await fits()).toBe(true);
  await shot(page, '23-plan-ajuste');

  // Supprimer par erreur puis annuler.
  await page.locator('[aria-label^="Routeur"]').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.device')).toHaveCount(9);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.device')).toHaveCount(10);
  await expect(page.locator('[aria-label^="Routeur"]')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByRole('button', { name: 'Rétablir' }).click();
  await expect(page.locator('.device')).toHaveCount(10);

  // En simulation, la fenêtre s'ouvre du côté opposé à l'équipement : il reste visible.
  await page.getByRole('radio', { name: /Simulation/ }).click();
  await expect(page.getByRole('complementary', { name: 'Palette d’équipements' })).toHaveCount(0);
  // La zone du plan change de taille : il se réajuste.
  await expect.poll(fits).toBe(true);
  // La barre d'outils tient sur une ligne.
  expect((await page.getByRole('banner').boundingBox())?.height).toBeLessThan(60);
  const apart = async (device: string, dialog: string) => {
    const d = await page.locator(`[aria-label^="${device}"]`).boundingBox();
    const w = await page.getByRole('dialog', { name: dialog }).boundingBox();
    if (!d || !w) return false;
    return w.x >= d.x + d.width || w.x + w.width <= d.x || w.y >= d.y + d.height || w.y + w.height <= d.y;
  };
  await page.locator('[aria-label^="Poste 1"]').click();
  expect(await apart('Poste 1', 'Bureau de Poste 1')).toBe(true);
  await page
    .getByRole('dialog', { name: 'Bureau de Poste 1' })
    .getByRole('button', { name: 'Ligne de commande' })
    .click();
  expect(await apart('Poste 1', 'Ligne de commande — Poste 1')).toBe(true);
  await shot(page, '24-fenetres');
  await page.getByRole('button', { name: 'Tout fermer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Un équipement de droite ouvre ses fenêtres à gauche ; Échap ferme celle du dessus.
  await page.locator('[aria-label^="Serveur web"]').click();
  expect(await apart('Serveur web', 'Bureau de Serveur web')).toBe(true);
  await page.locator('[aria-label^="Serveur mail"]').click();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Bureau de Serveur mail' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Bureau de Serveur web' })).toBeVisible();
});

test('diagnostic : un ping raté est expliqué, puis la correction est vérifiée', async ({ page }) => {
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  await palette.getByRole('button', { name: /Ordinateur/ }).click();
  await palette.getByRole('button', { name: /Ordinateur/ }).click();
  await palette.getByRole('button', { name: /Routeur/ }).click();
  // Erreur classique : le premier poste n'a pas de passerelle.
  await configureHost(page, 'Ordinateur 1', '10.0.1.10', '');
  await configureHost(page, 'Ordinateur 2', '10.0.2.10', '10.0.2.1');
  await page.locator('[aria-label^="Routeur"]').click();
  for (const [label, value] of [
    ['IP eth0', '10.0.1.1'],
    ['IP eth1', '10.0.2.1'],
  ] as const) {
    const field = page.getByRole('textbox', { name: label, exact: true });
    await field.fill(value);
    await field.press('Enter');
  }
  await palette.getByRole('button', { name: 'Câble' }).click();
  for (const name of ['Ordinateur 1', 'Routeur 1', 'Ordinateur 2', 'Routeur 1']) {
    await page.locator(`[aria-label^="${name}"]`).click();
  }
  await palette.getByRole('button', { name: 'Câble' }).click();

  // Le poste fautif est repéré sur le plan et dans son panneau.
  await expect(page.locator('[aria-label^="Ordinateur 1"] .lint-mark')).toHaveCount(1);
  await expect(page.locator('[aria-label^="Ordinateur 2"] .lint-mark')).toHaveCount(0);
  await page.locator('[aria-label^="Ordinateur 1"]').click();
  await expect(page.getByRole('list', { name: 'Points à vérifier' })).toContainText(
    'Ordinateur 1 n’a pas de passerelle',
  );
  await shot(page, '25-repere-plan');

  await page.getByRole('radio', { name: /Simulation/ }).click();
  await page.getByRole('slider').fill('5');
  const terminal = await openTerminal(page, 'Ordinateur 1');
  const input = terminal.getByRole('textbox', { name: 'Commande', exact: true });
  await input.fill('ping -n 1 10.0.2.10');
  await input.press('Enter');
  await expect(terminal.getByRole('log')).toContainText('Aucune route vers cet hôte');
  await terminal.getByRole('button', { name: 'Pourquoi ça ne marche pas ?' }).click();
  const check = page.getByRole('dialog', { name: 'Vérifier mon réseau' });
  await expect(check.getByRole('status')).toContainText(
    'Ordinateur 1 ne sait pas par où envoyer vers 10.0.2.10',
  );
  await expect(check.getByRole('status')).toContainText('Que faire ? Indiquez comme passerelle');
  await shot(page, '26-pourquoi');

  // Corriger, puis vérifier sans relancer la simulation.
  await page.getByRole('radio', { name: /Conception/ }).click();
  await page.locator('[aria-label^="Ordinateur 1"]').click();
  const gateway = page.getByRole('textbox', { name: 'Passerelle', exact: true });
  await gateway.fill('10.0.1.1');
  await gateway.press('Enter');
  await expect(page.locator('.lint-mark')).toHaveCount(0);
  await expect(check.getByRole('status')).toContainText('Le réseau a changé depuis ce test');
  await check.getByRole('button', { name: 'Tester' }).click();
  await expect(check.getByRole('status')).toContainText('Ordinateur 1 communique avec 10.0.2.10');
  await expect(check.getByRole('status')).toContainText(
    'Trajet de la demande : Ordinateur 1 → Routeur 1 → Ordinateur 2 ✔',
  );
  await expect(check).toContainText('Aucun problème repéré dans la configuration.');
  await shot(page, '27-corrige');
});

test('simulation lisible : trames nommées, pas à pas, abandon signalé, échanges filtrés', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'chargez le réseau d’exemple' }).click();
  await page.getByRole('radio', { name: /Simulation/ }).click();

  // Au démarrage, les postes demandent leur adresse : les trames portent le nom du protocole.
  await expect(page.locator('.packet.dhcp text').first()).toHaveText('DHCP');
  await page.getByRole('button', { name: /Légende des trames/ }).click();
  await expect(page.getByRole('list', { name: 'Légende des trames' })).toContainText(
    'DHCP : adresse automatique',
  );
  await shot(page, '28-trames-nommees');
  await page.getByRole('button', { name: /Légende des trames/ }).click();
  await page.getByRole('slider').fill('5');
  await expect(page.locator('[aria-label^="Poste 1 (192.168.1.10"]')).toBeVisible({ timeout: 20_000 });

  // Pas à pas : en pause, chaque clic fait avancer les trames d'un câble.
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Simulation en pause')).toBeVisible();
  const terminal = await openTerminal(page, 'Poste 1');
  const input = terminal.getByRole('textbox', { name: 'Commande', exact: true });
  await input.fill('ping -n 1 172.16.0.1');
  await input.press('Enter');
  const next = page.getByRole('button', { name: 'Trame suivante' });
  await next.click();
  await expect(page.getByText('Simulation en pause')).toBeVisible();
  await expect(page.locator('.packet').first()).toBeVisible();
  await shot(page, '29-pas-a-pas');
  await page.getByRole('button', { name: 'Reprendre' }).click();

  // Le routeur ne connaît pas ce réseau : l'abandon est écrit sur le plan.
  await expect(page.locator('.drop-mark text')).toHaveText('✕ aucun chemin vers la destination', {
    timeout: 20_000,
  });
  await shot(page, '30-abandon');
  await expect(terminal.getByRole('log')).toContainText('réseau de destination inaccessible', {
    timeout: 20_000,
  });

  // Échanges de données : ce que le poste a ignoré, et le filtre par protocole.
  await page.getByRole('button', { name: 'Tout fermer' }).click();
  await page.locator('[aria-label^="Poste 1"]').click();
  await page.getByRole('button', { name: 'Afficher les échanges de données' }).click();
  const capture = page.getByRole('dialog', { name: 'Échanges de données — Poste 1' });
  await expect(capture.getByRole('row').filter({ hasText: '← ignorée' }).first()).toBeVisible();
  await capture.getByRole('combobox', { name: 'Protocole' }).selectOption('ICMP');
  await expect(capture.getByRole('row').filter({ hasText: 'DHCP' })).toHaveCount(0);
  await expect(capture.getByRole('row').filter({ hasText: 'ICMP' }).first()).toBeVisible();
  await shot(page, '31-echanges-filtres');

  // Tables d'un poste sans passer par la ligne de commande.
  await page.getByRole('button', { name: 'Afficher les tables' }).click();
  await expect(page.getByRole('dialog', { name: 'Tables — Poste 1' })).toContainText('toutes les autres');
});

test('connaissances : définition depuis un champ, fiches, recherche et lexique', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  await palette.getByRole('button', { name: /Ordinateur/ }).click();

  // Le « ? » d'un champ : la définition, juste à côté.
  await page.getByRole('button', { name: 'Qu’est-ce que : Passerelle ?' }).click();
  const bubble = page.getByRole('note');
  await expect(bubble).toContainText('La passerelle est l’adresse du routeur');
  await expect(bubble).toBeInViewport({ ratio: 1 });
  await shot(page, '32-definition');
  await bubble.getByRole('button', { name: 'En savoir plus' }).click();

  const help = page.getByRole('dialog', { name: 'Aide et connaissances' });
  const card = help.getByRole('article', { name: 'Passerelle' });
  await expect(card).toContainText('À retenir');
  await shot(page, '33-fiche');
  await card.getByRole('button', { name: 'routeur', exact: true }).first().click();
  await expect(help.getByRole('article', { name: 'Routeur' })).toBeVisible();
  await help.getByRole('button', { name: '← Retour' }).click();
  await expect(card).toBeVisible();

  const index = help.getByRole('navigation', { name: 'Fiches' });
  await index.getByRole('searchbox', { name: 'Chercher une notion' }).fill('adresse mac');
  await index.getByRole('button', { name: 'Adresse MAC et carte réseau' }).click();
  await expect(help.getByRole('article', { name: 'Adresse MAC et carte réseau' })).toBeVisible();
  await index.getByRole('searchbox', { name: 'Chercher une notion' }).fill('');
  await index.getByRole('button', { name: 'Lexique' }).click();
  await expect(index.getByRole('button', { name: /^commutateur/ })).toBeVisible();

  // Le bouton Aide ouvre la prise en main.
  await help.getByRole('button', { name: /Fermer/ }).click();
  await page.getByRole('button', { name: 'Aide', exact: true }).click();
  await expect(help.getByRole('article', { name: 'Construire un réseau' })).toBeVisible();
});

test('profil par niveau : en 4e, l’interface se limite au programme du niveau', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  await expect(palette.getByRole('button', { name: /Routeur/ })).toBeVisible();

  await page.getByRole('button', { name: 'Réglages' }).click();
  const settings = page.getByRole('dialog', { name: 'Réglages' });
  await settings.getByRole('radio', { name: /^4e/ }).check();
  await expect(settings.getByRole('region', { name: 'Ce qui est masqué' })).toContainText(
    'Équipements : Routeur.',
  );
  await shot(page, '34-reglages');
  await settings.getByRole('button', { name: /Fermer/ }).click();

  await expect(palette.getByRole('button', { name: /Routeur/ })).toHaveCount(0);
  await palette.getByRole('button', { name: /Ordinateur/ }).click();
  await expect(page.getByRole('textbox', { name: 'Adresse IP', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Passerelle', exact: true })).toHaveCount(0);
  await shot(page, '35-niveau-4e');

  // Le choix est gardé sur le poste.
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(palette.getByRole('button', { name: /Switch/ })).toBeVisible();
  await expect(palette.getByRole('button', { name: /Routeur/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Réglages' })).toHaveAttribute('title', /niveau : 4e/);
});

test('activité guidée : « Mon premier réseau » réalisée de bout en bout', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Activités' }).click();
  await shot(page, '37-liste-activites');
  await page.getByRole('button', { name: 'Commencer : Mon premier réseau' }).click();
  const panel = page.getByRole('complementary', { name: 'Activité' });
  await expect(panel).toContainText('0 objectif sur 9');
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });

  // Étape 1 : poser les équipements.
  await palette.getByRole('button', { name: 'Ordinateur', exact: true }).click();
  await palette.getByRole('button', { name: 'Ordinateur', exact: true }).click();
  await palette.getByRole('button', { name: 'Switch', exact: true }).click();
  await expect(panel).toContainText('2 objectifs sur 9');

  // Étape 2 : relier.
  await palette.getByRole('button', { name: 'Câble' }).click();
  for (const name of ['Ordinateur 1', 'Switch 1', 'Ordinateur 2', 'Switch 1']) {
    await page.locator(`[aria-label^="${name}"]`).click();
  }
  await palette.getByRole('button', { name: 'Câble' }).click();
  await expect(panel).toContainText('4 objectifs sur 9');
  await shot(page, '38-activite-en-cours');

  // Étape 3 : adresser. Une même adresse deux fois ne valide pas l'étape.
  const address = page.getByRole('textbox', { name: 'Adresse IP', exact: true });
  for (const name of ['Ordinateur 1', 'Ordinateur 2']) {
    await page.locator(`[aria-label^="${name}"]`).click();
    await address.fill('192.168.1.1');
    await address.press('Enter');
  }
  await expect(panel).toContainText('5 objectifs sur 9');
  await expect(panel).toContainText('1 point(s) signalé(s) par Vérifier.');
  await address.fill('192.168.1.2');
  await address.press('Enter');
  await expect(panel).toContainText('6 objectifs sur 9');

  // Étape 4 : tester en simulation.
  await page.getByRole('radio', { name: /Simulation/ }).click();
  await page.getByRole('slider').fill('5');
  await expect(panel).toContainText('7 objectifs sur 9');
  const terminal = await openTerminal(page, 'Ordinateur 1');
  const input = terminal.getByRole('textbox', { name: 'Commande', exact: true });
  await input.fill('ping -n 1 192.168.1.2');
  await input.press('Enter');
  await expect(terminal.getByRole('log')).toContainText('reçus = 1, perdus = 0', { timeout: 20_000 });
  await expect(panel).toContainText('8 objectifs sur 9');
  await panel.getByRole('button', { name: 'Vérifier mon travail' }).click();
  await expect(panel).toContainText('Tous les objectifs sont atteints. Bravo !');
  await shot(page, '39-activite-terminee');

  // Le fichier rendu contient l'activité et le travail de l'élève.
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Enregistrer le projet' });
  await expect(dialog.getByRole('textbox', { name: 'Nom du fichier' })).toHaveValue('premier-reseau');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  const path = await (await download).path();
  const saved = JSON.parse(readFileSync(path, 'utf8')) as {
    activity: { id: string };
    work: { done: string[] };
  };
  expect(saved.activity.id).toBe('premier-reseau');
  expect(saved.work.done).toHaveLength(9);

  // Après rechargement de la page, l'activité est retrouvée avec son avancement.
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Activité' })).toContainText('Mon premier réseau');
  await expect(page.getByRole('region', { name: 'Travail retrouvé' })).toBeVisible();
});
