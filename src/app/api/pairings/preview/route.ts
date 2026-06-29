import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pairStats } from '@/lib/db/schema';
import { and, inArray } from 'drizzle-orm';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromQuery } from '@/lib/groups/request-group';
import { getPlayersInGroup } from '@/lib/players/queries';
import { listMatchesInvolvingPlayers } from '@/lib/matches/queries';
import { computeSideStats, type SideStats } from '@/lib/rating/side-stats';
import { recommendPairings, type PlayerSummary } from '@/lib/rating/recommend-pairs';

export const dynamic = 'force-dynamic';

// GET /api/pairings/preview?g=<slug>&ids=p1,p2,p3,p4
// Devuelve las 3 combinaciones de parejas posibles con esos 4 jugadores
// (ordenadas por equilibrio de Elo) + el historial de las parejas relevantes.
// Misma lógica que la página pública del partido, pero on-demand para el formulario de admin.
export async function GET(request: NextRequest) {
  const auth = await requireGroupAdmin(await groupIdFromQuery(request));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  const idsParam = request.nextUrl.searchParams.get('ids') ?? '';
  const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);

  if (ids.length !== 4 || new Set(ids).size !== 4) {
    return NextResponse.json(
      { error: 'Se necesitan 4 jugadores distintos' },
      { status: 400 },
    );
  }

  try {
    const found = await getPlayersInGroup(groupId, ids);
    if (found.length !== 4) {
      return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 400 });
    }
    // Ordena según el orden recibido para que la combinación "Aplicar" sea estable.
    const playerMap = Object.fromEntries(found.map((p) => [p.id, p]));
    const four = ids.map((id) => playerMap[id]);

    const summaries = four.map<PlayerSummary>((p) => ({
      id: p.id,
      name: p.name,
      eloRating: p.eloRating,
      matchesPlayed: p.matchesPlayed,
    })) as [PlayerSummary, PlayerSummary, PlayerSummary, PlayerSummary];

    // Partidos completados que involucran a estos jugadores → side-stats.
    const involved = await listMatchesInvolvingPlayers(groupId, ids);
    const completed = involved.filter((m) => m.status === 'completed');

    const sideStatsByPlayer: Record<string, SideStats> = {};
    for (const id of ids) {
      sideStatsByPlayer[id] = computeSideStats(id, completed);
    }

    const options = recommendPairings(summaries, sideStatsByPlayer);

    // Historial de las parejas relevantes (cualquier par dentro de los 4).
    const relevantPairs = await db.select().from(pairStats).where(
      and(
        inArray(pairStats.player1Id, ids),
        inArray(pairStats.player2Id, ids),
      ),
    );
    const pairHistory = relevantPairs.map((p) => ({
      player1Id: p.player1Id,
      player2Id: p.player2Id,
      matchesPlayed: p.matchesPlayed,
      wins: p.wins,
      losses: p.losses,
      synergyScore: p.synergyScore,
    }));

    return NextResponse.json({ options, pairHistory });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al calcular las parejas' }, { status: 500 });
  }
}
