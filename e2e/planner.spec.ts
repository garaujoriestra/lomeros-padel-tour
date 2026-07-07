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
    await expect(page.getByText('Quién puede esta semana')).toBeVisible();
    await expect(page.getByText(/Miércoles \d+/)).toBeVisible();
    await expect(page.getByText('20:00–21:30 · Jugador 2, Jugador 3, Jugador 4')).toBeVisible();
    await expect(page.getByText('21:30–22:00 · Jugador 2, Jugador 3')).toBeVisible();
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

  test('pintar y guardar viernes aparece en «Quién puede» y persiste al recargar', async ({ page }) => {
    await page.goto('/planificador');
    for (const min of [1200, 1230, 1260]) {
      await page.locator(`button[data-day="4"][data-min="${min}"]`).first().click();
    }
    await page.getByRole('button', { name: 'Guardar' }).first().click();
    await expect(page.getByText('20:00–21:30 · Jugador 1')).toBeVisible();
    await expect(page.getByText(/Viernes \d+/)).toBeVisible();

    await page.goto('/planificador');
    for (const min of [1200, 1230, 1260]) {
      await expect(page.locator(`button[data-day="4"][data-min="${min}"]`).first())
        .toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('bloques de <3 casillas bloquean el guardado', async ({ page }) => {
    await page.goto('/planificador');
    // Dos celdas sueltas el sábado (day=5) → aviso y botón deshabilitado.
    await page.locator('button[data-day="5"][data-min="1200"]').first().click();
    await page.locator('button[data-day="5"][data-min="1230"]').first().click();
    await expect(page.getByText('Los bloques deben ser de mínimo 1,5h')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar' }).first()).toBeDisabled();
    // Completar el bloque a 3 → se puede guardar.
    await page.locator('button[data-day="5"][data-min="1260"]').first().click();
    await expect(page.getByRole('button', { name: 'Guardar' }).first()).toBeEnabled();
  });

  test('no-fuga: el planificador de Lomeros no muestra datos de grupo-test', async ({ page }) => {
    await page.goto('/planificador');
    await expect(page.getByText('Jugador GT')).toHaveCount(0);
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
    await expect(page.getByText('Mi disponibilidad')).toBeVisible();
    await context.close();
  });

  test('admin de Lomeros sin ficha en el grupo → bienvenida, sin cuadrícula', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await context.newPage();
    const res = await page.goto('/g/grupo-test/planificador');
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/no está vinculada a un jugador de este grupo/i)).toBeVisible();
    await expect(page.getByText('Mi disponibilidad')).toHaveCount(0);
    await context.close();
  });
});
