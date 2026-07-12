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

    // BottomNav (móvil) también montado bajo el grupo, con hrefs prefijados.
    // En viewport de escritorio (por defecto) la barra está display:none
    // (globals.css, media ≥760px), así que sus links no aparecen en el árbol
    // de accesibilidad: se asierta a nivel DOM (locator CSS), no con getByRole.
    const bottomNav = page.locator('nav[aria-label="Navegación inferior"]');
    await expect(bottomNav).toHaveCount(1);
    await expect(bottomNav.locator('a', { hasText: 'La Timba' })).toHaveAttribute('href', '/g/grupo-test/rankings/tokens');
  });

  test('la raíz mantiene sus tabs de siempre', async ({ page }) => {
    await page.goto('/rankings');
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Partidos', exact: true })).toHaveAttribute('href', '/matches');
    await expect(nav.getByRole('link', { name: 'Info', exact: true })).toHaveAttribute('href', '/info');
  });
});
