// e2e/onboarding.spec.ts
import { test, expect } from '@playwright/test';

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
