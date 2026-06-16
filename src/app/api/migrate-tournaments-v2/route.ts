import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { TOURNAMENT_DDL, TOURNAMENT_DROP } from '@/lib/tournament/schema-ddl';

const CONFIRM = 'replace-tournaments-schema';

// POST /api/migrate-tournaments-v2 — REEMPLAZA el esquema de torneos del MODELO VIEJO
// (constructor de bloques: tabla `tournament_blocks` + columnas `block_id`) por el modelo
// nuevo del rediseño Pozo/Torneo (kind/format/config, sin bloques). Hace DROP + recreate.
// DESTRUCTIVO: borra TODOS los datos de torneos. Úsalo UNA sola vez al migrar (la v1 no tenía
// torneos reales); NO lo vuelvas a llamar una vez existan torneos de verdad o los perderás.
// Solo admin + body { confirm: 'replace-tournaments-schema' } para evitar disparos accidentales.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== CONFIRM) {
    return NextResponse.json(
      { error: `Operación destructiva: envía { "confirm": "${CONFIRM}" } para confirmar.` },
      { status: 400 },
    );
  }
  try {
    for (const stmt of TOURNAMENT_DROP) await db.run(sql.raw(stmt));
    for (const stmt of TOURNAMENT_DDL) await db.run(sql.raw(stmt));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error en migrate-tournaments-v2', detail: String(error) }, { status: 500 });
  }
}
