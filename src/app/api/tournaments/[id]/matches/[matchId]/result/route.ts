import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getTournamentMatchInGroup } from '@/lib/tournament/queries';
import { recordResult } from '@/lib/tournament/event-engine';

// POST /api/tournaments/[id]/matches/[matchId]/result — registra marcador (admin). Body: { gamesA, gamesB }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; matchId: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id, matchId } = await params;
  try {
    const body = await request.json();
    const gamesA = body?.gamesA;
    const gamesB = body?.gamesB;
    if (!Number.isInteger(gamesA) || !Number.isInteger(gamesB) || gamesA < 0 || gamesB < 0) {
      return NextResponse.json({ error: 'Marcador inválido' }, { status: 400 });
    }
    // El partido debe pertenecer a un torneo del grupo, y a ESTE torneo de la URL.
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const m = await getTournamentMatchInGroup(groupId, matchId);
    if (!m || m.tournamentId !== id) {
      return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    }
    await recordResult(db, matchId, gamesA, gamesB);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al registrar el resultado' }, { status: 500 });
  }
}
