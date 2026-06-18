import { test, expect } from '@playwright/test';

// Aislamiento entre grupos para el dominio de partidos. El global-setup crea un
// partido `gt-match1` en "Grupo Test"; Lomeros (grupo por defecto) nunca debe verlo ni tocarlo.
test.describe('no-fuga · partidos (público)', () => {
  test('la lista pública no incluye partidos de otro grupo', async ({ request }) => {
    const res = await request.get('/api/matches');
    expect(res.ok()).toBeTruthy();
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.map((m) => m.id)).not.toContain('gt-match1');
  });

  test('GET de un partido de otro grupo da 404', async ({ request }) => {
    const res = await request.get('/api/matches/gt-match1');
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · partidos (admin de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('un admin de Lomeros no puede registrar resultado en un partido de otro grupo (404)', async ({ request }) => {
    const res = await request.put('/api/matches/gt-match1', {
      data: { sets: [{ setNumber: 1, team1Games: 6, team2Games: 0 }, { setNumber: 2, team1Games: 6, team2Games: 0 }] },
    });
    expect(res.status()).toBe(404);
  });

  test('un admin de Lomeros no puede cambiar los lados de un partido de otro grupo (404)', async ({ request }) => {
    const res = await request.patch('/api/matches/gt-match1/sides', {
      data: { team1Player1Side: 'drive' },
    });
    expect(res.status()).toBe(404);
  });

  test('un admin de Lomeros no puede anular por lesión un partido de otro grupo (404)', async ({ request }) => {
    const res = await request.post('/api/matches/gt-match1/abandon', {
      data: { injuredPlayerId: 'gt-pl1' },
    });
    expect(res.status()).toBe(404);
  });

  test('crear partido con un jugador de otro grupo es rechazado (400)', async ({ request }) => {
    const res = await request.post('/api/matches', {
      data: {
        date: '2026-02-02',
        team1Player1Id: 'pl1',
        team1Player2Id: 'pl2',
        team2Player1Id: 'pl3',
        team2Player2Id: 'gt-pl1', // jugador del otro grupo → no debe colarse
      },
    });
    expect(res.status()).toBe(400);
  });
});
