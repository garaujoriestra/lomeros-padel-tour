import { test, expect } from '@playwright/test';

// Paso C: aterrizaje "grupo-hogar" post-login. El dev-login usa el mismo resolutor que el
// callback OAuth (homePathForUser): miembro del grupo por defecto → /me; miembro de OTRO
// grupo → /g/<slug>/me; usuario sin membership → /me (bienvenida).

test.describe('paso C · aterrizaje grupo-hogar (vía dev-login UI)', () => {
  test('miembro de Lomeros aterriza en /me', async ({ page }) => {
    await page.goto('/dev-login');
    await page.getByRole('button', { name: /pl1@test\.com/ }).first().click();
    await expect(page).toHaveURL(/\/me$/);
  });

  test('admin de grupo-test aterriza en /g/grupo-test/me', async ({ page }) => {
    await page.goto('/dev-login');
    await page.getByRole('button', { name: /gt-admin@test\.com/ }).first().click();
    await expect(page).toHaveURL(/\/g\/grupo-test\/me$/);
  });

  test('usuario nuevo sin membership aterriza en /me (bienvenida)', async ({ page }) => {
    await page.goto('/dev-login');
    await page.getByLabel('Email nuevo').fill(`landing-${Date.now()}@test.com`);
    await page.getByRole('button', { name: 'Entrar como nuevo' }).click();
    await expect(page).toHaveURL(/\/me$/);
  });
});

test.describe('paso C · el API de dev-login expone home', () => {
  test('gt-player → /g/grupo-test/me; pl1 → /me', async ({ request }) => {
    const gt = await request.post('/api/auth/dev-login', { data: { email: 'gt-player@test.com' } });
    expect((await gt.json()).home).toBe('/g/grupo-test/me');
    const pl1 = await request.post('/api/auth/dev-login', { data: { email: 'pl1@test.com' } });
    expect((await pl1.json()).home).toBe('/me');
  });
});
