import { test, expect } from '@playwright/test';
import { createClient } from '@libsql/client';
import { TEST_ENV } from '../playwright.config';

// La Timba: se puede apostar a los DOS mercados (Ganador y Marcador exacto) a la vez,
// con fichas separadas, en el mismo partido. Antes la UI conmutaba entre uno u otro y
// solo dejaba colocar una apuesta a la vez de forma evidente.
//
// Setup (por DB, patrón "API/DB para montar estado + UI para las aserciones"):
//   - `m-2mkt-spec`: partido programado de Lomeros donde pl1 NO juega (pl2/pl3 vs pl4/pl5).
//   - `m-2mkt-play`: partido programado de Lomeros donde pl1 SÍ juega (pl1/pl2 vs pl3/pl4).
//   - pl1 con saldo para apostar.
// Fecha muy futura para que las apuestas estén abiertas.

const SPEC_MATCH = 'm-2mkt-spec';
const PLAY_MATCH = 'm-2mkt-play';

test.beforeEach(async ({ page }) => {
  // El recordatorio de notificaciones push es un modal que tapa la UI; se silencia.
  await page.addInitScript(() => sessionStorage.setItem('lpt-notif-reminder-dismissed', 'true'));
});

test.beforeAll(async () => {
  const db = createClient({ url: TEST_ENV.DB_URL });
  const mkMatch = (id: string, ids: [string, string, string, string]) => db.execute({
    sql: `INSERT OR REPLACE INTO matches
      (id, group_id, date, time, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, 'lomeros', '2027-01-01', '20:00', ...ids, 'scheduled'],
  });
  await mkMatch(SPEC_MATCH, ['pl2', 'pl3', 'pl4', 'pl5']);
  await mkMatch(PLAY_MATCH, ['pl1', 'pl2', 'pl3', 'pl4']);
  // Estado limpio de apuestas (idempotencia entre reruns con reuseExistingServer) + saldo.
  await db.execute({ sql: 'DELETE FROM bets WHERE match_id IN (?, ?)', args: [SPEC_MATCH, PLAY_MATCH] });
  await db.execute({ sql: "UPDATE players SET token_balance = 500 WHERE id = 'pl1'" });
});

test.describe('timba · dos mercados (jugador pl1, Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('un espectador apuesta a Ganador y a Marcador a la vez en el mismo partido', async ({ page }) => {
    await page.goto(`/matches/${SPEC_MATCH}`);

    // Los dos slips están visibles a la vez, cada uno con su propio botón.
    const winnerBtn = page.getByRole('button', { name: /Apostar al ganador/i });
    const marcadorBtn = page.getByRole('button', { name: /Apostar al marcador/i });
    await expect(winnerBtn).toBeVisible();
    await expect(marcadorBtn).toBeVisible();

    // Next (dev) deja una copia OCULTA del árbol (`<div hidden>`); los queries por
    // rol/label la excluyen, pero un getByTestId crudo casaría 2 elementos. Por eso
    // los inputs se localizan por rol y los data-testid se filtran a `:visible`.
    const myBetWinner = page.locator('[data-testid="my-bet-winner"]:visible');
    const myBetMarcador = page.locator('[data-testid="my-bet-marcador"]:visible');

    // Apuesta de Ganador: 20 fichas.
    await page.getByRole('spinbutton', { name: 'Fichas a apostar al ganador' }).fill('20');
    await winnerBtn.click();
    await expect(myBetWinner).toBeVisible();
    await expect(myBetWinner).toContainText('20 fichas');

    // Apuesta de Marcador: 30 fichas. La de Ganador NO debe desaparecer.
    await page.getByRole('spinbutton', { name: 'Fichas a apostar al marcador' }).fill('30');
    await marcadorBtn.click();
    await expect(myBetMarcador).toBeVisible();
    await expect(myBetMarcador).toContainText('30 fichas');

    // AMBAS conviven.
    await expect(myBetWinner).toBeVisible();
    await expect(myBetMarcador).toBeVisible();
    // Saldo: 500 − 20 − 30 = 450.
    await expect(page.locator('[data-testid="bet-balance"]:visible')).toContainText('450');
  });

  test('si el jugador juega el partido, solo ve el mercado Ganador (no Marcador)', async ({ page }) => {
    await page.goto(`/matches/${PLAY_MATCH}`);
    await expect(page.getByRole('button', { name: /Apostar al ganador/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Apostar al marcador/i })).toHaveCount(0);
  });
});
