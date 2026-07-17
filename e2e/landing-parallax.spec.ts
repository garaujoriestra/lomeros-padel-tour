import { test, expect, type Page } from '@playwright/test';

// Parallax de la landing /bandejazo (GSAP + ScrollTrigger): los bloques visuales
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

/** Rango de scroll del pin de La Pista (el pin-spacer mide inicio; el rango es beats × 110vh). */
async function pistaRange(page: Page) {
  return page.evaluate(() => {
    const spacer = document.querySelector('.pin-spacer')!;
    const r = spacer.getBoundingClientRect();
    // Distancia real de scroll del pin = alto del spacer − alto de la sección
    // pineada (100svh). Derivarlo de la geometría evita hardcodear el `end`.
    return { top: r.top + window.scrollY, range: r.height - window.innerHeight };
  });
}

const beatOpacity = (page: Page, i: number) =>
  page
    .locator(`.mkt-beat[data-beat="${i}"]`)
    .evaluate((el) => parseFloat(getComputedStyle(el).opacity));

test.describe('parallax /bandejazo (GSAP ScrollTrigger)', () => {
  test('un bloque visual lejano arranca encogido y se expande a 1 al llegar con el scroll', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');

    const sel = '.mkt-plan[data-parallax="expand"]';
    // ScrollTrigger inicializado: el bloque (aún fuera del viewport) está encogido.
    await expect.poll(() => scaleOf(page, sel)).not.toBeNull();
    expect((await scaleOf(page, sel))!).toBeLessThan(0.95);

    // Al centrarlo con el scroll, el scrub lo lleva suavemente a escala 1.
    await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect.poll(() => scaleOf(page, sel), { timeout: 5_000 }).toBeGreaterThanOrEqual(0.99);
  });

  test('los bloques pegados al final de la página (podio) también completan la expansión (clamp)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Con el pin de la pista, el clamp del podio llega a ~0.97 en el fondo
    // exacto (indistinguible de 1): el listón es que la expansión SE COMPLETA.
    await expect.poll(() => scaleOf(page, '.mkt-podium[data-parallax="expand"]'), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(0.95);
  });

  test('el marcador del hero deriva (parallax vertical) al hacer scroll', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');

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
    await page.goto('/bandejazo');

    const sel = '.mkt-plan[data-parallax="expand"]';
    await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
    // Sin tween: GSAP no toca el elemento (matchMedia) → sin transform inline ni computado.
    await page.waitForTimeout(600);
    expect(await scaleOf(page, sel)).toBeNull();
    await expect(page.locator(sel).first()).toBeVisible();
    // Y los golpes de La Pista son secciones apiladas normales, todas visibles.
    await expect(page.locator('[data-pista].mkt-pista--live')).toHaveCount(0);
  });

  test('pelota 3D: el wrapper se monta y su progreso avanza con el scroll', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    const ball = page.locator('[data-ball3d]');
    await expect(ball).toHaveCount(1); // espera al dynamic import
    // El runner puede no tener WebGL; el wrapper lo declara y el canvas solo existe si hay contexto.
    if ((await ball.getAttribute('data-webgl')) === '1') {
      await expect(ball.locator('canvas')).toBeVisible();
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(async () => parseFloat((await ball.getAttribute('data-progress')) ?? '0'), { timeout: 5_000 })
      .toBeGreaterThan(0.9);
  });

  test('con prefers-reduced-motion la pelota 3D no se monta (ni el pin de la pista)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/bandejazo');
    await page.waitForLoadState('networkidle'); // deja cargar el chunk dinámico
    await expect(page.locator('[data-ball3d]')).toHaveCount(0);
    await expect(page.locator('.pin-spacer')).toHaveCount(0);
  });

  test('cold-open: el saque inicial termina y lo marca (data-intro=done)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    const ball = page.locator('[data-ball3d]');
    await expect(ball).toHaveCount(1);
    await expect(ball).toHaveAttribute('data-intro', 'pending'); // el saque arranca en vuelo
    await expect(ball).toHaveAttribute('data-intro', 'done', { timeout: 10_000 });
  });

  test('la pista: la sección se pinea y los golpes se revelan impacto a impacto', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    await expect(page.locator('[data-ball3d]')).toHaveCount(1); // el pin lo crea scroll-fx; el chunk 3D lee el bus
    await expect(page.locator('.pin-spacer')).toHaveCount(1);
    const pista = page.locator('[data-pista]');
    await expect(pista).toHaveClass(/mkt-pista--live/);
    // Indicador tipo slides: 4 puntos, visibles solo en el modo pineado.
    await expect(pista.locator('.mkt-pista__dots span')).toHaveCount(4);
    await expect(pista.locator('.mkt-pista__dots')).toBeVisible();

    const { top, range } = await pistaRange(page);
    // Mitad del golpe 0 (tarjeta ya asentada): visible; la del golpe 2 aún no.
    await page.evaluate(({ y }) => window.scrollTo(0, y), { y: top + range * 0.125 });
    await expect(pista).toHaveAttribute('data-pista-beat', '0');
    await expect.poll(() => beatOpacity(page, 0), { timeout: 5_000 }).toBeGreaterThan(0.9);
    expect(await beatOpacity(page, 2)).toBeLessThan(0.1);
    // Avanzando dos impactos: el golpe 2 toma la escena.
    await page.evaluate(({ y }) => window.scrollTo(0, y), { y: top + range * 0.625 });
    await expect(pista).toHaveAttribute('data-pista-beat', '2');
    await expect.poll(() => beatOpacity(page, 2), { timeout: 5_000 }).toBeGreaterThan(0.9);
    expect(await beatOpacity(page, 0)).toBeLessThan(0.1);
  });

  test('la pista funciona también en móvil (390×844): pin, golpes que caben y se revelan', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    await expect(page.locator('[data-ball3d]')).toHaveCount(1);
    await expect(page.locator('.pin-spacer')).toHaveCount(1);
    await expect(page.locator('[data-pista]')).toHaveClass(/mkt-pista--live/);
    // Cada golpe cabe en la pantalla anclada (modo compacto móvil).
    const fits = await page.evaluate(() => {
      const vh = window.innerHeight;
      return [...document.querySelectorAll('.mkt-beat')].every((b) => b.scrollHeight <= vh);
    });
    expect(fits).toBe(true);
    // Y los golpes se revelan al avanzar por el pin.
    const { top, range } = await pistaRange(page);
    await page.evaluate(({ y }) => window.scrollTo(0, y), { y: top + range * 0.625 });
    await expect(page.locator('[data-pista]')).toHaveAttribute('data-pista-beat', '2');
    await expect.poll(() => beatOpacity(page, 2), { timeout: 5_000 }).toBeGreaterThan(0.9);
  });

  test('peloteo: golpear la pelota muestra el contador y encadena toques', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    const ball = page.locator('[data-ball3d]');
    await expect(ball).toHaveCount(1);
    test.skip((await ball.getAttribute('data-webgl')) !== '1', 'el runner no tiene WebGL');
    await expect(ball).toHaveAttribute('data-intro', 'done', { timeout: 10_000 });

    const x = parseInt((await ball.getAttribute('data-ball-x'))!, 10);
    const y = parseInt((await ball.getAttribute('data-ball-y'))!, 10);
    await page.mouse.click(x, y);
    const chip = page.locator('.mkt-peloteo');
    await expect(chip).toHaveText(/×\s*1/);
    await page.mouse.click(x, y); // segundo toque dentro de la ventana de combo (2s)
    await expect(chip).toHaveText(/×\s*2/);
  });

  test('efectos por sección: los Elo del hero cuentan y terminan en su valor exacto', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    const elo = page.locator('[data-fx="board-live"] .mkt-elo').first();
    // El count-up arranca tras el saque: el valor BAJA (arranca en ~88%)…
    await expect.poll(() => elo.textContent(), { timeout: 8_000 }).not.toBe('1584');
    // …y termina exactamente en el valor renderizado por el servidor.
    await expect.poll(() => elo.textContent(), { timeout: 8_000 }).toBe('1584');
  });

  test('efectos por sección: el contador de La Timba respeta el formato es-ES (1.240)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    await expect(page.locator('.pin-spacer')).toHaveCount(1);
    const { top, range } = await pistaRange(page);
    await page.evaluate(({ y }) => window.scrollTo(0, y), { y: top + range * 0.31 }); // golpe 1: La Timba
    const n = page.locator('[data-fx="countup"]').first();
    await expect.poll(() => n.textContent(), { timeout: 6_000 }).not.toBe('1.240'); // cuenta…
    await expect.poll(() => n.textContent(), { timeout: 6_000 }).toBe('1.240'); // …y clava el formato
  });

  test('efectos por sección: nada queda oculto al terminar las coreografías', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    await expect(page.locator('.pin-spacer')).toHaveCount(1);
    const { top, range } = await pistaRange(page);
    // sets del partido (golpe 2) y celdas de la semana (golpe 3): visibles tras su coreografía
    for (const [f, sel] of [
      [0.56, '[data-fx="sets-flip"] .mkt-set'],
      [0.83, '[data-fx="wave"] .mkt-cell--on'],
    ] as const) {
      await page.evaluate(({ y }) => window.scrollTo(0, y), { y: top + range * f });
      await page.waitForTimeout(1800);
      await expect
        .poll(() => page.locator(sel).first().evaluate((el) => getComputedStyle(el).opacity))
        .toBe('1');
    }
    // rail de pasos (sección vertical, fuera de la pista)
    await page.locator('[data-fx="steps"]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(1600);
    await expect
      .poll(() => page.locator('.mkt-step__bar').first().evaluate((el) => getComputedStyle(el).opacity))
      .toBe('1');
    await expect(page.locator('.mkt-step__bar')).toHaveCount(3);
  });

  test('el motion no rompe la landing: CTAs y secciones siguen operativos tras scrollear', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const cta = page.locator('.mkt-close').getByRole('link', { name: /crea tu grupo gratis/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/crear-grupo');
  });
});
