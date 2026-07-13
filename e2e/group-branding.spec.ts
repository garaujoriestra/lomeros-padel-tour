import { test, expect } from '@playwright/test';
import { createClient } from '@libsql/client';
import { createHmac } from 'node:crypto';
import { TEST_ENV } from '../playwright.config';

// Firma de webhook de Stripe (esquema t=...,v1=HMAC-SHA256(t.payload)) sin SDK.
function stripeSignature(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

// El test de concesión del webhook usa grupo-webhook (grupo DEDICADO, se resetea a
// impago cada run en global-setup): no toca la invariante "impago" de grupo-free, que
// queda como fixture puro de navbar sin pase.

test.describe('marca · grupo sin pase (flag e2e ON)', () => {
  test('navbar: nombre del grupo + atribución, sin ⭐ ni acento custom', async ({ page }) => {
    await page.goto('/g/grupo-free');
    await expect(page.locator('.brand-name').first()).toHaveText('Grupo Free');
    await expect(page.getByText('hecho con Padelo').first()).toBeVisible();
    await expect(page.getByLabel('Tour Oficial')).toHaveCount(0);
    await expect(page.locator('[data-branding="custom"]')).toHaveCount(0);
  });
});

test.describe('marca · grupo con pase (grupo-test)', () => {
  test('navbar: nombre + ⭐ y sin atribución', async ({ page }) => {
    await page.goto('/g/grupo-test');
    await expect(page.locator('.brand-name').first()).toHaveText('Grupo Test');
    await expect(page.getByLabel('Tour Oficial').first()).toBeVisible();
    await expect(page.getByText('hecho con Padelo')).toHaveCount(0);
  });

  test.describe('como admin del grupo', () => {
    test.use({ storageState: 'e2e/.auth/gt-admin.json' });

    test('guarda color de acento por API y la home lo aplica; luego lo limpia', async ({ page, request }) => {
      const res = await request.put('/api/groups/branding', {
        data: { g: 'grupo-test', accentColor: '#ff5500', logoUrl: null },
      });
      expect(res.ok()).toBeTruthy();
      try {
        await page.goto('/g/grupo-test');
        await expect(page.locator('[data-branding="custom"]').first()).toBeVisible();
      } finally {
        // Limpieza a prueba de fallos (la DB de fichero se reutiliza entre runs locales):
        // aunque la aserción de arriba caiga, el acento #ff5500 NO debe quedar en grupo-test.
        const clear = await request.put('/api/groups/branding', {
          data: { g: 'grupo-test', accentColor: null, logoUrl: null },
        });
        expect(clear.ok()).toBeTruthy();
      }
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
  test('checkout.session.completed (paid) activa el pase de grupo-webhook; reintento idempotente', async ({ page, request }) => {
    const eventId = `evt_e2e_${Date.now()}`;
    const event = {
      id: eventId,
      type: 'checkout.session.completed',
      data: { object: { payment_status: 'paid', metadata: { groupId: 'grupo-webhook' } } },
    };
    const payload = JSON.stringify(event);
    const headers = {
      'stripe-signature': stripeSignature(payload, TEST_ENV.STRIPE_WEBHOOK_SECRET),
      'content-type': 'application/json',
    };
    const res = await request.post('/api/billing/webhook', { data: payload, headers });
    expect(res.ok()).toBeTruthy();

    // Idempotencia REAL (no solo "200 al reintentar"): leemos la DB de fichero directamente.
    // paid_until tras la 1ª concesión.
    const db = createClient({ url: TEST_ENV.DB_URL });
    const afterFirst = await db.execute({
      sql: `SELECT paid_until FROM groups WHERE id = 'grupo-webhook'`,
    });
    const paidAfterFirst = afterFirst.rows[0]?.paid_until as string | null;
    expect(paidAfterFirst).toBeTruthy();

    // Reintento del MISMO event.id: 200 sin reaplicar el efecto.
    const retry = await request.post('/api/billing/webhook', { data: payload, headers });
    expect(retry.ok()).toBeTruthy();

    // paid_until NO se re-extiende (mismo valor) y el evento se registró UNA sola vez.
    const afterRetry = await db.execute({
      sql: `SELECT paid_until FROM groups WHERE id = 'grupo-webhook'`,
    });
    expect(afterRetry.rows[0]?.paid_until).toBe(paidAfterFirst);
    const events = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM billing_events WHERE id = ?`,
      args: [eventId],
    });
    expect(Number(events.rows[0]?.n)).toBe(1);

    await page.goto('/g/grupo-webhook');
    await expect(page.getByLabel('Tour Oficial').first()).toBeVisible();
    await expect(page.getByText('hecho con Padelo')).toHaveCount(0);
  });

  test('firma inválida → 400', async ({ request }) => {
    const res = await request.post('/api/billing/webhook', {
      data: JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed' }),
      headers: { 'stripe-signature': 't=1,v1=deadbeef', 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });
});
