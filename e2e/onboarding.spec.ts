// e2e/onboarding.spec.ts
import { test, expect } from '@playwright/test';
import { SignJWT } from 'jose';
import { TEST_ENV } from '../playwright.config';

const key = new TextEncoder().encode(TEST_ENV.AUTH_SECRET);

async function inviteToken(exp = '7d') {
  return new SignJWT({ purpose: 'create-group' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(exp).sign(key);
}

test.describe('onboarding · generación de enlace (súper-admin)', () => {
  test('súper-admin genera enlace → 200 con /crear-grupo?t=', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/super-admin.json' });
    const res = await ctx.request.post('/api/onboarding/invite-link');
    expect(res.status()).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toContain('/crear-grupo?t=');
    await ctx.close();
  });

  test('admin de grupo NO súper-admin → 403', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/gt-admin.json' });
    const res = await ctx.request.post('/api/onboarding/invite-link');
    expect(res.status()).toBe(403);
    await ctx.close();
  });

  test('sin sesión → 401', async ({ request }) => {
    const res = await request.post('/api/onboarding/invite-link');
    expect(res.status()).toBe(401);
  });
});

// Adaptación: en vez de reutilizar el fixture gt-player.json (single-membership, del
// que dependen otros specs como home-landing), cada test aquí se forja su PROPIO usuario
// vía dev-login. Así crear un grupo (2ª membership) no contamina el estado compartido de
// la DB de e2e — el plan original apuntaba este riesgo explícitamente.
async function loginAsFreshUser(request: import('@playwright/test').APIRequestContext, tag: string) {
  const email = `onb-user-${tag}-${Date.now()}@test.com`;
  const res = await request.post('/api/auth/dev-login', { data: { email } });
  expect(res.status()).toBe(200);
}

test.describe('onboarding · crear grupo (API)', () => {
  // Cualquier sesión válida puede crear grupo si trae token: forjamos un usuario nuevo
  // por test (ver loginAsFreshUser arriba).

  test('token válido + slug libre → 200 y membership admin', async ({ request }) => {
    await loginAsFreshUser(request, 'ok');
    const slug = `onb-${Date.now()}`;
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'Grupo Onb', slug, t: await inviteToken() },
    });
    expect(res.status()).toBe(200);
    // El creador es admin del grupo nuevo: puede listar como admin de ese grupo.
    const check = await request.get(`/api/tournaments?kind=pozo&g=${slug}`);
    expect(check.status()).toBe(200);
  });

  test('token caducado → 403', async ({ request }) => {
    await loginAsFreshUser(request, 'expired');
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'X', slug: `onb2-${Date.now()}`, t: await inviteToken('-1h') },
    });
    expect(res.status()).toBe(403);
  });

  test('sin token → 403; slug reservado → 400; slug ocupado → 400; nombre vacío → 400', async ({ request }) => {
    await loginAsFreshUser(request, 'validation');
    const t = await inviteToken();
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: `a-${Date.now()}` } })).status()).toBe(403);
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: 'admin', t } })).status()).toBe(400);
    expect((await request.post('/api/onboarding/create-group', { data: { name: 'X', slug: 'grupo-test', t } })).status()).toBe(400);
    expect((await request.post('/api/onboarding/create-group', { data: { name: '  ', slug: `b-${Date.now()}`, t } })).status()).toBe(400);
  });
});

test.describe('onboarding · crear grupo sin sesión', () => {
  test('401', async ({ request }) => {
    const res = await request.post('/api/onboarding/create-group', {
      data: { name: 'X', slug: 'zz', t: await inviteToken() },
    });
    expect(res.status()).toBe(401);
  });
});
