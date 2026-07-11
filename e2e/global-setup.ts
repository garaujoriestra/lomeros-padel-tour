import { createClient } from '@libsql/client';
import { SignJWT } from 'jose';
import { mkdir, writeFile } from 'node:fs/promises';
import { BASE_URL, TEST_ENV } from '../playwright.config';
import { ensureAuxTables } from '../src/lib/db/bootstrap';

async function sessionStorageState(userId: string, secret: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(secret));
  return {
    cookies: [{
      name: 'session', value: token, domain: 'localhost', path: '/',
      expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' as const,
    }],
    origins: [],
  };
}

export default async function globalSetup() {
  // 1) Migraciones de esquema (el dev server ya está arriba; estos endpoints no requieren auth).
  // (Las memberships de estos usuarios e2e se siembran en el paso 2, porque migrate-multitenant
  // corre aquí antes de que existan los usuarios.)
  for (const ep of ['init-db', 'migrate-auth', 'migrate-tournaments', 'migrate-multitenant']) {
    const res = await fetch(`${BASE_URL}/api/${ep}`, { method: 'POST' });
    if (!res.ok) throw new Error(`Migración /api/${ep} falló: ${res.status}`);
  }

  // 2) Seed directo en la DB de fichero.
  const db = createClient({ url: TEST_ENV.DB_URL });

  // Tablas/columnas auxiliares que init-db y las migraciones no crean (compartido con seed-staging).
  await ensureAuxTables(db);

  for (let i = 1; i <= 8; i++) {
    await db.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [`pl${i}`, `Jugador ${i}`] });
  }
  // Usuario "jugador" ligado a pl1 (para probar "tu próximo partido").
  const playerUserId = 'e2e-player-user';
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (id, email, role, player_id) VALUES (?, ?, ?, ?)',
    args: [playerUserId, 'pl1@test.com', 'player', 'pl1'],
  });
  // El usuario admin lo creó migrate-auth desde ADMIN_EMAIL.
  const adminRow = await db.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  const adminId = adminRow.rows[0]?.id as string | undefined;
  if (!adminId) throw new Error('No hay usuario admin (¿ADMIN_EMAIL no se aplicó en migrate-auth?)');

  // memberships en Lomeros para los usuarios e2e. migrate-multitenant corrió en el paso 1
  // (antes de sembrar estos usuarios), así que su backfill no los cubrió: los añadimos aquí.
  await db.execute({
    sql: 'INSERT OR IGNORE INTO memberships (id, user_id, group_id, role, player_id) VALUES (?, ?, ?, ?, ?)',
    args: ['mb-admin', adminId, 'lomeros', 'admin', null],
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO memberships (id, user_id, group_id, role, player_id) VALUES (?, ?, ?, ?, ?)',
    args: ['mb-player', playerUserId, 'lomeros', 'player', 'pl1'],
  });

  // Segundo grupo "Grupo Test" con un jugador propio, para los tests de no-fuga.
  // Lomeros nunca debe ver a gt-pl1, ni poder tocarlo por id.
  await db.execute({
    sql: 'INSERT OR IGNORE INTO groups (id, slug, name) VALUES (?, ?, ?)',
    args: ['grupo-test', 'grupo-test', 'Grupo Test'],
  });

  // Usuario admin del "Grupo Test" (membership admin en grupo-test). Para probar que un
  // admin de su propio grupo SÍ puede escribir en él, y que un admin de Lomeros NO.
  const gtAdminUserId = 'e2e-gt-admin-user';
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (id, email, role) VALUES (?, ?, ?)',
    args: [gtAdminUserId, 'gt-admin@test.com', 'player'],
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO memberships (id, user_id, group_id, role, player_id) VALUES (?, ?, ?, ?, ?)',
    args: ['mb-gt-admin', gtAdminUserId, 'grupo-test', 'admin', null],
  });

  // Usuario JUGADOR del "Grupo Test" (membership player ligada a gt-pl1). Para probar
  // flujos de jugador (bets/redemptions/me) group-aware en grupo-test.
  // El usuario se crea aquí; la membership se inserta DESPUÉS de gt-pl1 (FK).
  const gtPlayerUserId = 'e2e-gt-player-user';
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (id, email, role) VALUES (?, ?, ?)',
    args: [gtPlayerUserId, 'gt-player@test.com', 'player'],
  });

  await db.execute({
    sql: 'INSERT OR IGNORE INTO players (id, group_id, name) VALUES (?, ?, ?)',
    args: ['gt-pl1', 'grupo-test', 'Jugador GT'],
  });

  // Membership gt-player después de gt-pl1 (FK player_id → players.id).
  await db.execute({
    sql: 'INSERT OR IGNORE INTO memberships (id, user_id, group_id, role, player_id) VALUES (?, ?, ?, ?, ?)',
    args: ['mb-gt-player', gtPlayerUserId, 'grupo-test', 'player', 'gt-pl1'],
  });

  // 3 jugadores más del grupo de test + un partido programado suyo, para no-fuga de partidos.
  for (let i = 2; i <= 4; i++) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO players (id, group_id, name) VALUES (?, ?, ?)',
      args: [`gt-pl${i}`, 'grupo-test', `Jugador GT ${i}`],
    });
  }
  await db.execute({
    sql: `INSERT OR IGNORE INTO matches
      (id, group_id, date, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ['gt-match1', 'grupo-test', '2026-01-01', 'gt-pl1', 'gt-pl2', 'gt-pl3', 'gt-pl4', 'scheduled'],
  });

  // Estado de La Timba y premios del "Grupo Test", para no-fuga: una apuesta abierta
  // de gt-pl1 en su partido, una penalización pendiente suya, un premio de su grupo y
  // un canje. Lomeros nunca debe ver ni tocar nada de esto.
  await db.execute({
    sql: `INSERT OR IGNORE INTO bets (id, match_id, player_id, market, predicted_team, amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: ['gt-bet1', 'gt-match1', 'gt-pl1', 'winner', 1, 50, 'open'],
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO penalties (id, player_id, status) VALUES (?, ?, ?)`,
    args: ['gt-penalty1', 'gt-pl1', 'pending'],
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO rewards (id, group_id, title, cost, active) VALUES (?, ?, ?, ?, ?)`,
    args: ['gt-reward1', 'grupo-test', 'Premio GT', 100, 1],
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO redemptions (id, player_id, reward_id, cost, status) VALUES (?, ?, ?, ?, ?)`,
    args: ['gt-redemption1', 'gt-pl1', 'gt-reward1', 100, 'pending'],
  });

  // Un torneo (pozo) del "Grupo Test", para no-fuga: Lomeros nunca debe listarlo,
  // cargarlo, generarlo, editarlo, borrarlo ni registrar resultados en él.
  await db.execute({
    sql: `INSERT OR IGNORE INTO tournaments (id, group_id, name, date, kind, format, config, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ['gt-tournament1', 'grupo-test', 'Torneo GT', '2026-01-01', 'pozo', 'americano', '{}', 'draft'],
  });

  // Usuario MULTI-GRUPO (membership player en Lomeros y en Grupo Test, sin ficha), para
  // el conmutador de grupos. OJO: los tests del fallback "única membership" usan a
  // gt-admin/gt-player, que siguen teniendo una sola — este usuario es aparte.
  const multiUserId = 'e2e-multi-user';
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (id, email, role) VALUES (?, ?, ?)',
    args: [multiUserId, 'multi@test.com', 'player'],
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO memberships (id, user_id, group_id, role, player_id) VALUES (?, ?, ?, ?, ?)',
    args: ['mb-multi-lomeros', multiUserId, 'lomeros', 'player', null],
  });
  await db.execute({
    sql: 'INSERT OR IGNORE INTO memberships (id, user_id, group_id, role, player_id) VALUES (?, ?, ?, ?, ?)',
    args: ['mb-multi-gt', multiUserId, 'grupo-test', 'player', null],
  });

  // Usuario SÚPER-ADMIN (allowlist SUPER_ADMIN_EMAILS del webServer, SIN memberships):
  // ve todos los grupos en el conmutador, el admin de grupo en solo-lectura, y genera
  // los enlaces de invitación del onboarding. Fixture ÚNICO compartido por ambas suites.
  const superUserId = 'e2e-super-user';
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (id, email, role) VALUES (?, ?, ?)',
    args: [superUserId, TEST_ENV.SUPER_ADMIN_EMAIL, 'player'],
  });

  // 3) storageStates con cookies de sesión forjadas.
  await mkdir('e2e/.auth', { recursive: true });
  await writeFile('e2e/.auth/admin.json', JSON.stringify(await sessionStorageState(adminId, TEST_ENV.AUTH_SECRET)));
  await writeFile('e2e/.auth/player.json', JSON.stringify(await sessionStorageState(playerUserId, TEST_ENV.AUTH_SECRET)));
  await writeFile('e2e/.auth/gt-admin.json', JSON.stringify(await sessionStorageState(gtAdminUserId, TEST_ENV.AUTH_SECRET)));
  await writeFile('e2e/.auth/gt-player.json', JSON.stringify(await sessionStorageState(gtPlayerUserId, TEST_ENV.AUTH_SECRET)));
  await writeFile('e2e/.auth/multi.json', JSON.stringify(await sessionStorageState(multiUserId, TEST_ENV.AUTH_SECRET)));
  await writeFile('e2e/.auth/super.json', JSON.stringify(await sessionStorageState(superUserId, TEST_ENV.AUTH_SECRET)));
  // Alias del mismo súper-admin para la suite de onboarding.
  await writeFile('e2e/.auth/super-admin.json', JSON.stringify(await sessionStorageState(superUserId, TEST_ENV.AUTH_SECRET)));
}
