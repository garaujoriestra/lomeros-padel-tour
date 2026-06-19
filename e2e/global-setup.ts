import { createClient } from '@libsql/client';
import { SignJWT } from 'jose';
import { mkdir, writeFile } from 'node:fs/promises';
import { BASE_URL, TEST_ENV } from '../playwright.config';

async function sessionStorageState(userId: string, role: 'admin' | 'player', secret: string) {
  const token = await new SignJWT({ userId, role })
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

  // Las columnas de players añadidas por migraciones posteriores (rasgo zurdo,
  // fichas de La Timba, juega_padel) no las crea /api/init-db, pero el schema
  // drizzle las espera: getSession hace `select().from(players)` con la fila
  // completa. Las añadimos aquí (idempotente) para que la sesión del jugador
  // cargue sin fallar y se muestre "Tu próximo partido".
  const playerColumns = [
    'is_left_handed INTEGER NOT NULL DEFAULT 0',
    'token_balance INTEGER NOT NULL DEFAULT 0',
    'juega_padel INTEGER NOT NULL DEFAULT 1',
  ];
  for (const col of playerColumns) {
    try {
      await db.execute(`ALTER TABLE players ADD COLUMN ${col}`);
    } catch {
      // La columna ya existe — seguir.
    }
  }

  // Mismo problema con `matches`: /api/init-db crea una versión reducida de la tabla,
  // pero el schema drizzle (que usa `select().from(matches)` en p.ej. la home pública)
  // espera columnas añadidas por migraciones posteriores. Las alineamos aquí
  // (idempotente) para que la home renderice sin "no such column".
  const matchColumns = [
    'time TEXT',
    'team1_player1_side TEXT',
    'team1_player2_side TEXT',
    'team2_player1_side TEXT',
    'team2_player2_side TEXT',
    'photo_url TEXT',
  ];
  for (const col of matchColumns) {
    try {
      await db.execute(`ALTER TABLE matches ADD COLUMN ${col}`);
    } catch {
      // La columna ya existe — seguir.
    }
  }

  // `player_achievements` tampoco la crea /api/init-db, pero el schema drizzle la
  // consulta (p.ej. la home hace `select().from(playerAchievements)`). La creamos
  // aquí (idempotente) para que la home pública renderice sin "no such table".
  await db.execute(`CREATE TABLE IF NOT EXISTS player_achievements (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    earned_at TEXT NOT NULL,
    trigger_match_id TEXT
  )`);

  // La tabla `bets` la crean las migraciones de La Timba (no /api/init-db ni las del
  // global-setup), pero el detalle de un partido PROGRAMADO la consulta vía
  // `currentMatchPools` (apuestas abiertas). Sin ella, la página revienta con
  // "no such table: bets". La creamos aquí (idempotente, `odds` ya nullable como en prod).
  await db.execute(`CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    market TEXT NOT NULL,
    predicted_team INTEGER NOT NULL,
    predicted_score TEXT,
    amount INTEGER NOT NULL,
    odds REAL,
    status TEXT NOT NULL DEFAULT 'open',
    payout INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    settled_at TEXT,
    UNIQUE (match_id, player_id, market)
  )`);

  // Las tablas de tokens/premios/penalizaciones/canjes de La Timba tampoco las crea
  // /api/init-db ni las migraciones del global-setup (en prod se crearon en su propia
  // migración). El schema drizzle las consulta (DAL de betting/rewards), así que las
  // creamos aquí (idempotente), reflejando el esquema de producción.
  await db.execute(`CREATE TABLE IF NOT EXISTS token_ledger (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref_id TEXT,
    balance_after INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (reason, ref_id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS rewards (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL DEFAULT 'lomeros',
    title TEXT NOT NULL,
    description TEXT,
    cost INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS redemptions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    reward_id TEXT NOT NULL,
    cost INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS penalties (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    recharge_amount INTEGER NOT NULL DEFAULT 250,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    fulfilled_at TEXT
  )`);

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
  await db.execute({
    sql: 'INSERT OR IGNORE INTO players (id, group_id, name) VALUES (?, ?, ?)',
    args: ['gt-pl1', 'grupo-test', 'Jugador GT'],
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

  // 3) storageStates con cookies de sesión forjadas.
  await mkdir('e2e/.auth', { recursive: true });
  await writeFile('e2e/.auth/admin.json', JSON.stringify(await sessionStorageState(adminId, 'admin', TEST_ENV.AUTH_SECRET)));
  await writeFile('e2e/.auth/player.json', JSON.stringify(await sessionStorageState(playerUserId, 'player', TEST_ENV.AUTH_SECRET)));
}
