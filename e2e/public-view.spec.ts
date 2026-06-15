import { test, expect } from '@playwright/test';
import { newAdminRequest, setupGeneratedTournament } from './helpers';

test.describe('vista pública (anónima)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('muestra parrilla en solo lectura, sin botones de resultado', async ({ page, playwright }) => {
    const admin = await newAdminRequest(playwright);
    const id = await setupGeneratedTournament(admin, 'E2E Pública');
    await admin.dispose();

    await page.goto(`/tournaments/${id}`);
    await expect(page.getByRole('heading', { name: 'E2E Pública' })).toBeVisible();
    await expect(page.getByText('Jugador 1').first()).toBeVisible();
    // Solo lectura: no hay botones de "Resultado".
    await expect(page.getByRole('button', { name: 'Resultado' })).toHaveCount(0);
  });
});

test.describe('vista pública (jugador logueado)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('resalta "Tu próximo partido" al participante', async ({ page, playwright }) => {
    const admin = await newAdminRequest(playwright);
    const id = await setupGeneratedTournament(admin, 'E2E Próximo');
    await admin.dispose();

    await page.goto(`/tournaments/${id}`);
    // En dev, Next deja una copia oculta del árbol en un <div hidden> (streaming),
    // así que apuntamos a la tarjeta visible dentro de <main>.
    const card = page.getByRole('main').getByText('Tu próximo partido');
    await expect(card).toBeVisible();
  });
});
