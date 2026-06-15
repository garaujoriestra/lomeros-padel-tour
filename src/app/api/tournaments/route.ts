import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/guard';
import { createTournament } from '@/lib/tournament/store';
import { validateTournamentShell } from '@/lib/tournament/validation';

// POST /api/tournaments — crea el cascarón del torneo (sin bloques). Devuelve { id }.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const body = await request.json();
    const roster = await db.select({ id: players.id }).from(players);
    const rosterIds = new Set(roster.map((p) => p.id));

    const v = validateTournamentShell(body, rosterIds);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const id = await createTournament(db, {
      name: v.value.name,
      date: v.value.date,
      location: v.value.location ?? undefined,
      notes: v.value.notes ?? undefined,
      createdBy: auth.session.userId,
      courts: v.value.courts,
      participantPlayerIds: v.value.participantPlayerIds,
      blocks: [],
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear el torneo' }, { status: 500 });
  }
}
