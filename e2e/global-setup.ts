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
  for (const ep of ['init-db', 'migrate-auth', 'migrate-tournaments']) {
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

  // 3) storageStates con cookies de sesión forjadas.
  await mkdir('e2e/.auth', { recursive: true });
  await writeFile('e2e/.auth/admin.json', JSON.stringify(await sessionStorageState(adminId, 'admin', TEST_ENV.AUTH_SECRET)));
  await writeFile('e2e/.auth/player.json', JSON.stringify(await sessionStorageState(playerUserId, 'player', TEST_ENV.AUTH_SECRET)));
}
