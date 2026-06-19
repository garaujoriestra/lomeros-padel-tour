import { test, expect } from '@playwright/test';

// Las páginas de lectura del grupo por defecto (Lomeros) nunca muestran datos del 2º grupo.
// Verificación por CONTENIDO (el nombre del jugador ajeno no aparece en el HTML).
test.describe('no-fuga · lecturas públicas', () => {
  test('el ranking individual no muestra jugadores de otro grupo', async ({ request }) => {
    const res = await request.get('/rankings');
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).not.toContain('Jugador GT');
  });

  test('la clasificación de La Timba no muestra jugadores de otro grupo', async ({ request }) => {
    const res = await request.get('/rankings/tokens');
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).not.toContain('Jugador GT');
  });

  test('la lista de partidos no muestra jugadores de otro grupo', async ({ request }) => {
    const res = await request.get('/matches');
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).not.toContain('Jugador GT');
  });

  test('el perfil de un jugador de otro grupo no revela su nombre', async ({ request }) => {
    const res = await request.get('/players/gt-pl1');
    expect(await res.text()).not.toContain('Jugador GT');
  });

  test('GET /api/rankings no incluye jugadores de otro grupo', async ({ request }) => {
    const res = await request.get('/api/rankings');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { individual: Array<{ id: string }> };
    expect(body.individual.map((p) => p.id)).not.toContain('gt-pl1');
  });
});
