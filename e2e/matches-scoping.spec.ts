import { test, expect } from '@playwright/test';

test.describe('paso B2 · matches · lecturas públicas con ?g=', () => {
  test('GET /api/matches?g=grupo-test devuelve gt-match1', async ({ request }) => {
    const res = await request.get('/api/matches?g=grupo-test');
    expect(res.ok()).toBeTruthy();
    const ids = ((await res.json()) as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain('gt-match1');
  });

  test('GET /api/matches (sin g) NO devuelve gt-match1', async ({ request }) => {
    const res = await request.get('/api/matches');
    expect(res.ok()).toBeTruthy();
    const ids = ((await res.json()) as Array<{ id: string }>).map((m) => m.id);
    expect(ids).not.toContain('gt-match1');
  });
});

test.describe('paso B2 · matches · authz como admin de Lomeros', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('NO puede borrar un partido de grupo-test (403, no-destructivo)', async ({ request }) => {
    // Rejected by requireGroupAdmin before deletion — gt-match1 is untouched.
    const res = await request.delete('/api/matches/gt-match1?g=grupo-test');
    expect(res.status()).toBe(403);
  });

  test('NO puede añadir resultado a un partido de grupo-test (403, no-destructivo)', async ({ request }) => {
    // body.g = 'grupo-test' → requireGroupAdmin rejects Lomeros admin → 403 before any DB write.
    const res = await request.put('/api/matches/gt-match1', {
      data: {
        g: 'grupo-test',
        sets: [
          { setNumber: 1, team1Games: 6, team2Games: 0 },
          { setNumber: 2, team1Games: 6, team2Games: 0 },
        ],
      },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('paso B2 · matches · authz como admin de grupo-test', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('crea partido nuevo en grupo-test (g) → 201', async ({ request }) => {
    const res = await request.post('/api/matches', {
      data: {
        g: 'grupo-test',
        date: '2026-03-01',
        team1Player1Id: 'gt-pl1',
        team1Player2Id: 'gt-pl2',
        team2Player1Id: 'gt-pl3',
        team2Player2Id: 'gt-pl4',
      },
    });
    expect(res.status()).toBe(201);
    const created = await res.json();
    expect(created.id).toBeTruthy();
  });
});
