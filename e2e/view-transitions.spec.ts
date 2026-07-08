import { test, expect, type Page } from '@playwright/test';

// Cobertura de las View Transitions (Fase 1). Las animaciones en sí las aplica
// React de forma transitoria durante la navegación (no quedan en el DOM), así
// que lo que se puede — y debe — verificar aquí es:
//   1. El aislamiento del chrome persistente: topbar/bottomnav llevan su
//      `view-transition-name` para NO arrastrarse con el contenido.
//   2. Que activar `experimental.viewTransition` + los <ViewTransition> del árbol
//      no rompe el runtime: las páginas envueltas navegan sin excepción.
//   3. Que el camino de `prefers-reduced-motion` sigue navegando.

// El service worker de la PWA (public/sw.js) cachea las navegaciones y puede
// servir el app-shell además de la red, duplicando transitoriamente la navbar.
// Es ruido pre-existente ajeno a las View Transitions: se bloquea para medir la
// app real de forma determinista.
test.use({ serviceWorkers: 'block' });

/** Falla si la página lanza una excepción no capturada (p. ej. ViewTransition undefined). */
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test.describe('View Transitions · chrome persistente', () => {
  test('la topbar y la bottomnav declaran su view-transition-name (aislamiento)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header.topbar').first()).toHaveCSS('view-transition-name', 'lpt-topbar');
    await expect(page.locator('nav.bottomnav').first()).toHaveCSS('view-transition-name', 'lpt-bottomnav');
  });
});

test.describe('View Transitions · navegación sin regresión', () => {
  test('recorre las páginas envueltas en <ViewTransition> sin excepciones y con la navbar persistente', async ({ page }) => {
    const errors = trackPageErrors(page);

    await page.goto('/');
    await expect(page.locator('header.topbar').first()).toBeVisible();

    await page.getByRole('link', { name: /Ranking$/ }).first().click();
    await expect(page).toHaveURL(/\/rankings$/);
    await expect(page.getByText('Ranking individual')).toBeVisible();
    await expect(page.locator('header.topbar').first()).toBeVisible();

    await page.getByRole('link', { name: /Parejas/ }).first().click();
    await expect(page).toHaveURL(/\/rankings\/pairs$/);
    await expect(page.getByText('Ranking de parejas')).toBeVisible();

    await page.getByRole('link', { name: /Partidos/ }).first().click();
    await expect(page).toHaveURL(/\/matches$/);
    await expect(page.getByRole('heading', { name: 'Partidos' })).toBeVisible();

    expect(errors, `excepciones en la navegación: ${errors.join(' | ')}`).toEqual([]);
  });

  test('lista → ficha de jugador: si hay un enlace de jugador, navega y conserva la navbar', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/rankings');

    const playerLink = page.locator('a[href^="/players/"]').first();
    if ((await playerLink.count()) === 0) {
      test.skip(true, 'El seed no expone jugadores en el grupo por defecto');
    }

    await playerLink.click();
    await expect(page).toHaveURL(/\/players\/[^/]+$/);
    await expect(page.locator('header.topbar').first()).toBeVisible();
    expect(errors, `excepciones en lista→ficha: ${errors.join(' | ')}`).toEqual([]);
  });
});

test.describe('View Transitions · reduced motion', () => {
  test('con prefers-reduced-motion la navegación sigue funcionando', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('link', { name: /Ranking$/ }).first().click();
    await expect(page).toHaveURL(/\/rankings$/);
    await expect(page.getByText('Ranking individual')).toBeVisible();
    expect(errors, `excepciones con reduced-motion: ${errors.join(' | ')}`).toEqual([]);
  });
});
