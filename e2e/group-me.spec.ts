import { test, expect } from '@playwright/test';

test.describe('paridad · /g/[slug]/me · jugador del grupo', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  test('ve su ficha (Jugador GT) en el grupo, con status 200', async ({ page }) => {
    const res = await page.goto('/g/grupo-test/me');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Jugador GT', exact: true })).toBeVisible();
  });

  test('muestra la cartera de La Timba bajo grupo, con enlace a /g/[slug]/me/tokens', async ({ page }) => {
    // Paridad 2b (Task 6): /me/tokens y /me/edit existen también bajo /g/[slug],
    // así que el enlace de la cartera ya no se gatea a la raíz (ver group-parity.spec.ts).
    await page.goto('/g/grupo-test/me');
    await expect(page.getByText('Mi cartera de La Timba')).toBeVisible();
    await expect(page.locator('a[href="/g/grupo-test/me/tokens"]')).toBeVisible();
  });
});

test.describe('paridad · /g/[slug]/me · gating de sesión', () => {
  test('sin sesión → redirect a /login', async ({ page }) => {
    await page.goto('/g/grupo-test/me');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('paridad · /g/[slug]/me · gating de ficha (admin de Lomeros, sin ficha en el grupo)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('200 con mensaje de bienvenida; NO muestra la ficha ajena gt-pl1', async ({ page }) => {
    const res = await page.goto('/g/grupo-test/me');
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/no está vinculada a un jugador de este grupo/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Jugador GT', exact: true })).toHaveCount(0);
  });
});
