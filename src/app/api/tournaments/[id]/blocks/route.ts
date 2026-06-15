import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tournaments, tournamentParticipants } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/guard';
import { replaceBlocks } from '@/lib/tournament/store';
import { validateBlocks } from '@/lib/tournament/validation';

// PUT /api/tournaments/[id]/blocks — reemplaza todos los bloques del torneo.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!existing) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });

    const body = await request.json();
    const parts = await db.select({ playerId: tournamentParticipants.playerId })
      .from(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
    const participantIds = new Set(parts.map((p) => p.playerId));

    const v = validateBlocks(body, participantIds);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    await replaceBlocks(db, id, v.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar los bloques' }, { status: 500 });
  }
}
