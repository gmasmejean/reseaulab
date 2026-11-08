import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
