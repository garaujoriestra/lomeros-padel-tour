import { test, expect } from '@playwright/test';
import { createClient } from '@libsql/client';
import { TEST_ENV } from '../playwright.config';
import { madridTodayIso, mondayOf } from '../src/lib/planner/weeks';

const WEEK = mondayOf(madridTodayIso());
const S2000 = [1200, 1230, 1260, 1290]; // 20:00–22:00

// El recordatorio de notificaciones push es un modal a pantalla completa que se
// abre de forma asíncrona (tras registrar el service worker) y tapa la cuadrícula.
// Lo silenciamos vía el mismo flag de sessionStorage que usa su propio "Ahora no",
// para poder interactuar con la cuadrícula de forma determinista.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('lpt-notif-reminder-dismissed', 'true'));
});

test.beforeAll(async () => {
  const db = createClient({ url: TEST_ENV.DB_URL });
  // Pista de pl2 en Lomeros.
  await db.execute({
    sql: 'INSERT OR IGNORE INTO courts (id, group_id, owner_player_id, name) VALUES (?, ?, ?, ?)',
    args: ['court-pl2', 'lomeros', 'pl2', 'Urb. Los Olivos'],
  });
  const put = (day: number, type: string, id: string, slots: number[]) => db.execute({
    sql: `INSERT OR REPLACE INTO planner_slots (id, group_id, week_start, day, subject_type, subject_id, slots)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [`ps-${type}-${id}-${day}`, 'lomeros', WEEK, day, type, id, JSON.stringify(slots)],
  });
  // Miércoles (day 2): SOLO 3 jugadores + pista efectiva → falta 1 para partido.
  await put(2, 'player', 'pl2', S2000);
  await put(2, 'player', 'pl3', S2000);
  await put(2, 'player', 'pl4', S2000);
  await put(2, 'court', 'court-pl2', S2000);
  // Jueves (day 3): 4 jugadores pero la dueña de la pista (pl2) NO está → sin partido.
  await put(3, 'player', 'pl3', S2000);
  await put(3, 'player', 'pl4', S2000);
  await put(3, 'player', 'pl5', S2000);
  await put(3, 'player', 'pl6', S2000);
  await put(3, 'court', 'court-pl2', S2000);
});

test.describe('planner · gating de sesión', () => {
  test('sin sesión → redirect a /login', async ({ page }) => {
    await page.goto('/planificador');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('planner · flujo del jugador (pl1, Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('sin 4º jugador no hay coincidencia; al pintar y guardar, aparece', async ({ page }) => {
    await page.goto('/planificador');
    await expect(page.getByRole('heading', { name: 'Planificador semanal' })).toBeVisible();
    // Estado inicial: miércoles tiene 3 jugadores → sin coincidencias.
    await expect(page.getByText('Aún no hay tramos con partido posible')).toBeVisible();

    // pl1 pinta miércoles 20:00–22:00 (4 celdas, day=2).
    for (const min of S2000) {
      await page.locator(`button[data-day="2"][data-min="${min}"]`).click();
    }
    await page.getByRole('button', { name: 'Guardar' }).first().click();

    // Coincidencia del miércoles: tramo + pista + 4 disponibles (incluye a Jugador 1).
    await expect(page.getByText(/Miércoles \d+ · 20:00–22:00/)).toBeVisible();
    await expect(page.getByText(/Pista: Urb\. Los Olivos/)).toBeVisible();
    await expect(page.getByText(/4 disponibles:.*Jugador 1/)).toBeVisible();
    // El jueves NO aparece: 4 jugadores pero la dueña de la pista no está.
    await expect(page.getByText(/Jueves \d+ ·/)).toHaveCount(0);
  });

  test('la disponibilidad pintada persiste al recargar', async ({ page }) => {
    await page.goto('/planificador');
    for (const min of S2000) {
      await expect(page.locator(`button[data-day="2"][data-min="${min}"]`).first())
        .toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('bloques de <3 casillas bloquean el guardado', async ({ page }) => {
    await page.goto('/planificador');
    // Dos celdas sueltas el viernes (day=4) → aviso y botón deshabilitado.
    await page.locator('button[data-day="4"][data-min="1200"]').click();
    await page.locator('button[data-day="4"][data-min="1230"]').click();
    await expect(page.getByText('Los bloques deben ser de mínimo 1,5h')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar' }).first()).toBeDisabled();
    // Completar el bloque a 3 → se puede guardar.
    await page.locator('button[data-day="4"][data-min="1260"]').click();
    await expect(page.getByRole('button', { name: 'Guardar' }).first()).toBeEnabled();
  });

  test('declarar mi pista y ver su cuadrícula', async ({ page }) => {
    await page.goto('/planificador');
    await page.getByPlaceholder(/Nombre de la pista/).fill('Pista de Jugador 1');
    await page.getByRole('button', { name: 'Tengo pista' }).click();
    await expect(page.getByText('Mi pista · Pista de Jugador 1')).toBeVisible();
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
