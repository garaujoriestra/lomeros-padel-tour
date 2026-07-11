import { test, expect } from '@playwright/test';

test.describe('dev-login endpoint (API)', () => {
  test('forja sesión para usuario existente y emite cookie session', async ({ request }) => {
    const res = await request.post('/api/auth/dev-login', { data: { email: 'pl1@test.com' } });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.userId).toBeTruthy();
    const setCookies = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
    expect(setCookies.some((h) => h.value.startsWith('session='))).toBe(true);
  });

  test('crea usuario nuevo (sin membership) para email desconocido', async ({ request }) => {
    const email = 'nuevo-api@test.com';
    const res = await request.post('/api/auth/dev-login', { data: { email } });
    expect(res.status()).toBe(200);
    expect((await res.json()).userId).toBeTruthy();
  });

  test('400 si falta email', async ({ request }) => {
    const res = await request.post('/api/auth/dev-login', { data: {} });
    expect(res.status()).toBe(400);
  });
});

test.describe('dev-login página (UI)', () => {
  test('entrar como usuario existente deja sesión activa', async ({ page }) => {
    await page.goto('/dev-login');
    await expect(page.getByRole('heading', { name: 'Dev login' })).toBeVisible();
    await page.getByRole('button', { name: /pl1@test\.com/ }).click();
    // Paso C: aterrizaje grupo-hogar (miembro de Lomeros → /me).
    await expect(page).toHaveURL(/\/me$/);
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === 'session')).toBe(true);
  });

  test('entrar como nuevo crea el usuario y lo lista al recargar', async ({ page }) => {
    const email = 'nuevo-ui@test.com';
    await page.goto('/dev-login');
    await page.getByLabel('Email nuevo').fill(email);
    await page.getByRole('button', { name: 'Entrar como nuevo' }).click();
    // Paso C: sin membership → /me (bienvenida).
    await expect(page).toHaveURL(/\/me$/);
    await page.goto('/dev-login');
    await expect(page.getByRole('button', { name: new RegExp(email) })).toBeVisible();
  });
});
