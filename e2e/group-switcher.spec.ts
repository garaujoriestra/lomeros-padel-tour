import { test, expect } from '@playwright/test';

// Tarea 3 — conmutador de grupos. Fixtures del global-setup: e2e-multi-user
// (membership player en lomeros y grupo-test) y e2e-super-user (allowlist
// SUPER_ADMIN_EMAILS, sin memberships). El conmutador solo se renderiza con 2+
// grupos alcanzables, así que los usuarios de un solo grupo no ven nada nuevo.

const SWITCHER = '[data-testid="group-switcher"]';

test.describe('conmutador · quién lo ve', () => {
  test.describe('visitante sin sesión', () => {
    test('no hay conmutador en la home', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator(SWITCHER)).toHaveCount(0);
    });
  });

  test.describe('jugador de un solo grupo (Lomeros)', () => {
    test.use({ storageState: 'e2e/.auth/player.json' });
    test('no hay conmutador (una única membership)', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading').first()).toBeVisible(); // página cargada
      await expect(page.locator(SWITCHER)).toHaveCount(0);
    });
  });
});

test.describe('conmutador · usuario multi-grupo', () => {
  test.use({ storageState: 'e2e/.auth/multi.json' });

  test('en la raíz: lista sus 2 grupos y salta a /g/grupo-test', async ({ page }) => {
    await page.goto('/');
    await page.locator(SWITCHER).first().click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText('Lomeros Padel Tour')).toBeVisible();
    await menu.getByText('Grupo Test').click();
    await expect(page).toHaveURL(/\/g\/grupo-test$/);
    await expect(page.getByRole('heading', { name: 'Grupo Test' }).first()).toBeVisible();
  });

  test('en el grupo: vuelve a la raíz (grupo por defecto = home canónica)', async ({ page }) => {
    await page.goto('/g/grupo-test');
    await page.locator(SWITCHER).first().click();
    await page.getByRole('menu').getByText('Lomeros Padel Tour').click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('conmutador · súper-admin (solo-lectura)', () => {
  test.use({ storageState: 'e2e/.auth/super.json' });

  test('ve todos los grupos aunque no tenga membership', async ({ page }) => {
    await page.goto('/');
    await page.locator(SWITCHER).first().click();
    const menu = page.getByRole('menu');
    await expect(menu.getByText('Lomeros Padel Tour')).toBeVisible();
    await expect(menu.getByText('Grupo Test')).toBeVisible();
  });

  test('entra al admin del grupo en solo-lectura, con banner', async ({ page }) => {
    const res = await page.goto('/g/grupo-test/admin');
    expect(res?.status()).toBe(200);
    // .first(): copia <div hidden> del dev server de Next (flake documentado).
    await expect(page.getByRole('heading', { name: 'Administración' }).first()).toBeVisible();
    await expect(page.getByText('Solo lectura', { exact: false }).first()).toBeVisible();
  });

  test('sus escrituras admin las rechaza la API con 403', async ({ request }) => {
    const res = await request.post('/api/players', {
      data: { g: 'grupo-test', name: 'Intruso Super' },
    });
    expect(res.status()).toBe(403);
  });

  test('en el admin de la raíz sigue sin entrar (decisión previa)', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/me$/);
  });
});
