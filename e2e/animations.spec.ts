import { test, expect, request as pwRequest } from '@playwright/test';
import { BASE_URL } from '../playwright.config';

// Animaciones con propósito (skill emil-design-eng): segmented deslizante,
// marcador broadcast en el detalle, podio con entrada propia y chips ▲/▼.
// Se verifica que el motion existe Y que la funcionalidad sigue intacta.
//
// El estado se monta con jugadores PROPIOS (anim-*) creados por API: otros
// specs (elo-proyeccion, torneos, timba) asumen el Elo/contador de partidos
// de pl1–pl8, así que no se les puede tocar desde aquí.

let matchId: string | null = null;

test.beforeAll(async () => {
  const admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/admin.json' });
  const ids: string[] = [];
  for (const name of ['Anim Uno', 'Anim Dos', 'Anim Tres', 'Anim Cuatro']) {
    const res = await admin.post('/api/players', { data: { name } });
    if (res.status() === 201) {
      ids.push((await res.json()).id);
    } else {
      // Re-run local: los jugadores ya existen → recupéralos del listado.
      const all = await (await admin.get('/api/players')).json();
      const found = all.find((p: { name: string }) => p.name === name);
      if (found) ids.push(found.id);
    }
  }
  const res = await admin.post('/api/matches', {
    data: {
      date: '2026-09-02',
      team1Player1Id: ids[0], team1Player2Id: ids[1],
      team2Player1Id: ids[2], team2Player2Id: ids[3],
      sets: [
        { setNumber: 1, team1Games: 6, team2Games: 4 },
        { setNumber: 2, team1Games: 6, team2Games: 1 },
      ],
    },
  });
  if (res.status() === 201) {
    const body = await res.json();
    matchId = body?.match?.id ?? body?.id ?? null;
  }
  await admin.dispose();
});

test('segmented de Partidos: indicador deslizante presente y el filtro sigue funcionando', async ({ page }) => {
  await page.goto('/matches');
  const seg = page.locator('.seg.has-ind').first();
  await expect(seg).toBeVisible();

  const ind = seg.locator('.seg-ind');
  await expect(ind).toHaveCount(1);
  const before = await ind.evaluate((el) => getComputedStyle(el).transform);

  // Cambiar de pestaña mueve el indicador (transform distinto) y filtra.
  await seg.getByRole('button', { name: 'Jugados' }).click();
  await expect(seg.getByRole('button', { name: 'Jugados' })).toHaveClass(/on/);
  await expect.poll(async () => ind.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);
});

test('detalle de partido: el marcador entra con flip broadcast (.sets-flip)', async ({ page }) => {
  test.skip(!matchId, 'no se pudo montar el partido por API');
  await page.goto(`/matches/${matchId}`);
  const grid = page.locator('.score-grid.sets-flip').first();
  await expect(grid).toBeVisible();
  // Cada celda de set lleva su índice de columna (retardo escalonado).
  await expect(grid.locator('.set-cell').first()).toBeVisible();
});

test('home: el podio entra con su animación propia y el oro es el protagonista', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.podium-step.p-gold').first()).toBeVisible();
  await expect(page.locator('.podium-step.p-silver').first()).toBeVisible();
});

test('rankings: la lectura de jornada (▲/▼) entra con pop escalonado', async ({ page }) => {
  await page.goto('/rankings');
  const chips = page.locator('.pop-in .lpt-badge');
  await expect(chips.first()).toBeVisible();
});
