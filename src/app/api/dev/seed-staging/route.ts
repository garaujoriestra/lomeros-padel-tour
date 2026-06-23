import { NextRequest, NextResponse } from 'next/server';
import { client } from '@/lib/db';
import { ensureAuxTables } from '@/lib/db/bootstrap';
import { isDevToolingEnabled } from '@/lib/auth/dev-login';

const DEMO_GROUP_ID = 'grupo-demo';

// POST /api/dev/seed-staging
// Monta el esquema (idempotente) y siembra un "Grupo Demo" sobre una staging fresca.
// SOLO fuera de producción. Reset = recrear la DB Turso + 1 POST aquí.
export async function POST(request: NextRequest) {
  if (!isDevToolingEnabled()) {
    return NextResponse.json({ error: 'No disponible en producción' }, { status: 403 });
  }

  const origin = new URL(request.url).origin;
  const migrations = ['init-db', 'migrate-auth', 'migrate-tournaments', 'migrate-multitenant'];
  const ran: Record<string, number> = {};
  for (const ep of migrations) {
    const res = await fetch(`${origin}/api/${ep}`, { method: 'POST' });
    ran[ep] = res.status;
    if (!res.ok) {
      return NextResponse.json({ error: `Migración ${ep} falló`, ran }, { status: 500 });
    }
  }

  // Tablas/columnas aux que ningún endpoint crea (mismo set que el global-setup de e2e).
  await ensureAuxTables(client);

  // Grupo Demo (id/slug distinto al 'grupo-test' de e2e). SQL raw + INSERT OR IGNORE = idempotente.
  await client.execute({
    sql: 'INSERT OR IGNORE INTO groups (id, slug, name) VALUES (?, ?, ?)',
    args: [DEMO_GROUP_ID, DEMO_GROUP_ID, 'Grupo Demo'],
  });
  const demoAdminId = 'demo-admin';
  await client.execute({
    sql: 'INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)',
    args: [demoAdminId, 'admin@grupo-demo.test'],
  });
  await client.execute({
    sql: 'INSERT OR IGNORE INTO memberships (id, user_id, group_id, role, player_id) VALUES (?, ?, ?, ?, ?)',
    args: ['demo-mb-admin', demoAdminId, DEMO_GROUP_ID, 'admin', null],
  });
  for (let i = 1; i <= 4; i++) {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO players (id, group_id, name) VALUES (?, ?, ?)',
      args: [`demo-pl${i}`, DEMO_GROUP_ID, `Jugador Demo ${i}`],
    });
  }

  return NextResponse.json({ ok: true, ran, demoGroup: DEMO_GROUP_ID });
}
