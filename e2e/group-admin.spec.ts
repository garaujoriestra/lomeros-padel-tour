import { test, expect } from '@playwright/test';

// Nota de estado compartido: players-scoping.spec.ts crea 'Nuevo GT' en grupo-test;
// aquí se usa 'Alta Paso3 GT' para no chocar. gt-match1 (scheduled) nunca se muta
// (los intentos cross-grupo de otros specs se rechazan con 403/404).

test.describe('paridad · /g/[slug]/admin · admin del grupo (gt-admin)', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('dashboard 200 con contadores; sin acciones a sub-rutas diferidas', async ({ page }) => {
    const res = await page.goto('/g/grupo-test/admin');
    expect(res?.status()).toBe(200);
    // .first(): el dev server de Next puede dejar una copia <div hidden> de la página
    // en el DOM (flake documentado) que rompe el strict mode sin afectar al usuario.
    await expect(page.getByRole('heading', { name: 'Administración' }).first()).toBeVisible();
    await expect(page.getByText('Partidos jugados', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Añadir jugador|Registrar partido|Notificaciones/ })).toHaveCount(0);
  });

  test('players lista jugadores del grupo, no de Lomeros; con alta/edición (Task 10)', async ({ page }) => {
    await page.goto('/g/grupo-test/admin/players');
    await expect(page.getByText('Jugador GT', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Jugador 1', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Nuevo' }).first()).toBeVisible();
    await expect(page.getByLabel(/^Editar a /).first()).toBeVisible();
  });

  test('crear jugador vía API (body.g), verlo en la lista y borrarlo (?g=)', async ({ page, request }) => {
    // Nombre único por run: el dev server (y su DB de fichero) se reutiliza en local,
    // así que un nombre fijo dejaría duplicados entre runs.
    const name = `Alta Paso3 GT ${Date.now()}`;
    const res = await request.post('/api/players', { data: { g: 'grupo-test', name } });
    expect(res.ok()).toBeTruthy();
    const created = await res.json();
    await page.goto('/g/grupo-test/admin/players');
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    // Limpieza vía la misma API group-aware que usa DeletePlayerButton bajo grupo.
    const del = await request.delete(`/api/players/${created.id}?g=grupo-test`);
    expect(del.ok()).toBeTruthy();
  });

  test('matches lista el partido del grupo; sin nuevo/resultado/lados', async ({ page }) => {
    await page.goto('/g/grupo-test/admin/matches');
    await expect(page.getByRole('heading', { name: 'Partidos', exact: true })).toBeVisible();
    await expect(page.getByText('Jugador GT', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^(Partido|Resultado|Lados)$/ })).toHaveCount(0);
  });
});

test.describe('paridad · /g/[slug]/admin · gating de rol por grupo', () => {
  test.describe('admin de Lomeros (ajeno al grupo)', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });
    test('redirige a /g/grupo-test/me', async ({ page }) => {
      await page.goto('/g/grupo-test/admin');
      await expect(page).toHaveURL(/\/g\/grupo-test\/me$/);
    });
  });

  test.describe('jugador del grupo (no admin)', () => {
    test.use({ storageState: 'e2e/.auth/gt-player.json' });
    test('redirige a /g/grupo-test/me', async ({ page }) => {
      await page.goto('/g/grupo-test/admin/players');
      await expect(page).toHaveURL(/\/g\/grupo-test\/me$/);
    });
  });

  test.describe('sin sesión', () => {
    test('redirige a /login', async ({ page }) => {
      await page.goto('/g/grupo-test/admin');
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
