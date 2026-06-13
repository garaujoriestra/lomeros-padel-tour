import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/migrate-timba-v2 — reinicio limpio de La Timba para el modelo v2
// (pari-mutuel + buy-in). La Timba no se jugó con dinero real, así que se borra
// el estado y todos arrancan a 0 fichas. Idempotente.
export async function POST() {
  try {
    // 1. Columna juega_padel (default true) para players
    try {
      await db.run(sql`ALTER TABLE players ADD COLUMN juega_padel INTEGER NOT NULL DEFAULT 1`);
    } catch { /* ya existe */ }

    // 2. Reinicio del estado de apuestas
    await db.run(sql`DELETE FROM bets`);
    await db.run(sql`DELETE FROM token_ledger`);
    await db.run(sql`DELETE FROM redemptions`);
    await db.run(sql`DELETE FROM penalties`);
    await db.run(sql`UPDATE players SET token_balance = 0`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error en la migración v2', detail: String(error) }, { status: 500 });
  }
}
