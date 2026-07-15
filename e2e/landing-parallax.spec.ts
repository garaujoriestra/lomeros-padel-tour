import { test, expect, type Page } from '@playwright/test';

// Parallax de la landing /padelo (GSAP + ScrollTrigger): los bloques visuales
// (paneles, marcador de partido, rejilla, planes, podio) se expanden suavemente
// (scale 0.9 → 1) ligados a la posición de scroll, y el marcador del hero deriva
// a distinta velocidad. Se verifica el motion Y que con prefers-reduced-motion
// no se aplica ningún transform (la landing queda estática, como antes).

/** Componente `a` (scaleX) de la matriz de transform computada, o null si no hay transform. */
async function scaleOf(page: Page, selector: string): Promise<number | null> {
  return page.locator(selector).first().evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return t === 'none' ? null : new DOMMatrix(t).a;
  });
}

test.describe('parallax /padelo (GSAP ScrollTrigger)', () => {
  test('un bloque visual lejano arranca encogido y se expande a 1 al llegar con el scroll', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/padelo');

    const sel = '.mkt-match[data-parallax="expand"]';
    // ScrollTrigger inicializado: el bloque (aún fuera del viewport) está encogido.
    await expect.poll(() => scaleOf(page, sel)).not.toBeNull();
    expect((await scaleOf(page, sel))!).toBeLessThan(0.95);

    // Al centrarlo con el scroll, el scrub lo lleva suavemente a escala 1.
    await page.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect.poll(() => scaleOf(page, sel), { timeout: 5_000 }).toBeGreaterThanOrEqual(0.99);
  });

  test('los bloques pegados al final de la página (podio) también completan la expansión (clamp)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/padelo');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => scaleOf(page, '.mkt-podium[data-parallax="expand"]'), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(0.99);
  });

  test('el marcador del hero deriva (parallax vertical) al hacer scroll', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/padelo');

    const drift = page.locator('[data-parallax="drift"]').first();
    await expect(drift).toBeVisible();
    const tyAt = () =>
      drift.evaluate((el) => {
        const t = getComputedStyle(el).transform;
        return t === 'none' ? 0 : new DOMMatrix(t).m42;
      });

    await page.evaluate(() => window.scrollTo(0, window.innerHeight * 0.75));
    // Deriva hacia arriba (y negativa) proporcional al scroll dentro del hero.
    await expect.poll(tyAt, { timeout: 5_000 }).toBeLessThan(-4);
  });

  test('con prefers-reduced-motion no se aplica ningún transform y el contenido sigue visible', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/padelo');

    const sel = '.mkt-match[data-parallax="expand"]';
    await page.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    // Sin tween: GSAP no toca el elemento (matchMedia) → sin transform inline ni computado.
    await page.waitForTimeout(600);
    expect(await scaleOf(page, sel)).toBeNull();
    await expect(page.locator(sel)).toBeVisible();
  });

  test('el motion no rompe la landing: CTAs y secciones siguen operativos tras scrollear', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/padelo');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const cta = page.locator('.mkt-close').getByRole('link', { name: /crea tu grupo gratis/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/crear-grupo');
  });
});
