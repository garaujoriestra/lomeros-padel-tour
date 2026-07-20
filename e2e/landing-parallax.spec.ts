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
    // Hay que esperar al pin ANTES de medir el fondo: el pin alarga la página
    // ~B×88vh, así que el `scrollHeight` de antes del pin se queda a mitad de
    // camino (y con él, el podio ni siquiera ha entrado en su ventana).
    await expect(page.locator('.pin-spacer')).toHaveCount(1);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // El podio queda tan pegado al final que su `end` (top al 48% del viewport)
    // cae más allá del scroll máximo; el clamp lo recorta al fondo real, así que
    // la expansión SE COMPLETA justo al llegar abajo del todo.
    await expect.poll(() => scaleOf(page, '.mkt-podium[data-parallax="expand"]'), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(0.99);
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

  /** Scroll de página en el que el bloque `sel` termina su expansión (scale ≈ 1). */
  async function scrollAlCompletar(page: Page, sel: string) {
    const { y, vh, max } = await page.locator(sel).first().evaluate((el) => ({
      y: el.getBoundingClientRect().top + window.scrollY,
      vh: window.innerHeight,
      max: document.documentElement.scrollHeight,
    }));
    const paso = Math.round(vh / 4);
    // …incluyendo el fondo exacto: ahí es donde completan los bloques con `end`
    // recortado por clamp() (el podio).
    for (let s = 0; s <= max - vh + paso; s += paso) {
      const to = Math.min(s, max - vh);
      await page.evaluate((v) => window.scrollTo(0, v), to);
      await page.waitForTimeout(150);
      const sc = await scaleOf(page, sel);
      if (sc !== null && sc >= 0.995) return { completa: to, y, vh };
    }
    return { completa: -1, y, vh };
  }

  // Orden de refresco de ScrollTrigger (refreshPriority). Los bloques `expand`
  // viven DEBAJO del pin de La Pista, así que su posición de página depende del
  // pin-spacing. Si se miden ANTES de que el pin aplique su spacer, ven la página
  // ~B×88vh más corta: su ventana de scroll queda muy por encima de la real y el
  // bloque llega a la pantalla YA expandido — la animación no se ve nunca.
  // Comprobar solo los extremos (encogido arriba, expandido al centrarlo) no lo
  // detecta: hay que verificar que la expansión ocurre EN SU VENTANA.
  test('la expansión ocurre en su ventana de scroll, no cientos de px antes de asomar', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    await expect(page.locator('.pin-spacer')).toHaveCount(1); // el pin ya existe
    await page.waitForTimeout(800);

    for (const sel of ['.mkt-plan[data-parallax="expand"]', '.mkt-podium[data-parallax="expand"]']) {
      const { completa, y, vh } = await scrollAlCompletar(page, sel);
      // `end: clamp(top 48%)` → completa cuando el top del bloque llega al 48% del
      // viewport, es decir en scroll ≈ y − 0.48·vh (el clamp del podio puede
      // adelantarlo hasta el fondo de página, de ahí la tolerancia de 1 viewport).
      expect(completa, `${sel} nunca completa`).toBeGreaterThan(0);
      expect(completa, `${sel} completa demasiado pronto`).toBeGreaterThan(y - 0.48 * vh - vh);
    }
  });

  test('tras un resize, la ventana de scroll de los bloques bajo el pin se recalcula bien', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    await expect(page.locator('.pin-spacer')).toHaveCount(1);

    // Resize → ScrollTrigger.refresh() automático (debounce 200ms): todo se recalcula.
    await page.setViewportSize({ width: 1180, height: 760 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1200);

    const sel = '.mkt-plan[data-parallax="expand"]';
    const { completa, y, vh } = await scrollAlCompletar(page, sel);
    expect(completa).toBeGreaterThan(0);
    expect(completa, 'completa demasiado pronto tras el resize').toBeGreaterThan(y - 0.48 * vh - vh);
  });

  test('el tilt al puntero sigue vivo en el marcador del hero (selectores acotados a la landing)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/bandejazo');
    const tilt = page.locator('[data-tilt][data-fx="board-live"]');
    await expect(tilt).toHaveCount(1);

    // Un pointermove descentrado inclina la tarjeta en 3D. GSAP escribe la
    // perspectiva DENTRO del transform (matrix3d), no en la propiedad CSS
    // `perspective`: se comprueba sobre la matriz.
    const box = (await tilt.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.2);
    await expect
      .poll(
        () =>
          tilt.evaluate((el) => {
            const t = getComputedStyle(el).transform;
            if (t === 'none' || !t.startsWith('matrix3d')) return 0;
            const m = new DOMMatrix(t);
            return Math.abs(m.m13) + Math.abs(m.m23); // componentes de rotación fuera del plano
          }),
        { timeout: 5_000 },
      )
      .toBeGreaterThan(0.01);
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
