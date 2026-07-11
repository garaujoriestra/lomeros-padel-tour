import { test, expect } from '@playwright/test';
import { createClient } from '@libsql/client';
import { TEST_ENV } from '../playwright.config';
import { madridTodayIso, mondayOf } from '../src/lib/planner/weeks';

const WEEK = mondayOf(madridTodayIso());

// El recordatorio de notificaciones push es un modal a pantalla completa que se
// abre de forma asíncrona (tras registrar el service worker) y tapa la cuadrícula.
// Lo silenciamos vía el mismo flag de sessionStorage que usa su propio "Ahora no",
// para poder interactuar con la cuadrícula de forma determinista.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('lpt-notif-reminder-dismissed', 'true'));
});

test.beforeAll(async () => {
  const db = createClient({ url: TEST_ENV.DB_URL });
  const put = (day: number, id: string, slots: number[]) => db.execute({
    sql: `INSERT OR REPLACE INTO planner_slots (id, group_id, week_start, day, subject_type, subject_id, slots)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [`ps-player-${id}-${day}`, 'lomeros', WEEK, day, 'player', id, JSON.stringify(slots)],
  });
  // Miércoles (day 2): pl2 y pl3 20:00–22:00, pl4 solo hasta las 21:30 → el tramo
  // se parte donde pl4 deja de estar.
  await put(2, 'pl2', [1200, 1230, 1260, 1290]);
  await put(2, 'pl3', [1200, 1230, 1260, 1290]);
  await put(2, 'pl4', [1200, 1230, 1260]);
});

test.describe('planner · gating de sesión', () => {
  test('sin sesión → redirect a /login', async ({ page }) => {
    await page.goto('/planificador');
    await expect(page).toHaveURL(/\/login/);
  });
});

// Nota: las celdas se localizan con .first() porque Next (dev) puede mantener la
// página anterior en un <div hidden> durante la navegación y duplicar los botones.
test.describe('planner · flujo del jugador (pl1, Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('«Quién puede esta semana» muestra el miércoles partido por composición', async ({ page }) => {
    await page.goto('/planificador');
    await expect(page.getByRole('heading', { name: 'Planificador semanal' })).toBeVisible();
    await expect(page.getByText('Quién puede esta semana').first()).toBeVisible();
    await expect(page.getByText(/Miércoles \d+/).first()).toBeVisible();
    await expect(page.getByText('20:00–21:30 · Jugador 2, Jugador 3, Jugador 4').first()).toBeVisible();
    await expect(page.getByText('21:30–22:00 · Jugador 2, Jugador 3').first()).toBeVisible();
  });

  test('mapa de calor: cuenta de otros disponibles por celda', async ({ page }) => {
    await page.goto('/planificador');
    await expect(page.locator('button[data-day="2"][data-min="1200"]').first()).toHaveText('3');
    await expect(page.locator('button[data-day="2"][data-min="1290"]').first()).toHaveText('2');
  });

  test('un tap pinta EXACTAMENTE una celda (bug de arrastre corregido)', async ({ page }) => {
    await page.goto('/planificador');
    await page.locator('button[data-day="3"][data-min="1200"]').first().click();
    await expect(page.locator('button[data-day="3"][data-min="1200"]').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('button[data-day="3"][data-min="1230"]').first()).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('button[data-day="2"][data-min="1200"]').first()).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('button[data-day="4"][data-min="1200"]').first()).toHaveAttribute('aria-pressed', 'false');
  });

  test('micro-deslizamiento (<12px) no pinta la celda vecina; arrastre real sí', async ({ page }) => {
    await page.goto('/planificador');
    // Micro-slide: down cerca del borde inferior de una celda del jueves y move de
    // 6px que ENTRA en la celda vecina (dispara pointerenter) pero queda bajo el
    // umbral de 12px → solo la celda inicial acaba pintada. (No se guarda nada:
    // el goto del siguiente test resetea el estado.)
    // :visible esquiva la copia <div hidden> obsoleta que el dev server de Next puede
    // dejar en el DOM (se desprende a mitad de scroll y rompe scrollIntoViewIfNeeded).
    const cell = page.locator('button[data-day="3"][data-min="1320"]:visible').first();
    // page.mouse no hace auto-scroll (a diferencia de .click()): la fila de las
    // 22:00 queda bajo el pliegue del viewport y hay que traerla a la vista.
    await cell.scrollIntoViewIfNeeded();
    const box = (await cell.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 4, { steps: 3 });
    await page.mouse.up();
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('button[data-day="3"][data-min="1350"]').first())
      .toHaveAttribute('aria-pressed', 'false');
    // Arrastre real: down en 22:30 (celda sin pintar; empezar en la ya pintada
    // entraría en modo borrar) y move >12px pasando por los centros de las dos
    // siguientes → las tres acaban pintadas.
    const from = page.locator('button[data-day="3"][data-min="1350"]:visible').first();
    const fromBox = (await from.boundingBox())!;
    const x = fromBox.x + fromBox.width / 2;
    await page.mouse.move(x, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    const to = page.locator('button[data-day="3"][data-min="1410"]:visible').first();
    const toBox = (await to.boundingBox())!;
    await page.mouse.move(x, toBox.y + toBox.height / 2, { steps: 10 });
    await page.mouse.up();
    for (const min of [1350, 1380, 1410]) {
      await expect(page.locator(`button[data-day="3"][data-min="${min}"]`).first())
        .toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('pintar el viernes se AUTOGUARDA, aparece en «Quién puede» y persiste al recargar', async ({ page }) => {
    await page.goto('/planificador');
    for (const min of [1200, 1230, 1260]) {
      await page.locator(`button[data-day="4"][data-min="${min}"]`).first().click();
    }
    // Pintar es guardar: sin botón — el estado vivo confirma el autosave.
    await expect(page.getByText('Guardado ✓').first()).toBeVisible();
    await expect(page.getByText('20:00–21:30 · Jugador 1').first()).toBeVisible();
    await expect(page.getByText(/Viernes \d+/).first()).toBeVisible();

    await page.goto('/planificador');
    for (const min of [1200, 1230, 1260]) {
      await expect(page.locator(`button[data-day="4"][data-min="${min}"]`).first())
        .toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('leyenda visible y regla de 1,5h enseñada de antemano', async ({ page }) => {
    await page.goto('/planificador');
    await expect(page.getByText('Tú puedes').first()).toBeVisible();
    await expect(page.getByText('Otros pueden (el nº dice cuántos)').first()).toBeVisible();
    await expect(page.getByText(/mínimo 1,5h/).first()).toBeVisible();
  });

  test('navegar con un bloque incompleto (no autoguardable) pide confirmación', async ({ page }) => {
    await page.goto('/planificador');
    // Una sola casilla = bloque <1,5h: el autosave no lo guarda y queda pendiente.
    await page.locator('button[data-day="6"][data-min="1290"]').first().click();
    await expect(page.getByText('Sin guardar — completa el bloque').first()).toBeVisible();
    // Tap en el conmutador de semana → diálogo propio, sin navegar.
    await page.getByRole('link', { name: 'Próxima' }).first().click();
    await expect(page.getByRole('alertdialog', { name: 'Cambios sin guardar' })).toBeVisible();
    await page.getByRole('button', { name: 'Seguir editando' }).click();
    // Seguimos en la misma semana y la celda sigue pintada.
    await expect(page.locator('button[data-day="6"][data-min="1290"]').first())
      .toHaveAttribute('aria-pressed', 'true');
  });

  test('bloques de <3 casillas NO se autoguardan; al completar el bloque sí', async ({ page }) => {
    await page.goto('/planificador');
    // Dos celdas sueltas el sábado (day=5) → aviso rojo y estado «Sin guardar».
    await page.locator('button[data-day="5"][data-min="1200"]').first().click();
    await page.locator('button[data-day="5"][data-min="1230"]').first().click();
    await expect(page.getByText('Los bloques deben ser de mínimo 1,5h').first()).toBeVisible();
    await expect(page.getByText('Sin guardar — completa el bloque').first()).toBeVisible();
    // Completar el bloque a 3 → autosave.
    await page.locator('button[data-day="5"][data-min="1260"]').first().click();
    await expect(page.getByText('Guardado ✓').first()).toBeVisible();
  });

  test('no-fuga: el planificador de Lomeros no muestra datos de grupo-test', async ({ page }) => {
    await page.goto('/planificador');
    await expect(page.getByText('Jugador GT')).toHaveCount(0);
  });
});

test.describe('planner · táctil (PWA móvil)', () => {
  test.use({ storageState: 'e2e/.auth/player.json', hasTouch: true, viewport: { width: 390, height: 844 } });

  test('un tap táctil pinta/borra la celda; un gesto de scroll no pinta nada', async ({ page }) => {
    await page.goto('/planificador');
    // Domingo (day=6): día que ningún otro test usa. (No se guarda nada.)
    // :visible: en dev Next puede dejar una copia oculta del árbol (<div hidden>)
    // y un .first() crudo casaría esa copia (que además se desmonta en vuelo).
    const cell = page.locator('button[data-day="6"][data-min="1200"]:visible').first();
    await cell.scrollIntoViewIfNeeded();

    // Tap → pinta. Segundo tap → borra.
    await cell.tap();
    await expect(cell).toHaveAttribute('aria-pressed', 'true');
    await cell.tap();
    await expect(cell).toHaveAttribute('aria-pressed', 'false');

    // Gesto de scroll: pointerdown táctil + move vertical > umbral + up → la
    // celda NO se pinta (antes, con touch-action:none y pintado en pointerdown,
    // cualquier intento de scroll pintaba la cuadrícula).
    const box = (await cell.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await cell.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: x, clientY: y });
    await cell.dispatchEvent('pointermove', { pointerType: 'touch', isPrimary: true, clientX: x, clientY: y + 40 });
    await cell.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true, clientX: x, clientY: y + 40 });
    await expect(cell).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('planner · authz de API (miembro de otro grupo)', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  test('GET /api/planner con g=lomeros siendo de grupo-test → 403', async ({ request }) => {
    const res = await request.get('/api/planner?g=lomeros');
    expect(res.status()).toBe(403);
  });

  test('PUT availability con g=lomeros siendo de grupo-test → 403', async ({ request }) => {
    const res = await request.put('/api/planner/availability', {
      data: { g: 'lomeros', week: WEEK, day: 0, slots: [1200, 1230, 1260] },
    });
    expect(res.status()).toBe(403);
    // Y no se ha colado ninguna fila de gt-pl1 en Lomeros.
    const db = createClient({ url: TEST_ENV.DB_URL });
    const rows = await db.execute({
      sql: "SELECT COUNT(*) AS n FROM planner_slots WHERE subject_id = 'gt-pl1'",
      args: [],
    });
    expect(Number(rows.rows[0].n)).toBe(0);
  });
});

test.describe('planner · paridad /g/[slug]', () => {
  test('jugador del grupo ve el planificador del grupo', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/gt-player.json' });
    const page = await context.newPage();
    const res = await page.goto('/g/grupo-test/planificador');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Planificador semanal' })).toBeVisible();
    await expect(page.getByText('Mi disponibilidad').first()).toBeVisible();
    await context.close();
  });

  test('admin de Lomeros sin ficha en el grupo → bienvenida, sin cuadrícula', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await context.newPage();
    const res = await page.goto('/g/grupo-test/planificador');
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/no está vinculada a un jugador de este grupo/i).first()).toBeVisible();
    await expect(page.getByText('Mi disponibilidad')).toHaveCount(0);
    await context.close();
  });
});
