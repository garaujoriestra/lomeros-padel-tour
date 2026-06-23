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
