import { test, expect, request as pwRequest } from '@playwright/test';
import { BASE_URL } from '../playwright.config';

// Fixes del critique de home/rankings y perfil: el ranking sabe quién eres
// («Tu posición»), y la ficha de jugador se puede compartir y tiene volver.

test.describe('ranking · con sesión de jugador (pl1)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('«Tu posición: #N» y la fila destacada con «tú» tras jugar un partido', async ({ page }) => {
    // Asegura que pl1 tiene al menos un partido completado (montado vía API
    // como admin: crear partidos exige requireGroupAdmin).
    const admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/admin.json' });
    const res = await admin.post('/api/matches', {
      data: {
        date: '2026-09-01',
        team1Player1Id: 'pl1', team1Player2Id: 'pl2',
        team2Player1Id: 'pl3', team2Player2Id: 'pl4',
        sets: [
          { setNumber: 1, team1Games: 6, team2Games: 2 },
          { setNumber: 2, team1Games: 6, team2Games: 3 },
        ],
      },
    });
    expect(res.status()).toBe(201);
    await admin.dispose();

    await page.goto('/rankings');
    await expect(page.getByText(/Tu posición: #\d+/).first()).toBeVisible();
    await expect(page.getByText('tú', { exact: true }).first()).toBeVisible();
  });

  test('el perfil tiene volver al ranking y botón de compartir la ficha', async ({ page }) => {
    await page.goto('/players/pl1');
    await expect(page.getByRole('link', { name: /Ranking/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compartir ficha' }).first()).toBeVisible();
  });
});
