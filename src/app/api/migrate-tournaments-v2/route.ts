import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { TOURNAMENT_DDL, TOURNAMENT_DROP } from '@/lib/tournament/schema-ddl';

// POST /api/migrate-tournaments-v2 — REEMPLAZA el esquema de torneos del MODELO VIEJO
// (constructor de bloques: tabla `tournament_blocks` + columnas `block_id`) por el modelo
// nuevo del rediseño Pozo/Torneo (kind/format/config, sin bloques). Hace DROP + recreate.
// DESTRUCTIVO: NO conserva datos de torneos (la v1 desplegada no tenía torneos reales).
// Idempotente. Solo admin (la operación borra tablas en producción).
export async function POST() {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    for (const stmt of TOURNAMENT_DROP) await db.run(sql.raw(stmt));
    for (const stmt of TOURNAMENT_DDL) await db.run(sql.raw(stmt));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error en migrate-tournaments-v2', detail: String(error) }, { status: 500 });
  }
}
