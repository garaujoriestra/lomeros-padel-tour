import { test, expect } from '@playwright/test';

// Corrección de un resultado ya registrado (/admin/matches/[id]/edit +
// PATCH /api/matches/[id]/result): juegos (sin cambiar ganador) y foto.
// Estado por API, aserciones de interacción por UI (patrón de la suite).
// Usa pl5..pl8: pl1..pl4 deben seguir con 0 partidos completados cuando
// corra elo-proyeccion.spec.ts (asume equipos a 1500 Elo / 0 jugados).

const FAKE_PHOTO = 'https://e2e.public.blob.vercel-storage.com/match-photos/e2e-foto.jpg';

async function createCompletedMatch(
  request: import('@playwright/test').APIRequestContext,
  date: string,
): Promise<string> {
  const res = await request.post('/api/matches', {
    data: {
      date,
      team1Player1Id: 'pl5', team1Player2Id: 'pl6',
      team2Player1Id: 'pl7', team2Player2Id: 'pl8',
      sets: [
        { setNumber: 1, team1Games: 6, team2Games: 3 },
        { setNumber: 2, team1Games: 6, team2Games: 4 },
      ],
    },
  });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  return id;
}

test.describe('corregir resultado · como admin', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('corrige los juegos de un partido registrado desde la UI', async ({ page }) => {
    const id = await createCompletedMatch(page.request, '2026-09-10');

    // El listado de admin ofrece "Editar" en los completados.
    await page.goto('/admin/matches');
    await expect(page.locator(`a[href="/admin/matches/${id}/edit"]`).filter({ visible: true })).toBeVisible();

    await page.goto(`/admin/matches/${id}/edit`);
    const inputs = page.locator('input[type="number"]').filter({ visible: true });
    await expect(inputs).toHaveCount(4);

    // Set 2: de 6-4 a 7-5 (el ganador no cambia).
    await inputs.nth(2).fill('7');
    await inputs.nth(3).fill('5');
    await page.getByRole('button', { name: 'Guardar corrección' }).click();
    await page.waitForURL('**/admin/matches');

    // La corrección persistió: la página de edición muestra los juegos nuevos…
    await page.goto(`/admin/matches/${id}/edit`);
    const after = page.locator('input[type="number"]').filter({ visible: true });
    await expect(after.nth(2)).toHaveValue('7');
    await expect(after.nth(3)).toHaveValue('5');

    // …y la API devuelve los sets corregidos.
    const res = await page.request.get(`/api/matches/${id}`);
    const match = (await res.json()) as { sets: { setNumber: number; team1Games: number; team2Games: number }[]; winnerTeam: number };
    expect(match.winnerTeam).toBe(1);
    expect(match.sets.find((s) => s.setNumber === 2)).toMatchObject({ team1Games: 7, team2Games: 5 });
  });

  test('sube una foto a un partido ya registrado (y la puede quitar)', async ({ page }) => {
    const id = await createCompletedMatch(page.request, '2026-09-11');

    // El upload real va a Vercel Blob: aquí se intercepta y devuelve una URL fija.
    await page.route('**/api/upload/match-photo', (route) =>
      route.fulfill({ json: { url: FAKE_PHOTO } }),
    );

    await page.goto(`/admin/matches/${id}/edit`);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('e2e-fake-jpeg'),
    });
    await expect(page.getByText('Foto subida').first()).toBeVisible();
    await page.getByRole('button', { name: 'Guardar corrección' }).click();
    await page.waitForURL('**/admin/matches');

    // La página pública del partido muestra la foto.
    await page.goto(`/matches/${id}`);
    const photo = page.getByAltText(/Foto del partido/).filter({ visible: true });
    await expect(photo).toBeVisible();
    expect(await photo.getAttribute('src')).toContain(encodeURIComponent(FAKE_PHOTO));

    // Quitar la foto desde la misma página de edición.
    await page.goto(`/admin/matches/${id}/edit`);
    await page.getByRole('button', { name: 'Quitar foto' }).click();
    await page.getByRole('button', { name: 'Guardar corrección' }).click();
    await page.waitForURL('**/admin/matches');

    const res = await page.request.get(`/api/matches/${id}`);
    const match = (await res.json()) as { photoUrl: string | null };
    expect(match.photoUrl).toBeNull();
  });

  test('una corrección que cambia el ganador se rechaza (UI avisa, API 400)', async ({ page }) => {
    const id = await createCompletedMatch(page.request, '2026-09-12');

    // UI: marcador invertido → aviso y botón deshabilitado.
    await page.goto(`/admin/matches/${id}/edit`);
    const inputs = page.locator('input[type="number"]').filter({ visible: true });
    await inputs.nth(0).fill('3');
    await inputs.nth(1).fill('6');
    await inputs.nth(2).fill('4');
    await inputs.nth(3).fill('6');
    await expect(page.getByText('cambiaría el equipo ganador').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar corrección' })).toBeDisabled();

    // API: mismo intento directo → 400 y los sets originales quedan intactos.
    const res = await page.request.patch(`/api/matches/${id}/result`, {
      data: {
        sets: [
          { setNumber: 1, team1Games: 3, team2Games: 6 },
          { setNumber: 2, team1Games: 4, team2Games: 6 },
        ],
      },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('ganador');

    const check = await page.request.get(`/api/matches/${id}`);
    const match = (await check.json()) as { sets: { team1Games: number; team2Games: number }[] };
    expect(match.sets[0]).toMatchObject({ team1Games: 6, team2Games: 3 });
  });

  test('no se puede corregir un partido sin resultado (400)', async ({ page }) => {
    const res = await page.request.post('/api/matches', {
      data: {
        date: '2026-09-13',
        team1Player1Id: 'pl5', team1Player2Id: 'pl6',
        team2Player1Id: 'pl7', team2Player2Id: 'pl8',
      },
    });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const patch = await page.request.patch(`/api/matches/${id}/result`, {
      data: { photoUrl: FAKE_PHOTO },
    });
    expect(patch.status()).toBe(400);

    // Limpieza: que no quede un programado colgando para otros specs.
    await page.request.delete(`/api/matches/${id}`);
  });
});

test.describe('corregir resultado · authz por grupo', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('un admin de Lomeros NO puede corregir un partido de grupo-test (403)', async ({ request }) => {
    const res = await request.patch('/api/matches/gt-match1/result', {
      data: { g: 'grupo-test', photoUrl: FAKE_PHOTO },
    });
    expect(res.status()).toBe(403);
  });
});
