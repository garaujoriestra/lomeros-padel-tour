import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/migrate-push
// Crea las tablas de notificaciones push. Ejecutar UNA vez tras desplegar:
//   curl -X POST https://<dominio>/api/migrate-push
export async function POST() {
  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS notification_log (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(match_id, kind)
      )
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al migrar push' }, { status: 500 });
  }
}
