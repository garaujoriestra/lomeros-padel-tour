import { test, expect, request as pwRequest } from '@playwright/test';
import { createClient } from '@libsql/client';
import { TEST_ENV, BASE_URL } from '../playwright.config';

// El acierto en La Timba es el pico emocional de la feature: al liquidarse un
// partido, el ganador ve una celebración de retransmisión («¡Acertaste! +N
// fichas»), no una línea verde más. Y la home abre con el último resultado.

const MATCH = 'm-celebr-1';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('lpt-notif-reminder-dismissed', 'true'));
});

test.beforeAll(async () => {
  const db = createClient({ url: TEST_ENV.DB_URL });
  // Partido programado donde pl1 NO juega (puede apostar a ambos mercados).
  await db.execute({
    sql: `INSERT OR REPLACE INTO matches
      (id, group_id, date, time, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [MATCH, 'lomeros', '2027-01-02', '20:00', 'pl2', 'pl3', 'pl4', 'pl5', 'scheduled'],
  });
  await db.execute({ sql: 'DELETE FROM bets WHERE match_id = ?', args: [MATCH] });
  await db.execute({ sql: "UPDATE players SET token_balance = 500 WHERE id = 'pl1'" });
});

test.describe('timba · celebración del acierto (pl1)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('acertar la apuesta muestra la celebración; la home abre con el último resultado', async ({ page }) => {
    // pl1 apuesta 30 al equipo 1 (API del propio jugador).
    const bet = await page.request.post('/api/bets', {
      data: { matchId: MATCH, market: 'winner', predictedTeam: 1, amount: 30 },
    });
    expect(bet.ok()).toBeTruthy();

    // El admin registra el resultado: gana el equipo 1 → la apuesta liquida ganada.
    const admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/admin.json' });
    const res = await admin.put(`/api/matches/${MATCH}`, {
      data: {
        sets: [
          { setNumber: 1, team1Games: 6, team2Games: 2 },
          { setNumber: 2, team1Games: 6, team2Games: 3 },
        ],
        team1Player1Id: 'pl2', team1Player2Id: 'pl3',
        team2Player1Id: 'pl4', team2Player2Id: 'pl5',
      },
    });
    expect(res.ok()).toBeTruthy();
    await admin.dispose();

    // La página del partido celebra el acierto en grande.
    await page.goto(`/matches/${MATCH}`);
    const celebration = page.locator('[data-testid="timba-celebration"]:visible');
    await expect(celebration).toBeVisible();
    await expect(celebration).toContainText('¡Acertaste!');
    await expect(celebration).toContainText('fichas');

    // Cold-open: la home abre con el último resultado como enlace al partido.
    await page.goto('/');
    await expect(page.getByText('Último partido:').first()).toBeVisible();
  });
});
