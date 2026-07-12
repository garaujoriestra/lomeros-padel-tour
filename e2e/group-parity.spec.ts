import { test, expect, request as pwRequest } from '@playwright/test';
import { createClient } from '@libsql/client';
import { BASE_URL, TEST_ENV } from '../playwright.config';

// Tarea 2b: paridad completa bajo /g/[slug]. Este spec crece por tasks (navegación,
// públicas, me, admin, no-fuga).

test.describe('paridad 2b · navegación de grupo', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  test('tabs y bottom-nav bajo el grupo, sin Info; hrefs con basePath', async ({ page }) => {
    await page.goto('/g/grupo-test');
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Ranking', exact: true })).toHaveAttribute('href', '/g/grupo-test/rankings');
    await expect(nav.getByRole('link', { name: 'Partidos', exact: true })).toHaveAttribute('href', '/g/grupo-test/matches');
    await expect(nav.getByRole('link', { name: 'Eventos', exact: true })).toHaveAttribute('href', '/g/grupo-test/eventos');
    await expect(nav.getByRole('link', { name: 'Info', exact: true })).toHaveCount(0);

    // BottomNav (móvil) también montado bajo el grupo, con hrefs prefijados.
    // En viewport de escritorio (por defecto) la barra está display:none
    // (globals.css, media ≥760px), así que sus links no aparecen en el árbol
    // de accesibilidad: se asierta a nivel DOM (locator CSS), no con getByRole.
    const bottomNav = page.locator('nav[aria-label="Navegación inferior"]');
    await expect(bottomNav).toHaveCount(1);
    await expect(bottomNav.locator('a', { hasText: 'La Timba' })).toHaveAttribute('href', '/g/grupo-test/rankings/tokens');
  });

  test('la raíz mantiene sus tabs de siempre', async ({ page }) => {
    await page.goto('/rankings');
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Partidos', exact: true })).toHaveAttribute('href', '/matches');
    await expect(nav.getByRole('link', { name: 'Info', exact: true })).toHaveAttribute('href', '/info');
  });
});

test.describe('paridad 2b · detalle de partido del grupo', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  // Este spec no comparte proceso con otros: sin un partido propio de Lomeros
  // (pl1..pl4, seeded globalmente sin match asociado), no hay id real que usar
  // para la aserción de no-fuga inversa.
  test.beforeAll(async () => {
    const db = createClient({ url: TEST_ENV.DB_URL });
    await db.execute({
      sql: `INSERT OR IGNORE INTO matches
        (id, group_id, date, time, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ['gp-lomeros-match', 'lomeros', '2027-01-01', '20:00', 'pl1', 'pl2', 'pl3', 'pl4', 'scheduled'],
    });
  });

  test.beforeEach(async ({ page }) => {
    // El recordatorio de notificaciones push es un modal que tapa la UI; se silencia.
    await page.addInitScript(() => sessionStorage.setItem('lpt-notif-reminder-dismissed', 'true'));
  });

  test('desde la home del grupo se navega al detalle del partido bajo /g/[slug]', async ({ page }) => {
    await page.goto('/g/grupo-test');
    await page.getByRole('link', { name: /Jugador GT/ }).first().click();
    await expect(page).toHaveURL('/g/grupo-test/matches/gt-match1');
    await expect(page.getByText('Jugador GT').first()).toBeVisible();
  });

  test('flujo de apostar por UI baja el saldo visible (partido nuevo con timba abierta)', async ({ page }) => {
    // gt-match1 es del 2026-01-01 (pasado): su timba ya está cerrada. Se crea un
    // partido nuevo con fecha muy futura para poder ejercer el flujo de apostar.
    // Crear partidos requiere admin del grupo → contexto aparte con gt-admin.
    const admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/gt-admin.json' });
    const created = await admin.post('/api/matches', {
      data: {
        g: 'grupo-test',
        date: '2027-06-01',
        time: '20:00',
        team1Player1Id: 'gt-pl5',
        team1Player2Id: 'gt-pl6',
        team2Player1Id: 'gt-pl7',
        team2Player2Id: 'gt-pl8',
      },
    });
    expect(created.ok()).toBeTruthy();
    const match = await created.json();

    try {
      const db = createClient({ url: TEST_ENV.DB_URL });
      await db.execute({ sql: "UPDATE players SET token_balance = 500 WHERE id = 'gt-pl1'" });
      // gt-pl1 tiene una penalización pendiente de fixture (gt-penalty1, usada por
      // otros specs de redemptions/bancarrota): se resuelve aquí para poder apostar.
      await db.execute({ sql: "UPDATE penalties SET status = 'resolved' WHERE id = 'gt-penalty1'" });

      await page.goto(`/g/grupo-test/matches/${match.id}`);
      await page.getByRole('spinbutton', { name: 'Fichas a apostar al ganador' }).fill('30');
      await page.getByRole('button', { name: /Apostar al ganador/i }).click();
      await expect(page.locator('[data-testid="bet-balance"]:visible')).toContainText('470');
    } finally {
      // La penalty se restaura PRIMERO: debe volver a 'pending' aunque el
      // DELETE del partido falle (otros specs dependen de esa fixture).
      const db = createClient({ url: TEST_ENV.DB_URL });
      await db.execute({ sql: "UPDATE penalties SET status = 'pending' WHERE id = 'gt-penalty1'" });
      await admin.delete(`/api/matches/${match.id}?g=grupo-test`);
    }
  });

  test('no-fuga inversa: un partido de Lomeros no revela sus jugadores bajo /g/grupo-test', async ({ page, request }) => {
    const list = await request.get('/api/matches');
    const matches = (await list.json()) as Array<{ id: string }>;
    expect(matches.length).toBeGreaterThan(0);
    const lomerosMatchId = matches[0].id;

    await page.goto(`/g/grupo-test/matches/${lomerosMatchId}`);
    // Los jugadores de Lomeros se llaman "Jugador <N>" (dígito); los de Grupo Test
    // se llaman "Jugador GT" — el patrón no debe aparecer en la página 404.
    await expect(page.getByText(/Jugador \d/)).toHaveCount(0);
  });
});

test.describe('paridad 2b · ficha de jugador del grupo', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  test.beforeEach(async ({ page }) => {
    // El recordatorio de notificaciones push es un modal que tapa la UI; se silencia.
    await page.addInitScript(() => sessionStorage.setItem('lpt-notif-reminder-dismissed', 'true'));
  });

  test('desde el detalle del partido se navega a la ficha del jugador bajo /g/[slug]', async ({ page }) => {
    await page.goto('/g/grupo-test/matches/gt-match1');
    // El nombre accesible del link de jugador incluye Elo/proyección ("J Jugador GT
    // 1500 Elo ▲ +20 ▼ -20"), así que se localiza por href exacto (gt-pl1) en vez de
    // por texto — evita además matchear 'Jugador GT 2'/'3'/'4', también en el equipo.
    await page.locator('a[href="/g/grupo-test/players/gt-pl1"]').first().click();
    await expect(page).toHaveURL('/g/grupo-test/players/gt-pl1');
    await expect(page.getByRole('heading', { name: 'Jugador GT' })).toBeVisible();

    // gt-match1 (el único partido de gt-pl1 en fixtures) está 'scheduled', no 'completed':
    // el bloque de Historial de la ficha solo lista partidos completados, así que no
    // sale. Se asierta su ausencia de forma determinista en vez de forzar un enlace
    // que no existe con estos fixtures (ver nota de la Task 3 del plan).
    await expect(page.getByText('Historial', { exact: true })).toHaveCount(0);
  });

  test('el historial de la ficha enlaza a los partidos bajo /g/[slug] (basePath)', async ({ page }) => {
    // Partido COMPLETADO efímero para gt-pl5..8 (POST con sets crea completado
    // directo). gt-match1 NO se completa: gt-bet1 y no-fuga-timba dependen de que
    // siga 'scheduled'. OJO deliberado: DELETE de un partido completado NO revierte
    // Elo/wins/pair_stats de los jugadores (solo apuestas vía reverseSettlement;
    // rating_history sí cae por ON DELETE CASCADE) — es el mismo drift que ya
    // acepta onboarding.spec con estos 4 jugadores, y ningún spec asume Elo
    // virgen de gt-pl5..8.
    const admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/gt-admin.json' });
    const created = await admin.post('/api/matches', {
      data: {
        g: 'grupo-test',
        date: '2026-02-01',
        team1Player1Id: 'gt-pl5',
        team1Player2Id: 'gt-pl6',
        team2Player1Id: 'gt-pl7',
        team2Player2Id: 'gt-pl8',
        sets: [
          { setNumber: 1, team1Games: 6, team2Games: 3 },
          { setNumber: 2, team1Games: 6, team2Games: 4 },
        ],
      },
    });
    expect(created.ok()).toBeTruthy();
    const match = (await created.json()) as { id: string };

    try {
      await page.goto('/g/grupo-test/players/gt-pl5');
      await expect(page.getByText('Historial', { exact: true })).toBeVisible();
      // El enlace del historial lleva el basePath del grupo (threading de la Task 3).
      await expect(page.locator(`a[href="/g/grupo-test/matches/${match.id}"]`).first()).toBeVisible();
    } finally {
      await admin.delete(`/api/matches/${match.id}?g=grupo-test`);
      await admin.dispose();
    }
  });

  test('no-fuga: la ficha de un jugador de Lomeros no es visible bajo /g/grupo-test', async ({ page }) => {
    await page.goto('/g/grupo-test/players/pl1');
    // Aserción positiva de not-found por UI ("Bola fuera" = app/not-found.tsx):
    // con force-dynamic el notFound() se streamea y el status del documento puede
    // ser 200 (el server log lo confirma), así que el status no es determinista —
    // la UI sí.
    await expect(page.getByText('Bola fuera')).toBeVisible();
    await expect(page.getByText('Jugador 1', { exact: true })).toHaveCount(0);
  });
});

test.describe('paridad 2b · rankings, eventos y partidos del grupo', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  test('el ranking del grupo lista solo sus jugadores, con la tab activa', async ({ page }) => {
    await page.goto('/g/grupo-test/rankings');
    await expect(page.getByText('Jugador GT', { exact: true })).toBeVisible();
    await expect(page.getByText('Jugador 1', { exact: true })).toHaveCount(0);

    // Tab activa: el navbar marca el link con la clase `active` (globals.css
    // .nav-tab.active) según isNavActive(pathname) — aserción robusta porque
    // ese mecanismo ya se ejerce en el describe de navegación de este mismo
    // archivo (no depende de estilos computados, solo de la clase CSS).
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Ranking', exact: true })).toHaveClass(/active/);
  });

  test('ranking de parejas y clasificación de La Timba del grupo responden con su heading', async ({ page }) => {
    await page.goto('/g/grupo-test/rankings/pairs');
    await expect(page.getByRole('heading', { name: 'Ranking de parejas' })).toBeVisible();

    await page.goto('/g/grupo-test/rankings/tokens');
    await expect(page.getByRole('heading', { name: 'La Timba — clasificación' })).toBeVisible();
  });

  test.describe('eventos del grupo con un evento generado', () => {
    // gt-tournament1 (fixture del global-setup) queda en 'draft' a propósito
    // (usado por no-fuga-tournaments/tournaments-scoping): el listado público
    // filtra los borradores, así que aquí se lo "genera" mínimamente por DB
    // (sin pasar por el motor real, que exige parejas/participantes) para
    // ejercer el listado público — y se revierte en el afterAll para no
    // afectar a esos otros specs.
    test.beforeAll(async () => {
      const db = createClient({ url: TEST_ENV.DB_URL });
      await db.execute({ sql: "UPDATE tournaments SET status = 'scheduled' WHERE id = 'gt-tournament1'" });
      await db.execute({
        sql: `INSERT OR IGNORE INTO tournament_matches (id, tournament_id, round, status)
          VALUES (?, ?, ?, ?)`,
        args: ['gp-eventos-tmatch', 'gt-tournament1', 0, 'pending'],
      });
    });

    test.afterAll(async () => {
      const db = createClient({ url: TEST_ENV.DB_URL });
      await db.execute({ sql: "DELETE FROM tournament_matches WHERE id = 'gp-eventos-tmatch'" });
      await db.execute({ sql: "UPDATE tournaments SET status = 'draft' WHERE id = 'gt-tournament1'" });
    });

    test('la lista de eventos del grupo enlaza al torneo bajo /g/[slug]', async ({ page }) => {
      await page.goto('/g/grupo-test/eventos');
      const link = page.locator('a[href="/g/grupo-test/pozos/gt-tournament1"]');
      await expect(link).toBeVisible();
      await expect(link.getByText('Torneo GT')).toBeVisible();
    });
  });

  test('la lista de partidos del grupo muestra solo los suyos, con el link bajo /g/[slug]', async ({ page }) => {
    await page.goto('/g/grupo-test/matches');
    await expect(page.getByText('Jugador GT', { exact: true }).first()).toBeVisible();
    // Los jugadores de Lomeros se llaman "Jugador <N>" (dígito); ver nota de
    // no-fuga inversa más arriba en este mismo archivo.
    await expect(page.getByText(/Jugador \d/)).toHaveCount(0);
    await expect(page.locator('a[href="/g/grupo-test/matches/gt-match1"]').first()).toBeVisible();
  });
});
