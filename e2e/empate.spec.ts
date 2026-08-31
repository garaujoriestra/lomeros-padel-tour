import { test, expect } from '@playwright/test';
import { createClient } from '@libsql/client';
import { TEST_ENV } from '../playwright.config';

// Empate 1-1 a sets: un partido programado se juega y no da tiempo al tercer set.
//
// Cubre las tres consecuencias de ese resultado:
//   1. Queda registrado como empate (no como victoria de nadie).
//   2. Cuenta como partido jugado pero NO mueve el Elo.
//   3. En La Timba se devuelven las apuestas íntegras (nadie acertó).
//
// Setup por DB (patrón de la suite: estado por API/DB, aserciones por UI).
// Juegan pl5..pl8 — pl1..pl4 deben seguir con 0 partidos completados para
// elo-proyeccion.spec.ts. El apostante es pl1, que no juega este partido.
// Fecha muy futura para que las apuestas estén abiertas al montar el estado.

const DRAW_MATCH = 'm-empate-spec';
const BET_AMOUNT = 30;
const BALANCE_AFTER_BETTING = 470; // 500 iniciales − 30 apostadas

interface PlayerRow {
  id: string;
  eloRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
}

const db = () => createClient({ url: TEST_ENV.DB_URL });

async function playerRows(ids: string[]): Promise<Record<string, PlayerRow>> {
  const res = await db().execute({
    sql: `SELECT id, elo_rating, matches_played, wins, losses FROM players WHERE id IN (?, ?, ?, ?)`,
    args: ids,
  });
  return Object.fromEntries(
    res.rows.map((r) => [
      String(r.id),
      {
        id: String(r.id),
        eloRating: Number(r.elo_rating),
        matchesPlayed: Number(r.matches_played),
        wins: Number(r.wins),
        losses: Number(r.losses),
      },
    ]),
  );
}

const PLAYERS = ['pl5', 'pl6', 'pl7', 'pl8'];

test.beforeAll(async () => {
  const client = db();
  await client.execute({
    sql: `INSERT OR REPLACE INTO matches
      (id, group_id, date, time, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, status, winner_team)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    args: [DRAW_MATCH, 'lomeros', '2027-03-01', '20:00', ...PLAYERS, 'scheduled'],
  });
  // Estado limpio entre reruns (reuseExistingServer) + una apuesta abierta de pl1
  // al equipo 1, con el saldo ya descontado como si la hubiera puesto por la UI.
  await client.execute({ sql: 'DELETE FROM match_sets WHERE match_id = ?', args: [DRAW_MATCH] });
  await client.execute({ sql: 'DELETE FROM bets WHERE match_id = ?', args: [DRAW_MATCH] });
  await client.execute({ sql: "DELETE FROM token_ledger WHERE ref_id LIKE 'bet-empate%'", args: [] });
  await client.execute({
    sql: `INSERT INTO bets (id, match_id, player_id, market, predicted_team, amount, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: ['bet-empate-1', DRAW_MATCH, 'pl1', 'winner', 1, BET_AMOUNT, 'open'],
  });
  await client.execute({
    sql: 'UPDATE players SET token_balance = ? WHERE id = ?',
    args: [BALANCE_AFTER_BETTING, 'pl1'],
  });
});

test.describe('empate 1-1 · como admin', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('registrar un 1-1 lo guarda como empate, no mueve el Elo y devuelve las apuestas', async ({ page }) => {
    const before = await playerRows(PLAYERS);

    await page.goto(`/admin/matches/${DRAW_MATCH}/result`);

    const inputs = page.locator('input[type="number"]').filter({ visible: true });
    await expect(inputs).toHaveCount(4);

    // Set 1 para el equipo 1, set 2 para el equipo 2: 1-1 y no dio tiempo al tercero.
    await inputs.nth(0).fill('6');
    await inputs.nth(1).fill('4');
    await inputs.nth(2).fill('3');
    await inputs.nth(3).fill('6');

    // El formulario lo anuncia como empate ANTES de guardar, no como victoria.
    await expect(page.getByText('🤝 Empate').filter({ visible: true })).toBeVisible();
    await expect(page.getByText(/🏆 Gana/).filter({ visible: true })).toHaveCount(0);

    await page.getByRole('button', { name: /Guardar resultado y actualizar rankings/ }).click();
    await page.waitForURL('**/admin/matches');

    // ── 1. Quedó registrado como empate ──────────────────────────────────────
    const res = await page.request.get(`/api/matches/${DRAW_MATCH}`);
    const match = (await res.json()) as {
      status: string;
      winnerTeam: number | null;
      sets: { setNumber: number; team1Games: number; team2Games: number }[];
    };
    expect(match.status).toBe('draw');
    expect(match.winnerTeam).toBeNull();
    expect(match.sets).toHaveLength(2);

    // La página pública lo enseña como empate y explica que no cuenta para el Elo.
    await page.goto(`/matches/${DRAW_MATCH}`);
    await expect(page.getByText('Empate', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText(/no mueve el Elo de nadie/).filter({ visible: true })).toBeVisible();
    // Sin ganador no hay deltas de Elo que enseñar.
    await expect(page.locator('.lpt-badge.win:visible')).toHaveCount(0);
    await expect(page.locator('.lpt-badge.loss:visible')).toHaveCount(0);

    // ── 2. Cuenta como partido jugado, pero el Elo no se movió ───────────────
    const after = await playerRows(PLAYERS);
    for (const id of PLAYERS) {
      expect(after[id].eloRating, `Elo de ${id}`).toBe(before[id].eloRating);
      expect(after[id].wins, `victorias de ${id}`).toBe(before[id].wins);
      expect(after[id].losses, `derrotas de ${id}`).toBe(before[id].losses);
      expect(after[id].matchesPlayed, `partidos de ${id}`).toBe(before[id].matchesPlayed + 1);
    }

    // ── 3. La Timba devolvió la apuesta íntegra ──────────────────────────────
    const bet = await db().execute({
      sql: 'SELECT status, payout FROM bets WHERE id = ?',
      args: ['bet-empate-1'],
    });
    expect(String(bet.rows[0].status)).toBe('refunded');

    const balance = await db().execute({
      sql: "SELECT token_balance FROM players WHERE id = 'pl1'",
      args: [],
    });
    expect(Number(balance.rows[0].token_balance)).toBe(BALANCE_AFTER_BETTING + BET_AMOUNT);
  });

  test('el 1-1 no se puede colar como victoria del equipo 2 (regresión)', async ({ page }) => {
    // El conteo antiguo ("gana quien tenga más sets") caía en el `else` con 1-1
    // y registraba victoria del equipo 2 con el Elo y las apuestas al revés.
    const res = await page.request.post('/api/matches', {
      data: {
        date: '2026-09-20',
        team1Player1Id: 'pl5', team1Player2Id: 'pl6',
        team2Player1Id: 'pl7', team2Player2Id: 'pl8',
        sets: [
          { setNumber: 1, team1Games: 6, team2Games: 4 },
          { setNumber: 2, team1Games: 3, team2Games: 6 },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const created = (await res.json()) as { id: string; status: string; winnerTeam: number | null };
    expect(created.status).toBe('draw');
    expect(created.winnerTeam).toBeNull();
  });

  test('se pueden corregir los juegos de un empate, pero no convertirlo en victoria', async ({ page }) => {
    // Corrección válida: sigue siendo 1-1, solo cambian los juegos del set 2.
    const ok = await page.request.patch(`/api/matches/${DRAW_MATCH}/result`, {
      data: {
        sets: [
          { setNumber: 1, team1Games: 6, team2Games: 4 },
          { setNumber: 2, team1Games: 4, team2Games: 6 },
        ],
      },
    });
    expect(ok.status()).toBe(200);

    await page.goto(`/admin/matches/${DRAW_MATCH}/edit`);
    const inputs = page.locator('input[type="number"]').filter({ visible: true });
    await expect(inputs.nth(2)).toHaveValue('4');
    await expect(inputs.nth(3)).toHaveValue('6');

    // Corrección inválida: un 2-0 cambiaría el desenlace del partido.
    const bad = await page.request.patch(`/api/matches/${DRAW_MATCH}/result`, {
      data: {
        sets: [
          { setNumber: 1, team1Games: 6, team2Games: 4 },
          { setNumber: 2, team1Games: 6, team2Games: 3 },
        ],
      },
    });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error).toContain('empate');

    // El partido sigue siendo un empate.
    const after = await page.request.get(`/api/matches/${DRAW_MATCH}`);
    expect(((await after.json()) as { status: string }).status).toBe('draw');
  });
});
