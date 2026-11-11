import { expect, test, type Page } from '@playwright/test';

/* Mode intégré : une page hôte (servie par le test) affiche RéseauLab dans une
 * iframe, lui envoie l'init et garde les messages reçus. */

interface Received {
  readonly type: string;
  readonly projet?: string;
  readonly progression?: number;
  readonly resume?: string;
}

function hostPage(init: Record<string, unknown>): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Hôte</title>
<style>body{margin:0}iframe{display:block;width:100vw;height:100vh;border:0}</style></head>
<body><iframe title="RéseauLab" src="/?integre=1"></iframe>
<script>
  window.recus = [];
  const frame = document.querySelector('iframe');
  let sent = false;
  addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || !e.data || e.data.reseaulab !== 1) return;
    window.recus.push(e.data);
    if (e.data.type === 'pret' && !sent) {
      sent = true;
      frame.contentWindow.postMessage({ reseaulab: 1, type: 'init', ...${JSON.stringify(init)} }, location.origin);
    }
  });
</script></body></html>`;
}

async function openHost(page: Page, init: Record<string, unknown>) {
  await page.route('**/hote.html', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: hostPage(init) }),
  );
  await page.goto('/hote.html');
  return page.frameLocator('iframe[title="RéseauLab"]');
}

function received(page: Page): Promise<Received[]> {
  return page.evaluate(() => (globalThis as unknown as { recus: Received[] }).recus);
}

async function lastState(page: Page): Promise<Received | undefined> {
  return (await received(page)).filter((m) => m.type === 'etat').pop();
}

test('mode intégré : l’élève travaille, l’application garde le travail puis le redonne', async ({ page }) => {
  let app = await openHost(page, { activite: 'salle-techno', eleve: { name: 'Léa, Tom' } });
  const panel = app.getByRole('complementary', { name: 'Activité' });
  await expect(panel.getByRole('heading', { name: 'Partie 1 — Ce que je sais depuis la 5e' })).toBeVisible();
  await expect(panel).toContainText('Ton travail est enregistré automatiquement');
  for (const name of ['Nouveau', 'Ouvrir…', 'Enregistrer', 'Activités'])
    await expect(app.getByRole('button', { name, exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Quitter l’activité' })).toHaveCount(0);
  await expect.poll(async () => (await lastState(page))?.resume).toMatch(/^Étape 1\/\d+ · 0\/\d+ objectifs$/);

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
  await expect.poll(async () => (await lastState(page))?.resume).toContain('1/1 bonnes réponses');
  const state = await lastState(page);
  expect(state?.progression).toBeGreaterThan(0);
  expect(JSON.parse(state?.projet ?? '{}')).toMatchObject({ work: { student: { name: 'Léa, Tom' } } });

  // Au cours suivant : l'application redonne le travail, la réponse est toujours là.
  await page.unrouteAll();
  app = await openHost(page, { projet: state?.projet });
  const again = app
    .getByRole('complementary', { name: 'Activité' })
    .getByRole('region', { name: 'Question : À quoi sert le réseau' });
  await expect(again).toContainText('✔ Bonne réponse !');
});

test('mode intégré : le professeur consulte sans rien renvoyer, et peut télécharger', async ({ page }) => {
  await openHost(page, { activite: 'salle-techno' });
  await expect.poll(async () => (await lastState(page))?.projet).toBeDefined();
  const projet = (await lastState(page))?.projet;

  await page.unrouteAll();
  const app = await openHost(page, { projet, consultation: true, nom: 'Groupe 3' });
  await expect(app.getByText('Consultation : les modifications ne sont pas enregistrées')).toBeVisible();
  await app.getByRole('radio', { name: /Simulation/ }).click();
  await page.waitForTimeout(2500);
  expect((await received(page)).filter((m) => m.type === 'etat')).toHaveLength(0);

  await app.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const download = page.waitForEvent('download');
  await app.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  expect((await download).suggestedFilename()).toBe('Groupe 3.reseaulab.json');
});
