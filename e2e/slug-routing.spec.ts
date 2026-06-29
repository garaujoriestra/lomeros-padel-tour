import { test, expect } from '@playwright/test';

test.describe('slug routing · /g/[slug] (Paso A)', () => {
  test('/g/grupo-test renderiza la landing del grupo con sus datos', async ({ page }) => {
    const res = await page.goto('/g/grupo-test');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Grupo Test' })).toBeVisible();
    await expect(page.getByText('Jugador GT', { exact: false }).first()).toBeVisible();
  });

  test('un slug inexistente da 404', async ({ page }) => {
    const res = await page.goto('/g/no-existe-este-grupo');
    expect(res?.status()).toBe(404);
  });

  test('un slug reservado da 404', async ({ page }) => {
    const res = await page.goto('/g/api');
    expect(res?.status()).toBe(404);
  });

  test('/g/lomeros redirige a la raíz (canónico único)', async ({ page }) => {
    await page.goto('/g/lomeros');
    expect(new URL(page.url()).pathname).toBe('/');
  });
});
