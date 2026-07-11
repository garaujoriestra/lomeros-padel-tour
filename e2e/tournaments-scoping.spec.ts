import { test, expect } from '@playwright/test';

// Paso B3: torneos/pozos group-aware con authz por grupo objetivo. Un admin de Lomeros
// NO puede operar torneos de grupo-test aunque indique el grupo (?g=/body.g → 403);
// el admin de grupo-test opera los suyos. Fixtures del global-setup: gt-tournament1
// (pozo draft de grupo-test) + gt-admin.json + roster gt-pl1..8.

test.describe('paso B3 · torneos · authz como admin de Lomeros', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('NO puede listar torneos de grupo-test (403)', async ({ request }) => {
    const res = await request.get('/api/tournaments?kind=pozo&g=grupo-test');
    expect(res.status()).toBe(403);
  });

  test('NO puede crear un evento en grupo-test (403)', async ({ request }) => {
    const res = await request.post('/api/tournaments', {
      data: {
        g: 'grupo-test', name: 'Intruso', date: '2026-03-03', location: null,
        kind: 'pozo', format: 'americano', config: {}, courts: [], participantPlayerIds: [],
      },
    });
    expect(res.status()).toBe(403);
  });

  test('NO puede cargar un torneo de grupo-test por id (403)', async ({ request }) => {
    const res = await request.get('/api/tournaments/gt-tournament1?g=grupo-test');
    expect(res.status()).toBe(403);
  });

  test('NO puede editar un torneo de grupo-test (403)', async ({ request }) => {
    const res = await request.patch('/api/tournaments/gt-tournament1', {
      data: {
        g: 'grupo-test', name: 'hack', date: '2026-02-02', location: null, kind: 'pozo',
        format: 'americano', config: {}, courts: [], participantPlayerIds: [],
      },
    });
    expect(res.status()).toBe(403);
  });

  test('NO puede borrar un torneo de grupo-test (403)', async ({ request }) => {
    const res = await request.delete('/api/tournaments/gt-tournament1?g=grupo-test');
    expect(res.status()).toBe(403);
  });

  test('NO puede reemplazar parejas de un torneo de grupo-test (403)', async ({ request }) => {
    const res = await request.put('/api/tournaments/gt-tournament1/pairs', {
      data: { g: 'grupo-test', pairs: [] },
    });
    expect(res.status()).toBe(403);
  });

  test('NO puede generar un torneo de grupo-test (403)', async ({ request }) => {
    const res = await request.post('/api/tournaments/gt-tournament1/generate', {
      data: { g: 'grupo-test', seed: 1 },
    });
    expect(res.status()).toBe(403);
  });

  test('NO puede registrar resultado en un torneo de grupo-test (403)', async ({ request }) => {
    const res = await request.post('/api/tournaments/gt-tournament1/matches/whatever/result', {
      data: { g: 'grupo-test', gamesA: 6, gamesB: 0 },
    });
    expect(res.status()).toBe(403);
  });

  test('sin g sigue operando su grupo: la lista es 200 y no incluye gt-tournament1', async ({ request }) => {
    const res = await request.get('/api/tournaments?kind=pozo');
    expect(res.ok()).toBeTruthy();
    const { events } = (await res.json()) as { events: Array<{ id: string }> };
    expect(events.map((e) => e.id)).not.toContain('gt-tournament1');
  });
});

test.describe('paso B3 · torneos · authz como admin de grupo-test', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('lista SUS pozos (sin g, única membership): incluye gt-tournament1', async ({ request }) => {
    const res = await request.get('/api/tournaments?kind=pozo');
    expect(res.ok()).toBeTruthy();
    const { events } = (await res.json()) as { events: Array<{ id: string; name: string }> };
    expect(events.map((e) => e.id)).toContain('gt-tournament1');
  });

  test('carga su torneo por id con g → 200', async ({ request }) => {
    const res = await request.get('/api/tournaments/gt-tournament1?g=grupo-test');
    expect(res.status()).toBe(200);
    const { event } = (await res.json()) as { event: { name: string } };
    expect(event.name).toBe('Torneo GT');
  });

  test('crea un evento en grupo-test (body.g) → 201', async ({ request }) => {
    const res = await request.post('/api/tournaments', {
      data: {
        g: 'grupo-test',
        name: `Pozo GT B3 ${Date.now()}`, date: '2026-03-03', location: null,
        kind: 'pozo', format: 'americano',
        config: { rounds: 3, matchFormat: { kind: 'timed', minutes: 20, tieRule: 'golden_point' } },
        courts: [{ label: 'Pista 1', order: 1, availableFrom: '10:00', availableTo: '13:00' }],
        participantPlayerIds: ['gt-pl1', 'gt-pl2', 'gt-pl3', 'gt-pl4'],
      },
    });
    expect(res.status()).toBe(201);
    const { id } = (await res.json()) as { id: string };
    // Limpieza: el dev server/DB de fichero se reutiliza entre runs.
    const del = await request.delete(`/api/tournaments/${id}?g=grupo-test`);
    expect(del.ok()).toBeTruthy();
  });
});
