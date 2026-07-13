import { test, expect } from '@playwright/test';

// Reutiliza el patrón dev-login de onboarding.spec: cada test mint una cuenta fresca.
async function loginFresh(request: import('@playwright/test').APIRequestContext, tag: string) {
  const email = `padelo-${tag}-${Date.now()}@test.com`;
  const res = await request.post('/api/auth/dev-login', { data: { email } });
  expect(res.status()).toBe(200);
}

test.describe('alta abierta (create-group)', () => {
  test('con sesión y SIN token → 200 y crea el grupo', async ({ request }) => {
    await loginFresh(request, 'open');
    const slug = `open-${Date.now()}`;
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'Grupo Abierto', slug }, // <-- sin `t`
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).slug).toBe(slug);
  });

  test('sin sesión → 401', async ({ request }) => {
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'X', slug: `nope-${Date.now()}` },
    });
    expect(res.status()).toBe(401);
  });

  test('cap por cuenta: al superar el máximo → 429', async ({ request }) => {
    await loginFresh(request, 'cap');
    for (let i = 0; i < 5; i++) {
      const res = await request.post('/api/onboarding/create-group', {
        data: { name: `Cap ${i}`, slug: `cap-${i}-${Date.now()}` },
      });
      expect(res.status()).toBe(200);
    }
    const over = await request.post('/api/onboarding/create-group', {
      data: { name: 'Cap 6', slug: `cap-6-${Date.now()}` },
    });
    expect(over.status()).toBe(429);
  });
});
