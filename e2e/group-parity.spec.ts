import { test, expect } from '@playwright/test';

// Tarea 2b: paridad completa bajo /g/[slug]. Este spec crece por tasks (navegación,
// públicas, me, admin, no-fuga).

test.describe('paridad 2b · navegación de grupo', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  test('tabs y bottom-nav bajo el grupo, sin Info; hrefs con basePath', async ({ page }) => {
    await page.goto('/g/grupo-test');
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Ranking', exact: true })).toHaveAttribute('href', '/g/grupo-test/rankings');
    await expect(nav.getByRole('link', { name: 'Partidos', exact: true })).toHaveAttribute('href', '/g/grupo-test/matches');
    await expect(nav.getByRole('link', { name: 'Eventos', exact: true })).toHaveAttribute('href', '/g/grupo-test/eventos');
    await expect(nav.getByRole('link', { name: 'Info', exact: true })).toHaveCount(0);
  });

  test('la raíz mantiene sus tabs de siempre', async ({ page }) => {
    await page.goto('/rankings');
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Partidos', exact: true })).toHaveAttribute('href', '/matches');
    await expect(nav.getByRole('link', { name: 'Info', exact: true })).toHaveAttribute('href', '/info');
  });
});
