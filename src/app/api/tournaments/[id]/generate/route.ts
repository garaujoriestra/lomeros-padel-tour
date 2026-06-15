import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tournaments } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/guard';
import { generateAndStore } from '@/lib/tournament/store';

// POST /api/tournaments/[id]/generate — genera y persiste la parrilla. Devuelve { matchCount, warnings }.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!existing) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });

    const result = await generateAndStore(db, id);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al generar la parrilla' }, { status: 500 });
  }
}
