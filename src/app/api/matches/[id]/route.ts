import { NextRequest, NextResponse } from 'next/server';
import type { NewMatch } from '@/lib/db/schema';
import { processMatchRatings } from '@/lib/rating/process-match';
import { coerceSide } from '@/lib/rating/side-stats';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
import {
  getMatchInGroup,
  getMatchSetsForMatch,
  updateMatchInGroup,
  deleteMatchInGroup,
  insertMatchSets,
} from '@/lib/matches/queries';
import { notifyMatchResult } from '@/lib/push/match-events';
import { settleMatchBets, refundOpenBets, reverseSettlement } from '@/lib/betting/settle';
import { notifyBetSettlements } from '@/lib/push/bet-events';

// GET /api/matches/[id]?g=<slug> (público; grupo por defecto = Lomeros)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const groupId = (await groupIdFromQuery(request)) ?? (await getDefaultGroupId());
    const match = await getMatchInGroup(groupId, id);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    const sets = await getMatchSetsForMatch(id);
    return NextResponse.json({ ...match, sets });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// DELETE /api/matches/[id]?g=<slug> (admin del grupo objetivo)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGroupAdmin(await groupIdFromQuery(request));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;
  try {
    const { id } = await params;
    const match = await getMatchInGroup(groupId, id);
    if (match) {
      if (match.status === 'completed') {
        await reverseSettlement(id);
      }
      const refunded = await refundOpenBets(id);
      await notifyBetSettlements(id, refunded);
    }
    // Los sets se borran en cascada (ON DELETE CASCADE). Scopeado por grupo.
    await deleteMatchInGroup(groupId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PUT /api/matches/[id] — add result to a scheduled match (admin del grupo objetivo; grupo en body.g)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    const { id } = await params;
    const {
      sets,
      team1Player1Id,
      team1Player2Id,
      team2Player1Id,
      team2Player2Id,
      team1Player1Side,
      team1Player2Side,
      team2Player1Side,
      team2Player2Side,
      photoUrl,
    } = body;

    if (!sets || sets.length < 2 || sets.length > 3) {
      return NextResponse.json({ error: 'El partido necesita 2 o 3 sets' }, { status: 400 });
    }

    const match = await getMatchInGroup(groupId, id);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (match.status === 'completed') {
      return NextResponse.json({ error: 'Este partido ya tiene resultado' }, { status: 400 });
    }

    // Reajuste opcional de parejas: los 4 ids deben coincidir con los del partido programado (in-group).
    const newPairingIds = [team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id];
    const pairingProvided = newPairingIds.every((v) => typeof v === 'string' && v.length > 0);
    if (pairingProvided) {
      if (new Set(newPairingIds).size !== 4) {
        return NextResponse.json({ error: 'Las parejas deben incluir 4 jugadores distintos' }, { status: 400 });
      }
      const originalIds = new Set([
        match.team1Player1Id,
        match.team1Player2Id,
        match.team2Player1Id,
        match.team2Player2Id,
      ]);
      if (!newPairingIds.every((pid) => originalIds.has(pid as string))) {
        return NextResponse.json(
          { error: 'Los jugadores deben coincidir con los del partido programado' },
          { status: 400 },
        );
      }
    }

    const sameTeam = (a: [string, string], b: [string, string]) =>
      [...a].sort().join() === [...b].sort().join();
    const pairingChanged = pairingProvided && !(
      sameTeam([match.team1Player1Id, match.team1Player2Id], [team1Player1Id, team1Player2Id]) &&
      sameTeam([match.team2Player1Id, match.team2Player2Id], [team2Player1Id, team2Player2Id])
    );

    let team1SetsWon = 0;
    let team2SetsWon = 0;
    for (const set of sets) {
      if (set.team1Games > set.team2Games) team1SetsWon++;
      else team2SetsWon++;
    }
    const winnerTeam: 1 | 2 = team1SetsWon > team2SetsWon ? 1 : 2;

    await insertMatchSets(id, sets);

    const updateFields: Partial<NewMatch> = { winnerTeam, status: 'completed' };
    if (pairingProvided) {
      updateFields.team1Player1Id = team1Player1Id;
      updateFields.team1Player2Id = team1Player2Id;
      updateFields.team2Player1Id = team2Player1Id;
      updateFields.team2Player2Id = team2Player2Id;
    }
    if (team1Player1Side !== undefined) updateFields.team1Player1Side = coerceSide(team1Player1Side);
    if (team1Player2Side !== undefined) updateFields.team1Player2Side = coerceSide(team1Player2Side);
    if (team2Player1Side !== undefined) updateFields.team2Player1Side = coerceSide(team2Player1Side);
    if (team2Player2Side !== undefined) updateFields.team2Player2Side = coerceSide(team2Player2Side);
    if (typeof photoUrl === 'string' && photoUrl.length > 0) updateFields.photoUrl = photoUrl;

    const updated = await updateMatchInGroup(groupId, id, updateFields);
    if (!updated) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });

    const ratingResult = await processMatchRatings({ ...updated, winnerTeam, sets });

    await notifyMatchResult({ ...updated, winnerTeam }, ratingResult);

    const betOutcomes = pairingChanged
      ? await refundOpenBets(id)
      : await settleMatchBets(id, winnerTeam, sets);
    await notifyBetSettlements(id, betOutcomes);

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar resultado' }, { status: 500 });
  }
}
