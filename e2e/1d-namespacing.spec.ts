import { test, expect } from '@playwright/test';
import { TEST_ENV } from '../playwright.config';

test.describe('1D — namespacing transversal', () => {
  test('el cron de recordatorios corre el bucle por grupo (200 con bearer)', async ({ request }) => {
    const res = await request.get('/api/cron/match-reminders?kind=day', {
      headers: { authorization: `Bearer ${TEST_ENV.CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.kind).toBe('reminder_day');
    expect(typeof body.sent).toBe('number');
  });

  test('el cron rechaza sin el bearer correcto (401)', async ({ request }) => {
    const res = await request.get('/api/cron/match-reminders?kind=day');
    expect(res.status()).toBe(401);
  });

  test.describe('broadcast (requiere sesión admin)', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });

    test('el broadcast del admin responde (sendToGroup cableado)', async ({ page }) => {
      const res = await page.request.post('/api/push/broadcast', {
        data: { title: 'Hola', body: 'Aviso de prueba' },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(typeof body.sent).toBe('number');
    });
  });
});
