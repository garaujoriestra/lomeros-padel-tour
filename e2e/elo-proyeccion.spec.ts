import { test, expect } from '@playwright/test';

// Elo en juego: en un partido PROGRAMADO el detalle muestra, bajo cada jugador, cuánto
// ganaría si su equipo gana (▲ +X) y cuánto perdería si pierde (▼ −Y). En un partido
// COMPLETADO no se muestra (ya está el delta real en badges).
test.describe('Elo en juego · partidos programados', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('un partido programado muestra la proyección de Elo (+/−) por jugador', async ({ page }) => {
    const res = await page.request.post('/api/matches', {
      data: {
        date: '2026-09-01',
        team1Player1Id: 'pl1', team1Player2Id: 'pl2',
        team2Player1Id: 'pl3', team2Player2Id: 'pl4',
      },
    });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as { id: string };

    await page.goto(`/matches/${id}`);

    // `.filter({ visible: true })` ignora el duplicado oculto transitorio que Next
    // genera durante el streaming (gotcha conocido del <div hidden>).
    const projLines = page.getByTestId('elo-en-juego').filter({ visible: true });

    // Una línea de proyección por cada uno de los 4 jugadores.
    await expect(projLines).toHaveCount(4);

    // Equipos a 1500 Elo / 0 partidos jugados → K=40 → +20 al ganar, −20 al perder.
    await expect(projLines.first()).toContainText('▲ +20');
    await expect(projLines.first()).toContainText('▼ -20');

    // Leyenda explicativa (una sola vez, visible).
    await expect(page.getByText('si gana').filter({ visible: true })).toHaveCount(1);
    await expect(page.getByText('si pierde').filter({ visible: true })).toHaveCount(1);
  });

  test('un partido completado NO muestra la proyección (ya tiene el delta real)', async ({ page }) => {
    const res = await page.request.post('/api/matches', {
      data: {
        date: '2026-09-02',
        team1Player1Id: 'pl5', team1Player2Id: 'pl6',
        team2Player1Id: 'pl7', team2Player2Id: 'pl8',
        sets: [
          { setNumber: 1, team1Games: 6, team2Games: 0 },
          { setNumber: 2, team1Games: 6, team2Games: 0 },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as { id: string };

    await page.goto(`/matches/${id}`);

    // En completados no hay proyección: la línea "Elo en juego" y la leyenda no existen.
    await expect(page.getByTestId('elo-en-juego')).toHaveCount(0);
    await expect(page.getByText('si pierde').filter({ visible: true })).toHaveCount(0);
  });
});
