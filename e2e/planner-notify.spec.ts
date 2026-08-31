import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@libsql/client';
import { TEST_ENV } from '../playwright.config';
import { addDaysIso, madridTodayIso, mondayOf } from '../src/lib/planner/weeks';

// El aviso al grupo se dispara al guardar disponibilidad nueva, pero el envío
// real de web-push no es observable en e2e (sin claves VAPID ni suscripciones).
// Lo que sí es observable —y es la decisión que importa— es el turno de aviso:
// una fila en notification_throttle significa «a este jugador le tocaba avisar,
// y ya no le vuelve a tocar hasta dentro de 6 horas». El texto del aviso y sus
// destinatarios están cubiertos por los tests unitarios.

const WEEK = mondayOf(madridTodayIso());
const NEXT_WEEK = addDaysIso(WEEK, 7);
const db = createClient({ url: TEST_ENV.DB_URL });

// pl1 es el jugador de la sesión e2e (e2e/.auth/player.json).
const keyFor = (week: string) => `planner:lomeros:${week}:pl1`;

async function throttleRow(week: string): Promise<{ sent_at: string } | null> {
  const res = await db.execute({
    sql: 'SELECT sent_at FROM notification_throttle WHERE key = ?',
    args: [keyFor(week)],
  });
  return (res.rows[0] as unknown as { sent_at: string }) ?? null;
}

async function resetPlanner(week: string) {
  await db.execute({ sql: 'DELETE FROM notification_throttle WHERE key = ?', args: [keyFor(week)] });
  await db.execute({
    sql: `DELETE FROM planner_slots WHERE week_start = ? AND subject_type = 'player' AND subject_id = 'pl1'`,
    args: [week],
  });
}

// La DB de e2e es compartida y este spec corre antes que planner.spec.ts: deja
// el planificador de pl1 como lo encontró.
test.afterAll(async () => {
  await resetPlanner(WEEK);
  await resetPlanner(NEXT_WEEK);
});

// Pinta un bloque de 1,5h (3 celdas): menos no se guarda — la cuadrícula exige
// el bloque mínimo antes de mandar nada al servidor.
async function paintBlock(page: Page, day: number, startMin: number) {
  for (const min of [startMin, startMin + 30, startMin + 60]) {
    await page.locator(`button[data-day="${day}"][data-min="${min}"]`).first().click();
  }
  await expect(page.getByText('Guardado ✓').first()).toBeVisible();
}

test.describe('planner · aviso al grupo cuando alguien marca disponibilidad', () => {
  // El recordatorio de push es un modal que tapa la cuadrícula (ver planner.spec.ts).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('lpt-notif-reminder-dismissed', 'true'));
  });

  test.use({ storageState: 'e2e/.auth/player.json' });

  test('pintar disponibilidad nueva reclama el turno de aviso, y solo una vez', async ({ page }) => {
    await resetPlanner(WEEK);
    await page.goto('/planificador');

    // Jueves (day 3), 20:00–21:30.
    await paintBlock(page, 3, 1200);
    const first = await throttleRow(WEEK);
    expect(first, 'marcar disponibilidad debe reclamar el turno de aviso').not.toBeNull();

    // Seguir pintando dentro de la ventana de 6h no debe volver a avisar: si no,
    // pintar la semana entera dispararía una notificación por día.
    await paintBlock(page, 4, 1200);
    const second = await throttleRow(WEEK);
    expect(second?.sent_at).toBe(first?.sent_at);
  });

  test('borrar disponibilidad no avisa a nadie', async ({ page }) => {
    await resetPlanner(NEXT_WEEK);
    // Estado de partida por DB (patrón del proyecto): pl1 ya tiene el jueves
    // pintado en la próxima semana, sin turno de aviso pendiente.
    await db.execute({
      sql: `INSERT INTO planner_slots (id, group_id, week_start, day, subject_type, subject_id, slots)
            VALUES (?, 'lomeros', ?, 3, 'player', 'pl1', ?)`,
      args: [`ps-notify-${NEXT_WEEK}`, NEXT_WEEK, JSON.stringify([1200, 1230, 1260])],
    });

    await page.goto(`/planificador?week=${NEXT_WEEK}`);
    // Click sobre celda pintada = borrar. Las tres dejan el día vacío.
    await paintBlock(page, 3, 1200);

    expect(await throttleRow(NEXT_WEEK), 'recortar disponibilidad no es noticia').toBeNull();
  });
});
