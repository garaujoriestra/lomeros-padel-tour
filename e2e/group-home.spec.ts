import { test, expect } from '@playwright/test';

test.describe('paridad · home de grupo /g/[slug]', () => {
  test('muestra el nombre y los jugadores del grupo, no de Lomeros', async ({ page }) => {
    const res = await page.goto('/g/grupo-test');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Grupo Test' })).toBeVisible();
    await expect(page.getByText('Jugador GT', { exact: false }).first()).toBeVisible();
  });

  test('el chrome de grupo enlaza dentro del grupo (marca → /g/grupo-test)', async ({ page }) => {
    await page.goto('/g/grupo-test');
    const brand = page.getByRole('link', { name: /Inicio/i }).first();
    await expect(brand).toHaveAttribute('href', '/g/grupo-test');
  });

  test('/g/lomeros redirige a la raíz', async ({ page }) => {
    await page.goto('/g/lomeros');
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('slug inexistente → 404', async ({ page }) => {
    const res = await page.goto('/g/no-existe');
    expect(res?.status()).toBe(404);
  });
});
