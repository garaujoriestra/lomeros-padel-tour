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

test.describe('paridad 2b · pozo y torneo públicos del grupo', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  test.describe('pozo del grupo (gt-tournament1, generado mínimamente por DB)', () => {
    // Mismo arnés que 'eventos del grupo con un evento generado' (más arriba en
    // este archivo): gt-tournament1 queda en 'draft' a propósito (usado por
    // no-fuga-tournaments/tournaments-scoping), así que se "genera" mínimamente
    // por DB para que aparezca en el listado público de eventos y se revierte en
    // el afterAll. La fila insertada NO lleva phase_tag = 'pozo' (a propósito,
    // igual que el arnés de eventos): listPozoMatches la filtra por phaseTag y la
    // ignora, así que la página del pozo renderiza sin partidos — evita arriesgar
    // un crash por slots incompletos; el objetivo de este test es la navegación
    // y el gate de grupo, no el contenido en marcha del pozo (ya cubierto por
    // pozo-public.spec.ts con un pozo generado de verdad vía el motor).
    test.beforeAll(async () => {
      const db = createClient({ url: TEST_ENV.DB_URL });
      await db.execute({ sql: "UPDATE tournaments SET status = 'scheduled' WHERE id = 'gt-tournament1'" });
      await db.execute({
        sql: `INSERT OR IGNORE INTO tournament_matches (id, tournament_id, round, status)
          VALUES (?, ?, ?, ?)`,
        args: ['gp-pozo-tmatch', 'gt-tournament1', 0, 'pending'],
      });
    });

    test.afterAll(async () => {
      const db = createClient({ url: TEST_ENV.DB_URL });
      await db.execute({ sql: "DELETE FROM tournament_matches WHERE id = 'gp-pozo-tmatch'" });
      await db.execute({ sql: "UPDATE tournaments SET status = 'draft' WHERE id = 'gt-tournament1'" });
    });

    test('desde eventos del grupo se navega al pozo bajo /g/[slug]', async ({ page }) => {
      await page.goto('/g/grupo-test/eventos');
      await page.locator('a[href="/g/grupo-test/pozos/gt-tournament1"]').click();
      await expect(page).toHaveURL('/g/grupo-test/pozos/gt-tournament1');
      await expect(page.getByRole('heading', { name: 'Torneo GT' })).toBeVisible();
    });
  });

  test('no-fuga inversa: un pozo de Lomeros no es visible bajo /g/grupo-test', async ({ page }) => {
    const admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/admin.json' });
    const created = await admin.post('/api/tournaments', {
      data: {
        name: 'E2E Pozo Lomeros No Fuga', date: '2026-07-12', location: null, kind: 'pozo', format: 'americano',
        config: { rounds: 1, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
        courts: [{ label: 'Central', order: 1, availableFrom: '17:00', availableTo: '20:00' }],
        participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4'],
      },
    });
    let id: string | undefined;
    try {
      expect(created.ok()).toBeTruthy();
      ({ id } = await created.json());

      await page.goto(`/g/grupo-test/pozos/${id}`);
      // Aserción positiva de not-found por UI (patrón de la Task 3: status no
      // determinista con force-dynamic, la UI sí lo es) + ausencia del nombre.
      await expect(page.getByText('Bola fuera')).toBeVisible();
      await expect(page.getByText('E2E Pozo Lomeros No Fuga')).toHaveCount(0);
    } finally {
      if (id) await admin.delete(`/api/tournaments/${id}`);
      await admin.dispose();
    }
  });

  // No hay fixture de torneo (kind='torneo') en grupo-test: se crea uno vía API
  // como gt-admin (patrón de tournaments-scoping.spec.ts), en draft (sin pairs ni
  // generate — basta para ejercer el gate de grupo y el contenido determinista de
  // un torneo sin generar), y se borra al final.
  test('torneo del grupo (draft, creado por API) es visible bajo /g/[slug]', async ({ page }) => {
    const admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/gt-admin.json' });
    const created = await admin.post('/api/tournaments', {
      data: {
        g: 'grupo-test',
        name: 'E2E Torneo GT Público', date: '2026-08-05', location: null, kind: 'torneo', format: 'single_elim',
        config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false },
        courts: [{ label: 'Central', order: 1, availableFrom: '17:00', availableTo: '23:00' }],
        participantPlayerIds: ['gt-pl1', 'gt-pl2', 'gt-pl3', 'gt-pl4'],
      },
    });
    let id: string | undefined;
    try {
      expect(created.ok()).toBeTruthy();
      ({ id } = await created.json());

      await page.goto(`/g/grupo-test/torneos/${id}`);
      await expect(page.getByRole('heading', { name: 'E2E Torneo GT Público' })).toBeVisible();
      await expect(page.getByText('El torneo aún no se ha generado.')).toBeVisible();
    } finally {
      if (id) await admin.delete(`/api/tournaments/${id}?g=grupo-test`);
      await admin.dispose();
    }
  });

  test('no-fuga inversa: un torneo inexistente bajo /g/grupo-test da not-found', async ({ page }) => {
    await page.goto('/g/grupo-test/torneos/no-existe-este-id');
    await expect(page.getByText('Bola fuera')).toBeVisible();
  });
});

test.describe('paridad 2b · cartera y edición de perfil del grupo', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  test.beforeEach(async ({ page }) => {
    // El recordatorio de notificaciones push es un modal que tapa la UI; se silencia.
    await page.addInitScript(() => sessionStorage.setItem('lpt-notif-reminder-dismissed', 'true'));
  });

  test('el enlace de cartera en /g/grupo-test/me lleva a la cartera bajo /g/[slug]', async ({ page }) => {
    await page.goto('/g/grupo-test/me');
    const link = page.locator('a[href="/g/grupo-test/me/tokens"]');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL('/g/grupo-test/me/tokens');
    // Saldo variable (otros specs de este mismo fichero mueven fichas de gt-pl1):
    // basta con un heading/estable de la cartera, no el número exacto.
    await expect(page.getByRole('heading', { name: /Mi cartera/ })).toBeVisible();
    // "fichas" aparece varias veces en la página (apuestas, premios); el rótulo
    // junto al saldo grande es exacto y único.
    await expect(page.getByText('fichas', { exact: true })).toBeVisible();
  });

  test('el enlace de editar perfil en /g/grupo-test/me apunta a /g/grupo-test/me/edit', async ({ page }) => {
    await page.goto('/g/grupo-test/me');
    await expect(page.locator('a[href="/g/grupo-test/me/edit"]')).toBeVisible();
  });

  test('edita el apodo en /g/grupo-test/me/edit y persiste al volver a /g/grupo-test/me', async ({ page }) => {
    const nickname = `E2E-${Date.now()}`;
    try {
      await page.goto('/g/grupo-test/me/edit');
      await page.getByLabel('Apodo').fill(nickname);
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(page).toHaveURL('/g/grupo-test/me');
      await expect(page.getByText(nickname)).toBeVisible();
    } finally {
      // Apodo idempotente: se restaura a vacío (null) vía la misma API group-aware.
      await page.request.patch('/api/me', {
        data: { g: 'grupo-test', nickname: '', avatarUrl: '', isLeftHanded: false },
      });
    }
  });
});

test.describe('paridad 2b · admin de pozos y torneos del grupo', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('el sidebar muestra Pozos y Torneos con hrefs bajo /g/grupo-test/admin', async ({ page }) => {
    await page.goto('/g/grupo-test/admin');
    await expect(page.locator('a[href="/g/grupo-test/admin/pozos"]')).toBeVisible();
    await expect(page.locator('a[href="/g/grupo-test/admin/torneos"]')).toBeVisible();
  });

  test('crea un pozo, lo comparte, lo genera y lo borra desde el admin del grupo (hermético)', async ({ page }) => {
    const name = `E2E Pozo GT ${Date.now()}`;
    let id: string | undefined;
    try {
      // Crear vía UI (mismo EventForm que /admin/pozos/new, ver event-create.spec.ts),
      // con roster de gt-pl5..8 (libres: gt-pl1..4 los ocupa gt-match1).
      await page.goto('/g/grupo-test/admin/pozos/new');
      await page.getByLabel('Nombre *').fill(name);
      await page.getByLabel('Fecha *').fill('2026-07-20');
      await page.getByLabel('Formato').selectOption('americano');
      await page.getByLabel('Nº de rondas').fill('2');
      await page.getByLabel('Nombre de la pista').first().fill('Central');
      for (const n of ['Jugador GT 5', 'Jugador GT 6', 'Jugador GT 7', 'Jugador GT 8']) {
        await page.getByRole('checkbox', { name: n }).check();
      }
      await page.getByRole('button', { name: 'Crear pozo' }).click();
      await expect(page).toHaveURL('/g/grupo-test/admin/pozos');

      const link = page.locator('a').filter({ hasText: name });
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      id = href?.split('/').pop();
      expect(id).toBeTruthy();

      await page.goto(`/g/grupo-test/admin/pozos/${id}`);
      await expect(page.getByRole('heading', { name })).toBeVisible();

      // Compartir: en el entorno de test Chromium no expone navigator.share, así que
      // ShareEventButton cae a clipboard.writeText — se intercepta para leer la URL
      // copiada y comprobar que lleva el basePath del grupo. Si el navegador SÍ
      // soportara Web Share nativo, se anota y se salta esta aserción concreta.
      const hasNativeShare = await page.evaluate(() => typeof navigator.share === 'function');
      if (!hasNativeShare) {
        await page.evaluate(() => {
          (window as unknown as { __copied?: string }).__copied = '';
          navigator.clipboard.writeText = async (text: string) => {
            (window as unknown as { __copied?: string }).__copied = text;
          };
        });
        await page.getByRole('button', { name: 'Compartir enlace' }).click();
        await expect(page.getByText('Enlace copiado')).toBeVisible();
        const copied = await page.evaluate(() => (window as unknown as { __copied?: string }).__copied);
        expect(copied).toContain(`/g/grupo-test/pozos/${id}`);
      }

      await page.getByRole('button', { name: 'Generar' }).click();
      await expect(page.getByText('Escalera').first()).toBeVisible();

      // Borrado hermético vía UI (mismo flujo que event-delete.spec.ts).
      await page.getByRole('button', { name: 'Eliminar pozo' }).first().click();
      await expect(page.getByRole('heading', { name: '¿Eliminar este pozo?' })).toBeVisible();
      await page.getByRole('button', { name: 'Sí, eliminar' }).click();
      await expect(page).toHaveURL('/g/grupo-test/admin/pozos');
      await expect(page.getByText(name)).toHaveCount(0);
      id = undefined; // ya borrado por la UI: el finally no necesita repetirlo.
    } finally {
      if (id) {
        const admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/gt-admin.json' });
        await admin.delete(`/api/tournaments/${id}?g=grupo-test`);
        await admin.dispose();
      }
    }
  });

  test('no-fuga: la lista de pozos del grupo no incluye pozos de Lomeros', async ({ page }) => {
    const lomerosAdmin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/admin.json' });
    let id: string | undefined;
    try {
      const created = await lomerosAdmin.post('/api/tournaments', {
        data: {
          name: 'E2E Pozo Lomeros Admin No Fuga', date: '2026-07-21', location: null, kind: 'pozo', format: 'americano',
          config: { rounds: 1, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
          courts: [{ label: 'Central', order: 1, availableFrom: '17:00', availableTo: '20:00' }],
          participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4'],
        },
      });
      expect(created.ok()).toBeTruthy();
      ({ id } = await created.json());

      await page.goto('/g/grupo-test/admin/pozos');
      // Ancla positiva: confirma que la lista de pozos del grupo renderizó de verdad
      // (un redirect/404 daría count 0 en la aserción negativa = falso positivo).
      await expect(page.getByRole('heading', { name: 'Pozos' })).toBeVisible();
      await expect(page.getByText('E2E Pozo Lomeros Admin No Fuga')).toHaveCount(0);
    } finally {
      if (id) await lomerosAdmin.delete(`/api/tournaments/${id}`);
      await lomerosAdmin.dispose();
    }
  });
});

test.describe('paridad 2b · admin de avisos/premios/canjes/timba del grupo', () => {
  test.describe('sidebar, avisos y timba (gt-admin)', () => {
    test.use({ storageState: 'e2e/.auth/gt-admin.json' });

    test('el sidebar muestra Avisos, Premios, Canjes y Timba con hrefs bajo /g/grupo-test/admin', async ({ page }) => {
      await page.goto('/g/grupo-test/admin');
      // Scope al <aside> del sidebar: el dashboard también enlaza Notificaciones
      // como acción rápida (paridad 2b), así que a nivel de página habría 2 matches.
      const sidebar = page.locator('aside');
      await expect(sidebar.locator('a[href="/g/grupo-test/admin/notifications"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/g/grupo-test/admin/rewards"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/g/grupo-test/admin/redemptions"]')).toBeVisible();
      await expect(sidebar.locator('a[href="/g/grupo-test/admin/timba"]')).toBeVisible();
    });

    test('envía un aviso desde /g/grupo-test/admin/notifications (200, con toast)', async ({ page }) => {
      await page.goto('/g/grupo-test/admin/notifications');
      await page.getByLabel('Título del aviso').fill('Aviso 2b');
      await page.getByLabel('Mensaje del aviso').fill('Mensaje de prueba paridad 2b');
      const [response] = await Promise.all([
        page.waitForResponse((res) => res.url().includes('/api/push/broadcast') && res.request().method() === 'POST'),
        page.getByRole('button', { name: 'Enviar' }).click(),
      ]);
      expect(response.status()).toBe(200);
      // Sin VAPID en e2e no hay dispositivos suscritos de verdad: el broadcast
      // igualmente responde 200 y el form muestra el toast de "enviado" (éxito o el
      // aviso de "sin dispositivos suscritos" según sent), nunca el de error.
      await expect(page.getByText(/Aviso enviado/)).toBeVisible();
    });

    test('la timba del grupo carga con el bote y los jugadores del grupo', async ({ page }) => {
      await page.goto('/g/grupo-test/admin/timba');
      await expect(page.getByRole('heading', { name: /La Timba/ })).toBeVisible();
      await expect(page.getByText('Bote actual')).toBeVisible();
      await expect(page.getByText('Jugador GT', { exact: false }).first()).toBeVisible();
      // Los jugadores de Lomeros ("Jugador <dígito>") no deben aparecer aquí.
      await expect(page.getByText(/Jugador \d/)).toHaveCount(0);
    });
  });

  test('crea un premio, gt-player lo canjea desde su cartera y gt-admin lo entrega (hermético, no-fuga)', async ({ browser }) => {
    const title = `Premio 2b ${Date.now()}`;
    const cost = 30;
    const db = createClient({ url: TEST_ENV.DB_URL });

    const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/gt-admin.json' });
    const adminPage = await adminCtx.newPage();
    const playerCtx = await browser.newContext({ storageState: 'e2e/.auth/gt-player.json' });
    const playerPage = await playerCtx.newPage();

    let rewardId: string | undefined;
    let redemptionId: string | undefined;
    let originalBalance: number | undefined;
    let penaltyResolved = false;

    try {
      // 1) gt-admin crea el premio desde /g/grupo-test/admin/rewards.
      await adminPage.goto('/g/grupo-test/admin/rewards');
      await adminPage.getByLabel('Título').fill(title);
      await adminPage.getByLabel('Coste (fichas)').fill(String(cost));
      await adminPage.getByRole('button', { name: 'Crear premio' }).click();
      await expect(adminPage.getByText(title)).toBeVisible();

      const rewardRow = await db.execute({ sql: 'SELECT id FROM rewards WHERE title = ?', args: [title] });
      rewardId = rewardRow.rows[0]?.id as string | undefined;
      expect(rewardId).toBeTruthy();

      // No-fuga: el premio recién creado en Grupo Test no aparece en /admin/rewards
      // de Lomeros (aserción por contenido, no por id/count — otros specs también
      // crean premios en ese catálogo).
      const lomerosCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
      const lomerosPage = await lomerosCtx.newPage();
      await lomerosPage.goto('/admin/rewards');
      await expect(lomerosPage.getByText(title)).toHaveCount(0);
      await lomerosCtx.close();

      // 2) gt-pl1 (fixture) tiene una penalización pendiente (gt-penalty1) que bloquea
      // el canje ("estás en bancarrota"): se resuelve temporalmente, igual que el
      // arnés de "flujo de apostar por UI" más arriba en este mismo archivo, y se
      // restaura en el finally. Saldo elevado temporalmente para poder pagar el coste.
      const balRow = await db.execute({ sql: "SELECT token_balance FROM players WHERE id = 'gt-pl1'" });
      originalBalance = balRow.rows[0]?.token_balance as number;
      await db.execute({ sql: "UPDATE players SET token_balance = 100 WHERE id = 'gt-pl1'" });
      await db.execute({ sql: "UPDATE penalties SET status = 'resolved' WHERE id = 'gt-penalty1'" });
      penaltyResolved = true;

      // 3) gt-player lo canjea desde su cartera (/g/grupo-test/me/tokens).
      await playerPage.goto('/g/grupo-test/me/tokens');
      const card = playerPage.getByText(title, { exact: true }).locator('..').locator('..');
      await card.getByRole('button', { name: new RegExp(`Canjear · ${cost} fichas`) }).click();
      await playerPage.getByRole('button', { name: `Sí, canjear ${cost} fichas` }).click();
      await expect(playerPage.getByText('Canje solicitado', { exact: false })).toBeVisible();
      // Saldo baja de 100 a 70 (único número "pelado" en la cartera: el resto de
      // fichas siempre aparecen junto a texto, p.ej. "30 fichas" o "-30 → 70").
      await expect(playerPage.getByText(String(100 - cost), { exact: true })).toBeVisible();

      const redemptionRow = await db.execute({
        sql: "SELECT id FROM redemptions WHERE reward_id = ? AND status = 'pending'",
        args: [rewardId as string],
      });
      redemptionId = redemptionRow.rows[0]?.id as string | undefined;
      expect(redemptionId).toBeTruthy();

      // 4) gt-admin lo marca entregado desde /g/grupo-test/admin/redemptions.
      await adminPage.goto('/g/grupo-test/admin/redemptions');
      const pendingRow = adminPage.locator('li').filter({ hasText: title });
      await expect(pendingRow).toBeVisible();
      await pendingRow.getByRole('button', { name: 'Entregado' }).click();
      await expect(adminPage.getByText('Canje marcado como entregado')).toBeVisible();
    } finally {
      // Restaura primero el estado compartido de gt-pl1 (penalty/saldo), aunque el
      // borrado de las filas efímeras falle.
      if (penaltyResolved) {
        await db.execute({ sql: "UPDATE penalties SET status = 'pending' WHERE id = 'gt-penalty1'" });
      }
      if (originalBalance !== undefined) {
        await db.execute({ sql: 'UPDATE players SET token_balance = ? WHERE id = ?', args: [originalBalance, 'gt-pl1'] });
      }
      if (redemptionId) await db.execute({ sql: 'DELETE FROM redemptions WHERE id = ?', args: [redemptionId] });
      if (rewardId) await db.execute({ sql: 'DELETE FROM rewards WHERE id = ?', args: [rewardId] });
      await adminCtx.close();
      await playerCtx.close();
    }
  });
});

test.describe('paridad 2b · editar partido y lados del grupo', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  // Partido efímero propio (gt-pl5..8, libres: gt-pl1..4 los ocupa gt-match1) en vez
  // de mutar gt-match1: aunque los lados/edición no deberían afectar a gt-bet1/
  // no-fuga-timba (son columnas propias del partido, no la apuesta), se prefiere no
  // arriesgarlo. Se crea ya completado (POST con sets) para poder ejercer también
  // Editar, que exige un partido con resultado registrado.
  let matchId: string;

  test.beforeAll(async () => {
    const admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/gt-admin.json' });
    const created = await admin.post('/api/matches', {
      data: {
        g: 'grupo-test',
        date: '2026-03-01',
        team1Player1Id: 'gt-pl5',
        team1Player2Id: 'gt-pl6',
        team2Player1Id: 'gt-pl7',
        team2Player2Id: 'gt-pl8',
        sets: [
          { setNumber: 1, team1Games: 6, team2Games: 2 },
          { setNumber: 2, team1Games: 6, team2Games: 3 },
        ],
      },
    });
    expect(created.ok()).toBeTruthy();
    ({ id: matchId } = await created.json());
    await admin.dispose();
  });

  test.afterAll(async () => {
    const admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/gt-admin.json' });
    await admin.delete(`/api/matches/${matchId}?g=grupo-test`);
    await admin.dispose();
  });

  test('la lista de partidos muestra Lados y Editar con hrefs bajo /g/[slug]/admin', async ({ page }) => {
    await page.goto('/g/grupo-test/admin/matches');
    await expect(page.locator(`a[href="/g/grupo-test/admin/matches/${matchId}/sides"]`)).toBeVisible();
    await expect(page.locator(`a[href="/g/grupo-test/admin/matches/${matchId}/edit"]`)).toBeVisible();
    // gt-match1 (scheduled) también muestra Lados: el bloque de programados no está
    // gateado a solo-completados.
    await expect(page.locator('a[href="/g/grupo-test/admin/matches/gt-match1/sides"]')).toBeVisible();
  });

  test('asigna lados desde /g/grupo-test/admin/matches/<id>/sides y vuelve a la lista', async ({ page }) => {
    await page.goto(`/g/grupo-test/admin/matches/${matchId}/sides`);
    await expect(page.getByRole('heading', { name: 'Lados de pista' })).toBeVisible();
    await page.locator('select').first().selectOption('drive');
    await page.getByRole('button', { name: 'Guardar lados' }).click();
    await expect(page).toHaveURL('/g/grupo-test/admin/matches');
  });

  test('edita el resultado desde /g/grupo-test/admin/matches/<id>/edit y vuelve a la lista', async ({ page }) => {
    await page.goto(`/g/grupo-test/admin/matches/${matchId}/edit`);
    await expect(page.getByRole('heading', { name: 'Corregir resultado' })).toBeVisible();
    // Corrige el 2º set de 6-3 a 6-4: el ganador (equipo 1) no cambia.
    await page.locator('input[type="number"]').nth(3).fill('4');
    await page.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(page).toHaveURL('/g/grupo-test/admin/matches');
  });
});

test.describe('paridad 2b · no-fuga transversal', () => {
  test.use({ storageState: 'e2e/.auth/gt-player.json' });

  // Matriz mínima de aislamiento cruzado (Task 10 del plan) para las superficies nuevas
  // bajo /g/[slug]. La mayoría de celdas ya quedaron cubiertas 1:1 al implementar cada
  // superficie (Tasks 3-9) o en los specs de no-fuga dedicados — se referencian aquí en
  // vez de duplicarlas exactas:
  //   - matches/[id]  Lomeros bajo /g/grupo-test/matches/<id>  → 'paridad 2b · detalle de
  //     partido del grupo' › 'no-fuga inversa: un partido de Lomeros...' (más arriba).
  //   - players/[id]  Lomeros bajo /g/grupo-test/players/pl1   → 'paridad 2b · ficha de
  //     jugador del grupo' › 'no-fuga: la ficha de un jugador de Lomeros...' (más arriba).
  //   - pozos/[id]    Lomeros bajo /g/grupo-test/pozos/<id>    → 'paridad 2b · pozo y
  //     torneo públicos del grupo' › 'no-fuga inversa: un pozo de Lomeros...' (más arriba).
  //   - rankings      /g/grupo-test/rankings sin 'Jugador 1'   → 'paridad 2b · rankings,
  //     eventos y partidos del grupo' (más arriba); /rankings raíz sin 'Jugador GT' →
  //     e2e/no-fuga-lecturas.spec.ts.
  // Lo que faltaba (añadido abajo): matches/[id] de Grupo Test bajo /matches en la raíz
  // (dirección inversa a la ya cubierta) y eventos/[grupo] sin eventos de Lomeros.

  test('un partido de Grupo Test no revela sus jugadores bajo /matches en la raíz (Lomeros)', async ({ page }) => {
    await page.goto('/matches/gt-match1');
    await expect(page.getByText('Bola fuera')).toBeVisible();
    await expect(page.getByText('Jugador GT')).toHaveCount(0);
  });

  test('la lista de eventos del grupo no incluye eventos de Lomeros', async ({ page }) => {
    const admin = await pwRequest.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/admin.json' });
    const name = `E2E Pozo Lomeros No Fuga Eventos ${Date.now()}`;
    let id: string | undefined;
    try {
      const created = await admin.post('/api/tournaments', {
        data: {
          name, date: '2026-07-22', location: null, kind: 'pozo', format: 'americano',
          config: { rounds: 1, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
          courts: [{ label: 'Central', order: 1, availableFrom: '17:00', availableTo: '20:00' }],
          participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4'],
        },
      });
      expect(created.ok()).toBeTruthy();
      ({ id } = await created.json());

      // Mismo arnés mínimo que 'eventos del grupo con un evento generado' (más arriba en
      // este archivo): status 'scheduled' + una fila de tournament_matches bastan para
      // que eventLiveState lo considere 'live' y aparezca en el listado público. Se borra
      // entero vía DELETE /api/tournaments más abajo (deleteEvent limpia también esta fila).
      const db = createClient({ url: TEST_ENV.DB_URL });
      await db.execute({ sql: "UPDATE tournaments SET status = 'scheduled' WHERE id = ?", args: [id as string] });
      await db.execute({
        sql: `INSERT OR IGNORE INTO tournament_matches (id, tournament_id, round, status)
          VALUES (?, ?, ?, ?)`,
        args: ['gp-transversal-eventos-tmatch', id as string, 0, 'pending'],
      });

      await page.goto('/g/grupo-test/eventos');
      // Ancla positiva: confirma que la lista de eventos del grupo renderizó de verdad
      // (un redirect/404 daría count 0 en la aserción negativa = falso positivo).
      await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible();
      await expect(page.getByText(name)).toHaveCount(0);
    } finally {
      if (id) await admin.delete(`/api/tournaments/${id}`);
      await admin.dispose();
    }
  });
});
