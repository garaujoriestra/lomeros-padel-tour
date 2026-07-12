import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { TEST_ENV } from '../playwright.config';

// Firma de webhook de Stripe (esquema t=...,v1=HMAC-SHA256(t.payload)) sin SDK.
function stripeSignature(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

// ORDEN IMPORTA: el spec del webhook activa el pase de grupo-free, así que las
// aserciones "sin pase" van antes (workers=1, orden de fichero).

test.describe('marca · grupo sin pase (flag e2e ON)', () => {
  test('navbar: nombre del grupo + atribución, sin ⭐ ni acento custom', async ({ page }) => {
    await page.goto('/g/grupo-free');
    await expect(page.locator('.brand-name').first()).toHaveText('Grupo Free');
    await expect(page.getByText('hecho con Lomeros Padel Tour').first()).toBeVisible();
    await expect(page.getByLabel('Tour Oficial')).toHaveCount(0);
    await expect(page.locator('[data-branding="custom"]')).toHaveCount(0);
  });
});

test.describe('marca · grupo con pase (grupo-test)', () => {
  test('navbar: nombre + ⭐ y sin atribución', async ({ page }) => {
    await page.goto('/g/grupo-test');
    await expect(page.locator('.brand-name').first()).toHaveText('Grupo Test');
    await expect(page.getByLabel('Tour Oficial').first()).toBeVisible();
    await expect(page.getByText('hecho con Lomeros Padel Tour')).toHaveCount(0);
  });

  test.describe('como admin del grupo', () => {
    test.use({ storageState: 'e2e/.auth/gt-admin.json' });

    test('guarda color de acento por API y la home lo aplica; luego lo limpia', async ({ page, request }) => {
      const res = await request.put('/api/groups/branding', {
        data: { g: 'grupo-test', accentColor: '#ff5500', logoUrl: null },
      });
      expect(res.ok()).toBeTruthy();
      await page.goto('/g/grupo-test');
      await expect(page.locator('[data-branding="custom"]').first()).toBeVisible();
      // Limpieza (la DB de fichero se reutiliza entre runs locales).
      const clear = await request.put('/api/groups/branding', {
        data: { g: 'grupo-test', accentColor: null, logoUrl: null },
      });
      expect(clear.ok()).toBeTruthy();
    });

    test('color inválido → 400', async ({ request }) => {
      const res = await request.put('/api/groups/branding', {
        data: { g: 'grupo-test', accentColor: 'red; url(x)', logoUrl: null },
      });
      expect(res.status()).toBe(400);
    });

    test('la página admin/marca muestra formulario y pase activo', async ({ page }) => {
      await page.goto('/g/grupo-test/admin/marca');
      await expect(page.getByRole('heading', { name: 'Marca' }).first()).toBeVisible();
      await expect(page.getByText(/activo hasta/).first()).toBeVisible();
    });
  });
});

test.describe('marca · authz cross-grupo', () => {
  test.describe('admin de Lomeros (ajeno al grupo)', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });
    test('PUT branding de grupo-test → 403', async ({ request }) => {
      const res = await request.put('/api/groups/branding', {
        data: { g: 'grupo-test', accentColor: '#00ff00', logoUrl: null },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('jugador del grupo (no admin)', () => {
    test.use({ storageState: 'e2e/.auth/gt-player.json' });
    test('PUT branding → 403', async ({ request }) => {
      const res = await request.put('/api/groups/branding', {
        data: { g: 'grupo-test', accentColor: '#00ff00', logoUrl: null },
      });
      expect(res.status()).toBe(403);
    });
  });
});

test.describe('marca · webhook del Pase (Stripe)', () => {
  test('checkout.session.completed (paid) activa el pase de grupo-free; reintento idempotente', async ({ page, request }) => {
    const event = {
      id: `evt_e2e_${Date.now()}`,
      type: 'checkout.session.completed',
      data: { object: { payment_status: 'paid', metadata: { groupId: 'grupo-free' } } },
    };
    const payload = JSON.stringify(event);
    const headers = {
      'stripe-signature': stripeSignature(payload, TEST_ENV.STRIPE_WEBHOOK_SECRET),
      'content-type': 'application/json',
    };
    const res = await request.post('/api/billing/webhook', { data: payload, headers });
    expect(res.ok()).toBeTruthy();
    // Reintento del MISMO event.id: 200 sin reaplicar.
    const retry = await request.post('/api/billing/webhook', { data: payload, headers });
    expect(retry.ok()).toBeTruthy();

    await page.goto('/g/grupo-free');
    await expect(page.getByLabel('Tour Oficial').first()).toBeVisible();
    await expect(page.getByText('hecho con Lomeros Padel Tour')).toHaveCount(0);
  });

  test('firma inválida → 400', async ({ request }) => {
    const res = await request.post('/api/billing/webhook', {
      data: JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed' }),
      headers: { 'stripe-signature': 't=1,v1=deadbeef', 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });
});
