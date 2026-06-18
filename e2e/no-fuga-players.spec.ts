import { test, expect } from '@playwright/test';

// Aislamiento entre grupos para el dominio de jugadores. El global-setup crea un
// segundo grupo "Grupo Test" con el jugador gt-pl1; el grupo por defecto es Lomeros.
test.describe('no-fuga · jugadores (público)', () => {
  test('la lista pública solo muestra el grupo por defecto (Lomeros)', async ({ request }) => {
    const res = await request.get('/api/players');
    expect(res.ok()).toBeTruthy();
    const list = (await res.json()) as Array<{ id: string }>;
    const ids = list.map((p) => p.id);
    expect(ids).toContain('pl1');       // jugador de Lomeros, sí
    expect(ids).not.toContain('gt-pl1'); // jugador de otro grupo, no
  });

  test('GET por id de un jugador de otro grupo da 404', async ({ request }) => {
    const res = await request.get('/api/players/gt-pl1');
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · jugadores (admin de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('un admin de Lomeros no puede editar por id un jugador de otro grupo (404)', async ({ request }) => {
    const res = await request.put('/api/players/gt-pl1', { data: { name: 'Hackeado' } });
    expect(res.status()).toBe(404);
  });
});
