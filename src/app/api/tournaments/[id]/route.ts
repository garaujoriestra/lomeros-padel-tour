import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, tournaments } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/guard';
import { updateTournamentShell } from '@/lib/tournament/store';
import { validateTournamentShell } from '@/lib/tournament/validation';

// PATCH /api/tournaments/[id] — edita el cascarón (meta + pistas + participantes).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!existing) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });

    const body = await request.json();
    const roster = await db.select({ id: players.id }).from(players);
    const rosterIds = new Set(roster.map((p) => p.id));

    const v = validateTournamentShell(body, rosterIds);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    await updateTournamentShell(db, id, v.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar el torneo' }, { status: 500 });
  }
}
