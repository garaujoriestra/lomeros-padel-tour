import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { getTournamentMatchInGroup } from '@/lib/tournament/queries';
import { recordResult } from '@/lib/tournament/event-engine';

// POST /api/tournaments/[id]/matches/[matchId]/result — registra marcador (admin del grupo).
// Body: { gamesA, gamesB, g?: string }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; matchId: string }> }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const { id, matchId } = await params;
  try {
    const gamesA = body?.gamesA;
    const gamesB = body?.gamesB;
    if (!Number.isInteger(gamesA) || !Number.isInteger(gamesB) || gamesA < 0 || gamesB < 0) {
      return NextResponse.json({ error: 'Marcador inválido' }, { status: 400 });
    }
    // El partido debe pertenecer a un torneo del grupo, y a ESTE torneo de la URL.
    const m = await getTournamentMatchInGroup(auth.ctx.groupId, matchId);
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
