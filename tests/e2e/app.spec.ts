import { expect, test, type Locator, type Page } from '@playwright/test';
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

  // L'outil câble est toujours pris : un premier clic droit le repose, sans menu.
  const computer = page.locator('[aria-label^="Ordinateur 1"]');
  await computer.click({ button: 'right' });
  await expect(palette.getByRole('button', { name: 'Câble' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Conception : le menu du navigateur est remplacé par celui de RéseauLab.
  await computer.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Menu de « Ordinateur 1 »' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText([
    'Configurer',
    'Supprimer le câble',
    'Supprimer',
    'Qu’est-ce que c’est ?',
  ]);
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
    'Qu’est-ce que c’est ?',
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

test('box Internet : un ordinateur et un smartphone reçoivent leur adresse et communiquent', async ({
  page,
}) => {
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  await palette.getByRole('button', { name: 'Box Internet' }).click();
  await expect(page.locator('[aria-label="Box 1 (192.168.1.1)"]')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Adresse IP de la box' })).toHaveValue('192.168.1.1');
  await expect(page.getByRole('checkbox', { name: 'Distribuer les adresses (serveur DHCP)' })).toBeChecked();

  await palette.getByRole('button', { name: /Ordinateur/ }).click();
  await page.getByRole('checkbox', { name: 'Configuration automatique (DHCP)' }).check();
  await palette.getByRole('button', { name: 'Câble' }).click();
  for (const name of ['Ordinateur 1', 'Box 1']) await page.locator(`[aria-label^="${name}"]`).click();
  await palette.getByRole('button', { name: 'Câble' }).click();

  await palette.getByRole('button', { name: 'Smartphone' }).click();
  await page.getByRole('checkbox', { name: 'Configuration automatique (DHCP)' }).check();
  await page.getByRole('combobox', { name: 'Réseau sans fil (SSID)' }).selectOption('Box-1');
  await expect(page.getByText('Connecté au réseau « Box-1 » (box « Box 1 »).')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Points à vérifier' })).toHaveCount(0);
  await shot(page, '29-box-conception');

  await page.getByRole('radio', { name: /Simulation/ }).click();
  await page.getByRole('slider').fill('5'); // vitesse maximale
  // The box hands out its first two addresses.
  await expect(page.locator('[aria-label^="Ordinateur 1 (192.168.1.1"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[aria-label^="Smartphone 1 (192.168.1.1"]')).toBeVisible({ timeout: 20_000 });

  await page.locator('[aria-label^="Box 1"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Afficher les tables de la box' }).click();
  const tables = page.getByRole('dialog', { name: 'Box — Box 1' });
  await expect(tables.getByText('Adresses distribuées (DHCP)')).toBeVisible();
  await expect(tables.getByText('attribuée')).toHaveCount(2);
  await shot(page, '29-box-tables');
  await page.keyboard.press('Escape');

  const terminal = await openTerminal(page, 'Ordinateur 1');
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).fill('ping -n 1 192.168.1.1');
  await terminal.getByRole('textbox', { name: 'Commande', exact: true }).press('Enter');
  await expect(terminal.getByRole('log')).toContainText('reçus = 1, perdus = 0', { timeout: 20_000 });
  await shot(page, '29-box-ping');
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

  // Un équipement de droite : sa fenêtre ne le recouvre pas non plus, et s'ouvre là où
  // elle cache le moins d'équipements. Échap ferme celle du dessus.
  await page.locator('[aria-label^="Serveur web"]').click();
  expect(await apart('Serveur web', 'Bureau de Serveur web')).toBe(true);
  const uncovered: string[] = [];
  for (const name of ['Poste 1', 'Poste 2', 'Portable', 'Switch salle', 'Serveur DHCP', 'Routeur'])
    if (await apart(name, 'Bureau de Serveur web')) uncovered.push(name);
  // À gauche, elle aurait caché au moins deux de ces équipements.
  expect(uncovered).toHaveLength(6);
  await page.locator('[aria-label^="Serveur DNS"]').click();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Bureau de Serveur DNS' })).toHaveCount(0);
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
  const check = page.getByRole('dialog', { name: 'Vérifier le réseau' });
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

  // Fermée puis rouverte : la dernière fiche lue. F1 : la fiche de l'équipement sélectionné.
  await help.getByRole('button', { name: /Fermer/ }).click();
  await page.getByRole('button', { name: 'Aide', exact: true }).click();
  await expect(help.getByRole('article', { name: 'Adresse MAC et carte réseau' })).toBeVisible();
  await help.getByRole('button', { name: /Fermer/ }).click();
  await page.keyboard.press('F1');
  await expect(help.getByRole('article', { name: 'Terminal' })).toBeVisible();
  await help.getByRole('button', { name: '← Retour' }).click();
  await expect(help.getByRole('article', { name: 'Adresse MAC et carte réseau' })).toBeVisible();
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
  await expect(panel).toContainText('1 point(s) signalé(s) par « Vérifier le réseau ».');
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
  // Le bouton dit ce qu'il a validé.
  await expect(panel).toContainText('✔ 1 objectif validé.');
  await shot(page, '39-activite-terminee');
  // Revenir en conception n'est pas modifier le réseau : l'objectif reste validé.
  await page.getByRole('radio', { name: /Conception/ }).click();
  await expect(panel).toContainText('9 objectifs sur 9');
  await page.getByRole('radio', { name: /Simulation/ }).click();

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

test('compte rendu : le travail de l’élève s’imprime seul sur la page', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Activités' }).click();
  await page.getByRole('button', { name: 'Commencer : Relier deux réseaux' }).click();
  // La barre d'outils tient toujours sur une ligne, dans les deux modes.
  expect((await page.getByRole('banner').boundingBox())?.height).toBeLessThan(60);
  await page.getByRole('radio', { name: /Simulation/ }).click();
  expect((await page.getByRole('banner').boundingBox())?.height).toBeLessThan(60);
  await page.getByRole('radio', { name: /Conception/ }).click();

  await page.getByRole('button', { name: 'Compte rendu' }).click();
  const dialog = page.getByRole('dialog', { name: 'Compte rendu' });
  await dialog.getByRole('textbox', { name: 'Nom et prénom' }).fill('Camille Dupont');
  await dialog.getByRole('textbox', { name: 'Classe' }).fill('3e A');
  await dialog.getByRole('textbox', { name: /Ce que j’ai appris/ }).fill('Un routeur relie deux réseaux.');
  const preview = dialog.getByLabel('Aperçu du compte rendu');
  await expect(preview.getByRole('heading', { name: 'Relier deux réseaux' })).toBeVisible();
  await expect(preview.getByRole('row', { name: /^Poste A1/ })).toContainText('192.168.1.10');
  await expect(preview.getByRole('heading', { name: 'Objectifs de l’activité : 0 sur 8' })).toBeVisible();
  await shot(page, '40-compte-rendu');

  // À l'impression : le compte rendu, et rien d'autre.
  await page.emulateMedia({ media: 'print' });
  const printed = page.locator('.print-root .report');
  await expect(printed).toBeVisible();
  await expect(printed).toContainText('Camille Dupont');
  await expect(printed.getByRole('img', { name: 'Plan du réseau' })).toBeVisible();
  await expect(page.getByRole('banner')).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Palette d’équipements' })).toBeHidden();
  await page.screenshot({ path: `${SHOTS ?? 'test-results'}/41-impression.png`, fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await expect(page.getByRole('banner')).toBeVisible();
});

test('quiz : une question corrigée tout de suite, un bilan par notion', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Aide', exact: true }).click();
  const help = page.getByRole('dialog', { name: 'Aide et connaissances' });
  await help
    .getByRole('navigation', { name: 'Fiches' })
    .getByRole('button', { name: 'Switch (commutateur)' })
    .click();
  // Sous la fiche, une question corrigée sur place.
  const check = help.getByRole('region', { name: 'Pour vérifier' });
  await check.getByRole('radio', { name: 'À relier les équipements d’un même réseau local' }).check();
  await check.getByRole('button', { name: 'Valider' }).click();
  await expect(check).toContainText('Bonne réponse !');
  await check.getByRole('button', { name: 'Quiz sur cette notion' }).click();
  const quiz = page.getByRole('dialog', { name: 'Quiz' });
  await quiz.getByRole('button', { name: 'Commencer (1 question)' }).click();
  await expect(quiz).toContainText('À quoi sert un switch (commutateur) ?');
  await quiz.getByRole('radio', { name: 'À relier deux réseaux différents' }).check();
  await quiz.getByRole('button', { name: 'Valider' }).click();
  await expect(quiz).toContainText('Ce n’est pas ça.');
  await expect(quiz).toContainText('Réponse attendue : À relier les équipements d’un même réseau local');
  await shot(page, '42-quiz');
  await quiz.getByRole('button', { name: 'Voir le bilan' }).click();
  await expect(quiz.getByRole('row', { name: /Switch/ })).toContainText('à revoir');
  await shot(page, '43-quiz-bilan');

  // Le quiz général : huit questions du niveau.
  await quiz.getByRole('button', { name: /Fermer/ }).click();
  await help.getByRole('button', { name: 'Quiz d’entraînement' }).click();
  await expect(quiz.getByRole('button', { name: 'Commencer (8 questions)' })).toBeVisible();
});

test('enseignant : créer une activité, la distribuer, l’ouvrir comme un élève', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  // La solution : deux ordinateurs adressés, reliés par un switch.
  await palette.getByRole('button', { name: 'Ordinateur', exact: true }).click();
  await palette.getByRole('button', { name: 'Ordinateur', exact: true }).click();
  await palette.getByRole('button', { name: 'Switch', exact: true }).click();
  const address = page.getByRole('textbox', { name: 'Adresse IP', exact: true });
  for (const [name, ip] of [
    ['Ordinateur 1', '10.0.0.1'],
    ['Ordinateur 2', '10.0.0.2'],
  ] as const) {
    await page.locator(`[aria-label^="${name}"]`).click();
    await address.fill(ip);
    await address.press('Enter');
  }
  await palette.getByRole('button', { name: 'Câble' }).click();
  for (const name of ['Ordinateur 1', 'Switch 1', 'Ordinateur 2', 'Switch 1']) {
    await page.locator(`[aria-label^="${name}"]`).click();
  }
  await palette.getByRole('button', { name: 'Câble' }).click();

  await page.getByRole('button', { name: 'Activités' }).click();
  await page
    .getByRole('dialog', { name: 'Activités' })
    .getByRole('button', { name: 'Créer une activité' })
    .click();
  const author = page.getByRole('dialog', { name: 'Créer une activité' });
  await author.getByRole('textbox', { name: 'Titre de l’activité' }).fill('Adresser deux postes');
  await author
    .getByRole('textbox', { name: 'Consigne générale' })
    .fill('Donne une **adresse** à chaque poste.');
  await author.getByRole('textbox', { name: 'Étape 1 : titre' }).fill('Donner les adresses');
  await author.getByRole('button', { name: 'Choisir parmi les objectifs proposés…' }).click();
  await author.getByRole('button', { name: '+ Ordinateur 1 a une adresse du réseau 10.0.0.0' }).click();
  await author.getByRole('button', { name: '+ Ordinateur 2 a une adresse du réseau 10.0.0.0' }).click();
  await author.getByRole('button', { name: '+ Ordinateur 1 communique avec Ordinateur 2' }).click();
  await author.getByRole('button', { name: 'Fermer les propositions' }).click();
  await author.getByRole('button', { name: 'Contrôler l’activité' }).click();
  await expect(author.getByRole('status')).toContainText('atteint 3 des 3 objectifs');
  await expect(author.getByRole('status')).toContainText('Au départ, aucun n’est déjà atteint');
  await shot(page, '44-creer-activite');

  const download = page.waitForEvent('download');
  await author.getByRole('button', { name: 'Enregistrer le fichier d’activité' }).click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('adresser-deux-postes.activite.reseaulab.json');
  const text = readFileSync(await saved.path(), 'utf8');
  // La solution n'est pas dans le fichier distribué.
  expect(text).not.toContain('"ip": "10.0.0.1"');

  // Sur le poste d'un élève : ouvrir le fichier, faire l'activité.
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await page.getByTestId('open-project').setInputFiles({
    name: 'adresser-deux-postes.activite.reseaulab.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  // Le poste garde le réseau précédent : ouvrir un fichier demande de confirmer son remplacement.
  await page
    .getByRole('alertdialog', { name: 'Remplacer le réseau ?' })
    .getByRole('button', { name: 'Remplacer' })
    .click();
  const panel = page.getByRole('complementary', { name: 'Activité' });
  await expect(panel.getByRole('heading', { name: 'Adresser deux postes' })).toBeVisible();
  await expect(panel).toContainText('0 objectif sur 3');
  for (const [name, ip] of [
    ['Ordinateur 1', '10.0.0.7'],
    ['Ordinateur 2', '10.0.0.8'],
  ] as const) {
    await page.locator(`[aria-label^="${name}"]`).click();
    await address.fill(ip);
    await address.press('Enter');
  }
  await expect(panel).toContainText('2 objectifs sur 3');
  await panel.getByRole('button', { name: 'Vérifier mon travail' }).click();
  await expect(panel).toContainText('Tous les objectifs sont atteints. Bravo !');
});

test('activité : le panneau s’élargit en tirant son bord, sans écraser le plan', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Activités' }).click();
  await page.getByRole('button', { name: 'Commencer : Mon premier réseau' }).click();
  const panel = page.getByRole('complementary', { name: 'Activité' });
  const edge = panel.getByRole('separator', { name: 'Largeur de l’activité' });
  const widthOf = async () => Math.round((await panel.boundingBox())?.width ?? 0);
  expect(await widthOf()).toBe(320);

  // Tirer le bord gauche de 280 px vers la gauche.
  const box = await edge.boundingBox();
  if (!box) throw new Error('bord introuvable');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 140, y, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2 - 280, y, { steps: 5 });
  await page.mouse.up();
  expect(await widthOf()).toBe(600);
  await expect(edge).toHaveAttribute('aria-valuenow', '600');
  await shot(page, '50-activite-elargie');

  // Bien trop loin : le plan garde au moins 360 px.
  const wide = await edge.boundingBox();
  if (!wide) throw new Error('bord introuvable');
  await page.mouse.move(wide.x + wide.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(5, y, { steps: 5 });
  await page.mouse.up();
  const stage = await page.locator('main.stage').boundingBox();
  expect(Math.round(stage?.width ?? 0)).toBe(360);

  // La largeur est gardée au rechargement ; un double-clic rend la largeur d’origine.
  await page.reload();
  await page.getByRole('button', { name: 'Continuer ce travail' }).click();
  await expect(panel).toBeVisible();
  const kept = await widthOf();
  expect(kept).toBe(1366 - 156 - 360);
  await edge.dblclick();
  expect(await widthOf()).toBe(320);
});

test('le fichier unique reste léger', () => {
  const file = fileURLToPath(new URL('../../dist/index.html', import.meta.url));
  // Distribué par ENT, clé USB ou courriel : au-delà de 1 Mo, il faut se demander pourquoi.
  // (900 Ko jusqu'à l'étape 45 : le texte des activités de 4e et de 3e pèse à lui seul plus de 100 Ko.)
  expect(readFileSync(file).length).toBeLessThan(1_000_000);
});

test('activité « La salle de techno » : questions corrigées, station météo, travail rendu puis rouvert', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Activités' }).click();
  await page.getByRole('button', { name: 'Commencer : La salle de techno' }).click();
  const panel = page.getByRole('complementary', { name: 'Activité' });
  await expect(panel.getByRole('heading', { name: 'Partie 1 — Ce que je sais depuis la 5e' })).toBeVisible();
  await expect(panel).toContainText(/0 objectif sur \d+/);
  await shot(page, '60-salle-techno-depart');

  // Partie 1 : une question à plusieurs réponses, corrigée sur place.
  const usages = panel.getByRole('region', { name: 'Question : À quoi sert le réseau' });
  for (const choice of [
    'Partager des fichiers',
    'Imprimer depuis tous les postes',
    'Accéder à Internet',
    'Communiquer (ENT, messagerie)',
  ])
    await usages.getByRole('checkbox', { name: choice }).check();
  await usages.getByRole('button', { name: 'Valider' }).click();
  await expect(usages).toContainText('✔ Bonne réponse !');
  // Une réponse fausse : la réponse attendue est donnée, la fiche proposée.
  const lan = panel.getByRole('region', { name: 'Question : Réseau local ou Internet' });
  await lan.getByRole('radio', { name: 'Internet', exact: true }).check();
  await lan.getByRole('button', { name: 'Valider' }).click();
  await expect(lan).toContainText('Réponse attendue : un réseau local (LAN)');
  await expect(lan.getByRole('button', { name: /Relire la fiche/ })).toBeVisible();
  await shot(page, '61-salle-techno-question-corrigee');

  // Installer la station météo : câble, adresse fixe, puis lire ses mesures.
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  await palette.getByRole('button', { name: 'Câble' }).click();
  for (const name of ['Station météo', 'Switch salle']) await page.locator(`[aria-label^="${name}"]`).click();
  await palette.getByRole('button', { name: 'Câble' }).click();
  await page.locator('[aria-label^="Station météo"]').click();
  for (const [label, value] of [
    ['Adresse IP', '192.168.10.50'],
    ['Masque', '255.255.255.0'],
  ] as const) {
    const field = page.getByRole('textbox', { name: label, exact: true });
    await field.fill(value);
    await field.press('Enter');
  }
  await page.getByRole('radio', { name: /Simulation/ }).click();
  await page
    .getByRole('button', { name: /^Poste 1/ })
    .first()
    .click();
  await page
    .getByRole('dialog', { name: 'Bureau de Poste 1' })
    .getByRole('button', { name: 'Navigateur web' })
    .click();
  const browser = page.getByRole('dialog', { name: 'Navigateur web — Poste 1' });
  await browser.getByRole('textbox', { name: 'Adresse', exact: true }).fill('http://192.168.10.50');
  await browser.getByRole('button', { name: 'Aller' }).click();
  await expect(browser.getByRole('heading', { name: 'Station météo de la salle' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(browser.getByRole('cell', { name: '23,1' })).toBeVisible();
  await shot(page, '62-salle-techno-station');
  await browser.getByRole('button', { name: /Fermer/ }).click();
  await page.getByRole('radio', { name: /Conception/ }).click();

  // Le fichier rendu garde les réponses ; rouvert ailleurs, les questions restent corrigées.
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Enregistrer le projet' });
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  const text = readFileSync(await (await download).path(), 'utf8');
  const saved = JSON.parse(text) as { work: { answers: Partial<Record<string, { right: boolean | null }>> } };
  expect(saved.work.answers['q-usages']?.right).toBe(true);
  expect(saved.work.answers['q-lan']?.right).toBe(false);

  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await page.getByTestId('open-project').setInputFiles({
    name: 'salle-techno.reseaulab.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await page
    .getByRole('alertdialog', { name: 'Remplacer le réseau ?' })
    .getByRole('button', { name: 'Remplacer' })
    .click();
  const reopened = page.getByRole('complementary', { name: 'Activité' });
  await expect(reopened.getByRole('heading', { name: 'La salle de techno' })).toBeVisible();
  const again = reopened.getByRole('region', { name: 'Question : Réseau local ou Internet' });
  await expect(again).toContainText('Ta réponse : ✘(faux) Internet');
  await expect(again.locator('.given-part.wrong')).toHaveText('✘(faux) Internet');
  await expect(again.getByRole('radio')).toHaveCount(0);

  // Le compte rendu recopie les réponses.
  await page.getByRole('button', { name: 'Compte rendu' }).click();
  const report = page.getByRole('dialog', { name: 'Compte rendu' }).getByLabel('Aperçu du compte rendu');
  await expect(report).toContainText('Réponse : Internet — attendu : un réseau local (LAN)');
  await shot(page, '63-salle-techno-compte-rendu');
});

test('activité « Du collège au musée » : passerelle, DNS et route ajoutée, le site du musée s’affiche', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Activités' }).click();
  await page.getByRole('button', { name: 'Commencer : Du collège au musée' }).click();
  const panel = page.getByRole('complementary', { name: 'Activité' });
  await expect(
    panel.getByRole('heading', { name: 'Séance 1 — Partie 1 : ce que je sais depuis la 5e et la 4e' }),
  ).toBeVisible();
  await shot(page, '64-college-musee-depart');

  const lan = panel.getByRole('region', { name: 'Question : Réseau local ou Internet' });
  await lan.getByRole('radio', { name: 'un réseau local (LAN)' }).check();
  await lan.getByRole('button', { name: 'Valider' }).click();
  await expect(lan).toContainText('✔ Bonne réponse !');

  // Une erreur : le score de la partie le dit, et un nouvel essai la corrige.
  const terminals = panel.getByRole('region', { name: 'Question : Les terminaux du CDI' });
  await terminals.getByRole('checkbox', { name: 'Switch CDI' }).check();
  await terminals.getByRole('button', { name: 'Valider' }).click();
  await expect(terminals).toContainText('✘ Ce n’est pas ça.');
  await expect(panel).toContainText('Questions : 1 juste sur 2');
  await expect(panel.getByRole('button', { name: 'Revoir mes erreurs (1)' })).toBeVisible();
  await terminals.getByRole('button', { name: 'Réessayer' }).click();
  const retry = terminals.getByRole('group', { name: 'Nouvel essai' });
  for (const name of ['Poste 1', 'Tablette', 'Serveur', 'Capteur CO2'])
    await retry.getByRole('checkbox', { name, exact: true }).check();
  await retry.getByRole('button', { name: 'Valider' }).click();
  await expect(terminals).toContainText('✔ Corrigé au nouvel essai.');
  await expect(panel).toContainText('Questions : 1 juste sur 2 · 1 corrigée ensuite');
  await shot(page, '64b-college-musee-nouvel-essai');

  // Une association : une liste par équipement, corrigée paire par paire.
  const roles = panel.getByRole('region', { name: 'Question : Switch, serveur, routeur' });
  await expect(roles.getByRole('button', { name: 'Valider' })).toBeDisabled();
  for (const [device, role] of [
    ['Switch CDI', 'Relier les équipements du CDI entre eux'],
    ['Serveur', 'Stocker et fournir les fichiers et les services'],
    ['Routeur du collège', 'Relier le réseau du collège aux autres réseaux'],
  ] as const)
    await roles.getByRole('combobox', { name: device }).selectOption(role);
  await shot(page, '64c-college-musee-associer');
  await roles.getByRole('button', { name: 'Valider' }).click();
  await expect(roles).toContainText('✔ Bonne réponse !');

  // Poste 1 : passerelle et serveur DNS.
  await page.locator('[aria-label^="Poste 1"]').click();
  for (const [label, value] of [
    ['Passerelle', '192.168.10.254'],
    ['Serveur DNS', '80.10.0.53'],
  ] as const) {
    const field = page.getByRole('textbox', { name: label, exact: true });
    await field.fill(value);
    await field.press('Enter');
  }

  // Le capteur de CO2 rejoint le réseau du CDI.
  const palette = page.getByRole('complementary', { name: 'Palette d’équipements' });
  await palette.getByRole('button', { name: 'Câble' }).click();
  await page.locator('[aria-label^="Capteur CO2"]').click();
  await page.locator('[aria-label^="Switch CDI"]').click();
  await page.keyboard.press('Escape');
  await page.locator('[aria-label^="Capteur CO2"]').click();
  for (const [label, value] of [
    ['Adresse IP', '192.168.10.50'],
    ['Masque', '255.255.255.0'],
  ] as const) {
    const field = page.getByRole('textbox', { name: label, exact: true });
    await field.fill(value);
    await field.press('Enter');
  }

  // La route qui manque au Routeur Internet : celles de départ ne se retirent pas.
  await page.locator('[aria-label^="Routeur Internet"]').click();
  await expect(page.getByText('Équipement du réseau de départ.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Supprimer', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Routage' }).click();
  await page.getByRole('textbox', { name: 'Réseau de destination' }).fill('203.0.113.0');
  await page.getByRole('textbox', { name: 'Masque de la route' }).fill('255.255.255.0');
  await page.getByRole('textbox', { name: 'Passerelle de la route' }).fill('192.0.2.2');
  await page.getByRole('button', { name: 'Ajouter la route' }).click();
  await expect(page.getByRole('cell', { name: '203.0.113.0' })).toBeVisible();
  await shot(page, '65-college-musee-route');

  // Le site du musée, par son nom.
  await page.getByRole('radio', { name: /Simulation/ }).click();
  await page
    .getByRole('button', { name: /^Poste 1/ })
    .first()
    .click();
  await page
    .getByRole('dialog', { name: 'Bureau de Poste 1' })
    .getByRole('button', { name: 'Navigateur web' })
    .click();
  const browser = page.getByRole('dialog', { name: 'Navigateur web — Poste 1' });
  await browser.getByRole('textbox', { name: 'Adresse', exact: true }).fill('www.musee-des-reseaux.fr');
  await browser.getByRole('button', { name: 'Aller' }).click();
  await expect(browser.getByRole('heading', { name: 'Musée des réseaux' })).toBeVisible({ timeout: 30_000 });
  await shot(page, '66-college-musee-site');

  // Représenter des données : le fichier de mesures du capteur, puis la taille d'un texte.
  await browser
    .getByRole('textbox', { name: 'Adresse', exact: true })
    .fill('http://192.168.10.50/mesures.csv');
  await browser.getByRole('button', { name: 'Aller' }).click();
  await expect(browser).toContainText('heure;co2_ppm;temperature_c', { timeout: 30_000 });
  await expect(browser).toContainText('10:00;1150;');
  await browser.getByRole('button', { name: /Fermer/ }).click();
  await page
    .getByRole('dialog', { name: 'Bureau de Poste 1' })
    .getByRole('button', { name: /Fermer/ })
    .click();
  await page
    .getByRole('button', { name: /^Serveur\b(?! du musée)/ })
    .first()
    .click();
  const serverDesktop = page.getByRole('dialog', { name: 'Bureau de Serveur', exact: true });
  await serverDesktop.getByRole('button', { name: 'Explorateur de fichiers' }).click();
  const explorer = page.getByRole('dialog', { name: 'Explorateur de fichiers — Serveur', exact: true });
  for (const folder of ['Documents', '3A', 'Nora'])
    await explorer.getByRole('button', { name: folder }).click();
  await expect(explorer.getByRole('row', { name: /titre\.txt/ })).toContainText('5 octets');
  // Le dossier Commun est en lecture seule : le serveur refuse d'y créer un dossier.
  for (let up = 0; up < 2; up++) await explorer.getByRole('button', { name: '↑ Dossier parent' }).click();
  await expect(explorer.getByRole('button', { name: /Commun/ })).toContainText('lecture seule');
  await explorer.getByRole('button', { name: /Commun/ }).click();
  await explorer.getByRole('textbox', { name: 'Nom du dossier' }).fill('Essai');
  await explorer.getByRole('button', { name: 'Créer' }).click();
  await expect(explorer.getByRole('alert')).toContainText('Dossier en lecture seule : /Documents/Commun');
  await shot(page, '66b-college-musee-lecture-seule');
  await explorer.getByRole('button', { name: /Fermer/ }).click();
  await serverDesktop.getByRole('button', { name: /Fermer/ }).click();

  // Deux objets qui communiquent : mauvais port refusé, bon port, message écrit au journal.
  await page
    .getByRole('button', { name: /^Afficheur/ })
    .first()
    .click();
  const displayDesktop = page.getByRole('dialog', { name: 'Bureau de Afficheur' });
  await displayDesktop.getByRole('button', { name: 'Serveur écho' }).click();
  const echoServer = page.getByRole('dialog', { name: 'Serveur écho — Afficheur' });
  await echoServer.getByRole('button', { name: 'Démarrer' }).click();
  await displayDesktop.getByRole('button', { name: /Fermer/ }).click();
  await page
    .getByRole('button', { name: /^Capteur CO2/ })
    .first()
    .click();
  const sensorDesktop = page.getByRole('dialog', { name: 'Bureau de Capteur CO2' });
  await sensorDesktop.getByRole('button', { name: 'Client écho' }).click();
  await sensorDesktop.getByRole('button', { name: /Fermer/ }).click();
  const echoClient = page.getByRole('dialog', { name: 'Client écho — Capteur CO2' });
  await echoClient.getByRole('textbox', { name: 'Serveur' }).fill('192.168.10.51');
  await echoClient.getByRole('textbox', { name: 'Port' }).fill('8');
  await echoClient.getByRole('button', { name: 'Connecter' }).click();
  await expect(echoClient.getByRole('log')).toContainText('Connexion refusée', { timeout: 30_000 });
  await echoClient.getByRole('textbox', { name: 'Port' }).fill('7');
  await echoClient.getByRole('button', { name: 'Connecter' }).click();
  await expect(echoClient.getByRole('log')).toContainText('Connecté à 192.168.10.51:7', { timeout: 30_000 });
  await echoClient.getByRole('textbox', { name: 'Message' }).fill('CO2:1150');
  await echoClient.getByRole('button', { name: 'Envoyer' }).click();
  await expect(echoClient.getByRole('log')).toContainText('← CO2:1150', { timeout: 30_000 });
  await expect(echoServer).toContainText('192.168.10.50 : CO2:1150');
  await shot(page, '67-college-musee-objets');
  await echoClient.getByRole('button', { name: /Fermer/ }).click();
  await echoServer.getByRole('button', { name: /Fermer/ }).click();
  await page.getByRole('radio', { name: /Conception/ }).click();

  // Le fichier rendu garde la réponse et la route ajoutée.
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('dialog', { name: 'Enregistrer le projet' })
    .getByRole('button', { name: 'Enregistrer' })
    .click();
  const text = readFileSync(await (await download).path(), 'utf8');
  const saved = JSON.parse(text) as { work: { answers: Partial<Record<string, { right: boolean | null }>> } };
  expect(saved.work.answers['q-lan']?.right).toBe(true);
  // La première réponse reste la note ; le nouvel essai est gardé à côté.
  expect(saved.work.answers['q-terminaux']).toMatchObject({ right: false, retry: { right: true, tries: 1 } });
  expect(text).toContain('203.0.113.0');
});

test('corrigé du professeur : absent pour les élèves, ouvert avec « ?prof » dans l’adresse', async ({
  page,
}) => {
  // L'adresse des élèves : rien ne mène au corrigé.
  await page.getByRole('button', { name: 'Activités' }).click();
  const list = page.getByRole('dialog', { name: 'Activités' });
  await expect(list.getByRole('button', { name: 'Commencer : Du collège au musée' })).toBeVisible();
  await expect(list.getByRole('button', { name: /^Corrigé/ })).toHaveCount(0);
  await expect(page.getByText('Mode professeur')).toHaveCount(0);

  await page.goto('/?prof');
  await expect(page.getByText('Mode professeur')).toBeVisible();
  await page.getByRole('button', { name: 'Activités' }).click();
  await page
    .getByRole('dialog', { name: 'Activités' })
    .getByRole('button', { name: 'Corrigé : Du collège au musée' })
    .click();
  const key = page.getByRole('dialog', { name: 'Corrigé (professeur)' });
  await expect(key.getByRole('heading', { name: 'Corrigé — Du collège au musée' })).toBeVisible();
  await expect(key.getByRole('img', { name: 'Plan du réseau' })).toBeVisible();
  await expect(key.getByRole('heading', { name: 'Déroulement' })).toBeVisible();
  await expect(key).toContainText('Réponse attendue : un réseau local (LAN)');
  await expect(key).toContainText('passerelle 192.0.2.2 (le Routeur du data center), interface eth0');
  await shot(page, '68-corrige-professeur');
  await key.getByRole('heading', { name: 'Déroulement' }).scrollIntoViewIfNeeded();
  await shot(page, '68a-corrige-deroulement');
  await key.getByRole('heading', { name: /^11\. Réparer le chemin/ }).scrollIntoViewIfNeeded();
  await shot(page, '68b-corrige-etape');

  // La version à distribuer aux élèves : la correction seule.
  await key.getByRole('button', { name: 'Élèves' }).click();
  await expect(key.getByRole('heading', { name: 'Correction — Du collège au musée' })).toBeVisible();
  await expect(key.getByRole('heading', { name: 'Déroulement' })).toHaveCount(0);
  await expect(key).not.toContainText('Indices, donnés un par un');
  await expect(key).toContainText('Explication : Il relie les équipements d’un même lieu');
  await shot(page, '68c-correction-eleves');
  await key.getByRole('button', { name: 'Professeur', exact: true }).click();

  // À l'impression, le corrigé part seul : le reste de l'écran est masqué.
  await page.emulateMedia({ media: 'print' });
  await page.addScriptTag({ content: "document.body.dataset.print = 'answers';" });
  const printed = page.locator('.print-root.print-answers');
  await expect(printed).toBeVisible();
  await expect(page.locator('#root')).toBeHidden();
  // Les sauts de page sont choisis : le plan sur une page en paysage, le déroulement
  // sur la sienne, une page par partie, et rien de coupé dans une question.
  await expect(printed.locator('.key-front-plan')).toHaveCSS('page', 'key-plan');
  await expect(printed.locator('.key-schedule')).toHaveCSS('break-after', 'page');
  const parts = printed.locator('.key-part');
  await expect(parts).toHaveCount(4);
  await expect(parts.nth(0)).toHaveCSS('break-before', 'auto');
  for (const index of [1, 2, 3]) await expect(parts.nth(index)).toHaveCSS('break-before', 'page');
  await expect(printed.locator('.key-item').first()).toHaveCSS('break-inside', 'avoid');
  await expect(printed.locator('.key-step-head').first()).toHaveCSS('break-inside', 'avoid');
  await expect(printed.locator('.key-step-head').first()).toHaveCSS('break-after', 'avoid');
  await expect(printed.locator('.key-hints-box').first()).toHaveCSS('break-before', 'avoid');

  // Le PDF du professeur : la page du plan, celle du déroulement, puis les parties.
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  const pages = [...pdf.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/g)].map(
    ([, width, height]) => Number(width) > Number(height),
  );
  expect(pages.length).toBeGreaterThan(8);
  // Seule la première page est en paysage.
  expect(pages.indexOf(true)).toBe(0);
  expect(pages.filter(Boolean)).toHaveLength(1);
});

test('écran de 1366 × 768 : plan lisible, activité sur toute la hauteur, réglages réductibles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Activités' }).click();
  await page.getByRole('button', { name: 'Commencer : Du collège au musée' }).click();
  await page.getByRole('button', { name: 'Fermer le message' }).click();
  const activity = page.getByRole('complementary', { name: 'Activité' });
  const settings = page.getByRole('contentinfo');
  const plan = page.getByRole('application', { name: 'Plan du réseau' });
  const boxOf = async (locator: Locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error('élément introuvable');
    return box;
  };
  const bottomOf = async (locator: Locator) => {
    const box = await boxOf(locator);
    return Math.round(box.y + box.height);
  };

  // Les deux « Vérifier » ne se confondent plus : celui de la barre porte le nom de sa
  // fenêtre, et la barre tient toujours sur une ligne, compteur compris.
  await expect(page.getByRole('button', { name: /^Vérifier le réseau : \d+ points repérés$/ })).toBeVisible();
  await expect(activity.getByRole('button', { name: 'Vérifier mon travail' })).toBeVisible();
  expect((await boxOf(page.getByRole('banner'))).height).toBeLessThan(60);
  await page.getByRole('radio', { name: /Simulation/ }).click();
  expect((await boxOf(page.getByRole('banner'))).height).toBeLessThan(60);
  await page.getByRole('radio', { name: /Conception/ }).click();

  // « Vérifier mon travail » répond toujours, même quand il n'a rien à valider.
  await activity.getByRole('button', { name: 'Vérifier mon travail' }).click();
  await expect(activity.getByRole('status').filter({ hasText: 'Vérifié' })).toContainText(
    'rien de plus à valider avec ce bouton pour l’instant',
  );
  await shot(page, '69c-ecran-1366-verifier');

  // Tout le plan tient dans la zone visible, donc fortement réduit…
  const zoom = page.getByRole('group', { name: 'Zoom du plan' });
  const percent = Number((/(\d+) %/.exec(await zoom.innerText()) ?? [])[1]);
  expect(percent).toBeLessThan(65);
  // …mais les noms et les adresses restent lisibles : 11 px à l'écran au lieu de 7,5.
  // La boîte mesurée compte le liseré clair autour des lettres : 19 px de haut pour
  // un nom, contre 14 quand le texte suivait le zoom.
  for (const text of ['Poste 1', '192.168.10.1', 'eth0']) {
    const line = await boxOf(plan.getByText(text, { exact: true }).first());
    expect(line.height, text).toBeGreaterThanOrEqual(text === 'eth0' ? 15 : 17);
  }
  await shot(page, '69-ecran-1366-depart');

  // La consigne se lit d'abord ; « Commencer » la replie et la première étape est à l'écran.
  await activity.getByRole('button', { name: 'Commencer', exact: true }).click();
  await expect(activity.getByText('Les questions se corrigent tout de suite')).toBeHidden();
  await expect(activity.getByRole('button', { name: /Le réseau du CDI/ })).toBeInViewport();
  await expect(activity.getByText('Le réseau du CDI est…')).toBeInViewport();

  // Un poste sélectionné : ses réglages s'ouvrent sous le plan, sans rien prendre à l'activité.
  const full = await boxOf(activity);
  expect(await bottomOf(activity)).toBe(768);
  await page.locator('[aria-label^="Poste 2"]').click();
  await expect(settings.getByRole('textbox', { name: 'Nom' })).toHaveValue('Poste 2');
  expect((await boxOf(activity)).height).toBe(full.height);
  expect(Math.round((await boxOf(settings)).x + (await boxOf(settings)).width)).toBe(Math.round(full.x));
  // Les trois rubriques tiennent côte à côte : la passerelle se règle sans faire défiler.
  await expect(settings.getByRole('textbox', { name: 'Passerelle' })).toBeInViewport({ ratio: 1 });
  await expect(activity.getByText('Le réseau du CDI est…')).toBeInViewport();
  await shot(page, '69a-ecran-1366-poste');

  // Réduits à une ligne, les réglages rendent sa hauteur au plan.
  const before = (await boxOf(page.getByRole('main'))).height;
  await settings.getByRole('button', { name: 'Réduire les réglages' }).click();
  await expect(settings).toContainText('Poste 2');
  await expect(settings).toContainText('Ordinateur · 192.168.1.2');
  expect((await boxOf(settings)).height).toBeLessThan(60);
  expect((await boxOf(page.getByRole('main'))).height).toBeGreaterThan(before + 200);
  await shot(page, '69b-ecran-1366-reglages-reduits');
  await settings.getByRole('button', { name: 'Afficher les réglages' }).click();
  await expect(settings.getByRole('textbox', { name: 'Nom' })).toHaveValue('Poste 2');

  // Un routeur : son tableau d'interfaces tient à côté de son nom.
  await page.locator('[aria-label^="Routeur du FAI"]').click();
  await expect(settings.getByRole('textbox', { name: 'IP eth1' })).toBeInViewport({ ratio: 1 });
});

test('simulation à 1366 × 768 : le bureau et le terminal laissent voir le chemin du paquet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Activités' }).click();
  await page.getByRole('button', { name: 'Commencer : Du collège au musée' }).click();
  await page.getByRole('button', { name: 'Fermer le message' }).click();
  await page.getByRole('radio', { name: /Simulation/ }).click();
  const terminal = await openTerminal(page, 'Poste 1');
  const desktop = page.getByRole('dialog', { name: 'Bureau de Poste 1' });
  await expect(terminal).toBeVisible();
  const boxOf = async (locator: Locator) => {
    const box = await locator.boundingBox();
    if (!box) throw new Error('élément introuvable');
    return box;
  };
  const windows = [await boxOf(desktop), await boxOf(terminal)];
  // Du CDI au musée : aucun équipement du chemin n'est sous une fenêtre.
  for (const name of [
    'Poste 1',
    'Switch CDI',
    'Routeur du collège',
    'Routeur du FAI',
    'Serveur DNS du FAI',
    'Routeur Internet',
    'Routeur du data center',
    'Switch data center',
    'Serveur du musée',
  ]) {
    const device = await boxOf(page.locator(`[aria-label^="${name}"]`));
    const covered = windows.some(
      (w) =>
        device.x < w.x + w.width &&
        w.x < device.x + device.width &&
        device.y < w.y + w.height &&
        w.y < device.y + device.height,
    );
    expect(covered, name).toBe(false);
  }
  // Les deux fenêtres tiennent dans la zone du plan, et le bureau reste attrapable :
  // sa barre de titre dépasse au-dessus du terminal.
  const stage = await boxOf(page.getByRole('main'));
  for (const w of windows) expect(w.y + w.height).toBeLessThanOrEqual(stage.y + stage.height);
  expect(windows[1].y).toBeGreaterThanOrEqual(windows[0].y + 24);
  await terminal.getByRole('textbox').fill('ping 203.0.113.80');
  await terminal.getByRole('textbox').press('Enter');
  await shot(page, '70-simulation-1366-terminal');

  // Déplacée à la main puis « rangée », une fenêtre retrouve cette place.
  const title = await boxOf(terminal.getByText('Ligne de commande — Poste 1'));
  await page.mouse.move(title.x + 20, title.y + 8);
  await page.mouse.down();
  await page.mouse.move(title.x - 200, title.y - 250, { steps: 5 });
  await page.mouse.up();
  expect((await boxOf(terminal)).y).toBeLessThan(windows[1].y - 100);
  await page.getByRole('button', { name: 'Ranger les fenêtres' }).click();
  expect(await boxOf(terminal)).toEqual(windows[1]);
});
