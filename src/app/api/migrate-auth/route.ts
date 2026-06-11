import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/migrate-auth
// Crea la tabla `users` (lista blanca) e inserta el usuario admin.
// Ejecutar UNA vez tras desplegar:  curl -X POST https://<dominio>/api/migrate-auth
export async function POST() {
  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'player',
        player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    let adminSeeded = false;
    if (adminEmail) {
      await db.run(sql`
        INSERT INTO users (id, email, role)
        VALUES (${crypto.randomUUID()}, ${adminEmail}, 'admin')
        ON CONFLICT(email) DO UPDATE SET role = 'admin'
      `);
      adminSeeded = true;
    }

    return NextResponse.json({ success: true, adminSeeded });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al migrar auth' }, { status: 500 });
  }
}
