import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { trackFunnel } from '@/lib/analytics/events';
import { processMatchRatings, processDrawMatch } from '@/lib/rating/process-match';
import { coerceSide } from '@/lib/rating/side-stats';
import { resolveSetsOutcome, type SetInput } from '@/lib/matches/outcome';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
import { listMatchesByDate, createMatchInGroup, insertMatchSets } from '@/lib/matches/queries';
import { getPlayersInGroup } from '@/lib/players/queries';
import { notifyMatchResult, notifyMatchDraw } from '@/lib/push/match-events';
import { notifyBettingOpen } from '@/lib/push/bet-events';

// GET /api/matches?g=<slug> (público; grupo por defecto = Lomeros)
export async function GET(request: NextRequest) {
  try {
    const groupId = (await groupIdFromQuery(request)) ?? (await getDefaultGroupId());
    const all = await listMatchesByDate(groupId);
    return NextResponse.json(all);
  } catch {
    return NextResponse.json({ error: 'Error al obtener partidos' }, { status: 500 });
  }
}

// POST /api/matches (admin DEL GRUPO objetivo; grupo en body.g)
//   - With sets  → status='completed', calculates winner, triggers Elo
//                  (o status='draw' si quedó 1-1: cuenta partido, no mueve Elo)
//   - Without sets → status='scheduled', winnerTeam=null, no Elo yet
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    const {
      date,
      time,
      location,
      team1Player1Id,
      team1Player2Id,
      team2Player1Id,
      team2Player2Id,
      team1Player1Side,
      team1Player2Side,
      team2Player1Side,
      team2Player2Side,
      sets, // optional: [{setNumber, team1Games, team2Games}]
    } = body;

    // 4 distinct players always required
    const playerIds = [team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id];
    if (playerIds.some((id) => !id) || new Set(playerIds).size !== 4) {
      return NextResponse.json({ error: 'Se necesitan 4 jugadores distintos' }, { status: 400 });
    }

    // Los 4 jugadores deben pertenecer al grupo (no se cuela un jugador de otro grupo).
    const inGroup = await getPlayersInGroup(groupId, playerIds);
    if (inGroup.length !== 4) {
      return NextResponse.json({ error: 'Jugadores no válidos para este grupo' }, { status: 400 });
    }

    const isScheduled = !sets || sets.length === 0;

    let winnerTeam: 1 | 2 | null = null;
    let status: 'scheduled' | 'completed' | 'draw' = 'scheduled';
    let resolvedSets: SetInput[] = [];

    if (!isScheduled) {
      // Un 1-1 a sets (no dio tiempo al tercero) es un empate, no una victoria
      // del equipo 2 como salía del conteo antiguo.
      const outcome = resolveSetsOutcome(sets);
      if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 400 });
      winnerTeam = outcome.winnerTeam;
      status = outcome.status;
      resolvedSets = outcome.sets;
    }

    const match = await createMatchInGroup(groupId, {
      date,
      time: typeof time === 'string' && /^\d{2}:\d{2}$/.test(time) ? time : null,
      location: location?.trim() || null,
      team1Player1Id,
      team1Player2Id,
      team2Player1Id,
      team2Player2Id,
      team1Player1Side: coerceSide(team1Player1Side),
      team1Player2Side: coerceSide(team1Player2Side),
      team2Player1Side: coerceSide(team2Player1Side),
      team2Player2Side: coerceSide(team2Player2Side),
      winnerTeam,
      status,
    });

    if (isScheduled) {
      // Apuestas abiertas: avisa a todos los suscritos de La Timba. Best-effort.
      await notifyBettingOpen(match);
    } else {
      await insertMatchSets(match.id, resolvedSets);

      if (status === 'draw') {
        // El empate suma partido jugado pero no mueve el ranking.
        await processDrawMatch(match);
        await notifyMatchDraw(match);
      } else {
        const ratingResult = await processMatchRatings({
          ...match,
          winnerTeam: winnerTeam as 1 | 2,
          sets: resolvedSets,
        });

        await notifyMatchResult({ ...match, winnerTeam: winnerTeam as 1 | 2 }, ratingResult);
      }
    }

    // Funnel de captación: partidos registrados = grupo ACTIVADO (métrica norte).
    after(() => trackFunnel('partido_creado'));
    return NextResponse.json(match, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear partido' }, { status: 500 });
  }
}
