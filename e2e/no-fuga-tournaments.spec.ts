import { test, expect } from '@playwright/test';

// Aislamiento entre grupos para torneos. El global-setup crea `gt-tournament1` (pozo del
// "Grupo Test"). Lomeros nunca debe listarlo ni operarlo por id.
test.describe('no-fuga · torneos (admin de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('el listado de pozos no incluye torneos de otro grupo', async ({ request }) => {
    const res = await request.get('/api/tournaments?kind=pozo');
    expect(res.ok()).toBeTruthy();
    const { events } = (await res.json()) as { events: Array<{ id: string }> };
    expect(events.map((e) => e.id)).not.toContain('gt-tournament1');
  });

  test('cargar un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.get('/api/tournaments/gt-tournament1');
    expect(res.status()).toBe(404);
  });

  test('editar un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.patch('/api/tournaments/gt-tournament1', {
      data: {
        name: 'hack', date: '2026-02-02', location: null, kind: 'pozo', format: 'americano',
        config: {}, courts: [], participantPlayerIds: [],
      },
    });
    expect(res.status()).toBe(404);
  });

  test('borrar un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.delete('/api/tournaments/gt-tournament1');
    expect(res.status()).toBe(404);
  });

  test('generar un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.post('/api/tournaments/gt-tournament1/generate', { data: { seed: 1 } });
    expect(res.status()).toBe(404);
  });

  test('reemplazar parejas de un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.put('/api/tournaments/gt-tournament1/pairs', { data: { pairs: [] } });
    expect(res.status()).toBe(404);
  });

  test('registrar resultado en un partido de un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.post('/api/tournaments/gt-tournament1/matches/whatever/result', {
      data: { gamesA: 6, gamesB: 0 },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · torneos (público)', () => {
  // La página de un pozo de otro grupo cae en notFound() (gate getTournamentInGroup),
  // así que NUNCA revela su nombre. (notFound() renderiza la página de "no encontrado";
  // su status vía request.get es 200 en esta versión de Next, así que verificamos por
  // contenido: la prueba real de aislamiento es que el nombre del torneo ajeno no aparece.)
  test('la página pública de un pozo de otro grupo no revela su nombre', async ({ request }) => {
    const res = await request.get('/pozos/gt-tournament1');
    expect(await res.text()).not.toContain('Torneo GT');
  });
});
