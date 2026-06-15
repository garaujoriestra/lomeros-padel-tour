import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { TOURNAMENT_DDL } from '@/lib/tournament/schema-ddl';

// POST /api/migrate-tournaments — crea las tablas del constructor de torneos.
// Idempotente: CREATE TABLE IF NOT EXISTS. DDL en src/lib/tournament/schema-ddl.ts.
export async function POST() {
  try {
    for (const stmt of TOURNAMENT_DDL) {
      await db.run(sql.raw(stmt));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error en migrate-tournaments', detail: String(error) }, { status: 500 });
  }
}
