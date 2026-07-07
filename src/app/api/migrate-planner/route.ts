import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/migrate-planner
// Crea las tablas del planificador semanal. Ejecutar UNA vez tras desplegar:
//   curl -X POST https://<dominio>/api/migrate-planner
export async function POST() {
  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS courts (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL DEFAULT 'lomeros',
        owner_player_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS planner_slots (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL DEFAULT 'lomeros',
        week_start TEXT NOT NULL,
        day INTEGER NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        slots TEXT NOT NULL,
        UNIQUE (week_start, day, subject_type, subject_id)
      )
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al migrar planner' }, { status: 500 });
  }
}
