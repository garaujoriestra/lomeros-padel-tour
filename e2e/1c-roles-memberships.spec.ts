import { test, expect } from '@playwright/test';
import { createClient } from '@libsql/client';
import { TEST_ENV } from '../playwright.config';

const db = createClient({ url: TEST_ENV.DB_URL });

async function membershipFor(playerId: string) {
  const r = await db.execute({
    sql: "SELECT user_id, role, player_id FROM memberships WHERE group_id = 'lomeros' AND player_id = ?",
    args: [playerId],
  });
  return r.rows[0] ?? null;
}

test.describe('1C — roles y enlace desde memberships', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('el admin entra en /admin/players', async ({ page }) => {
    await page.goto('/admin/players');
    await expect(page).toHaveURL(/\/admin\/players/);
    await expect(page.getByRole('heading', { name: /jugadores/i }).first()).toBeVisible();
  });

  test('un jugador es redirigido fuera de /admin (gate server-side)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/player.json' });
    const page = await ctx.newPage();
    await page.goto('/admin/players');
    await expect(page).toHaveURL(/\/me/);
    await ctx.close();
  });

  test('enlazar un Gmail crea una membership y desenlazar la borra', async ({ page }) => {
    // Enlazar pl6 → email nuevo (PUT admin).
    const put = await page.request.put('/api/players/pl6', {
      data: { name: 'Jugador 6', email: 'link6@test.com' },
    });
    expect(put.ok()).toBeTruthy();

    const mb = await membershipFor('pl6');
    expect(mb).not.toBeNull();
    expect(mb!.role).toBe('player');

    // La edit page muestra el email enlazado (lo lee de memberships).
    await page.goto('/admin/players/pl6/edit');
    await expect(page.locator('input[type="email"]')).toHaveValue('link6@test.com');

    // Desenlazar (email vacío) borra la membership 'player'.
    const clear = await page.request.put('/api/players/pl6', {
      data: { name: 'Jugador 6', email: '' },
    });
    expect(clear.ok()).toBeTruthy();
    expect(await membershipFor('pl6')).toBeNull();
  });

  test('un email ya asignado a otro jugador devuelve 409', async ({ page }) => {
    const a = await page.request.put('/api/players/pl6', {
      data: { name: 'Jugador 6', email: 'dup@test.com' },
    });
    expect(a.ok()).toBeTruthy();

    const b = await page.request.put('/api/players/pl7', {
      data: { name: 'Jugador 7', email: 'dup@test.com' },
    });
    expect(b.status()).toBe(409);

    // Limpieza: desenlazar pl6.
    await page.request.put('/api/players/pl6', { data: { name: 'Jugador 6', email: '' } });
  });
});
