import { NextRequest, NextResponse } from 'next/server';
import type { NewMatch } from '@/lib/db/schema';
import { processMatchRatings, processDrawMatch } from '@/lib/rating/process-match';
import { coerceSide } from '@/lib/rating/side-stats';
import { resolveSetsOutcome } from '@/lib/matches/outcome';
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
import { notifyMatchResult, notifyMatchDraw } from '@/lib/push/match-events';
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

    // Un 1-1 a sets (no dio tiempo al tercero) se resuelve como empate.
    const outcome = resolveSetsOutcome(sets);
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 400 });

    const match = await getMatchInGroup(groupId, id);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (match.status === 'completed' || match.status === 'draw') {
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

    const resolvedSets = outcome.sets;

    await insertMatchSets(id, resolvedSets);

    const updateFields: Partial<NewMatch> = {
      winnerTeam: outcome.winnerTeam,
      status: outcome.status,
    };
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

    let betOutcomes;
    if (outcome.status === 'draw') {
      // Empate: cuenta como partido jugado pero no mueve el ranking, y en La
      // Timba nadie acertó ni «gana el equipo X» ni «2-0 / 2-1» → se devuelve
      // todo, igual que en una lesión o un cambio de cartel.
      await processDrawMatch(updated);
      await notifyMatchDraw(updated);
      betOutcomes = await refundOpenBets(id);
    } else {
      const winnerTeam = outcome.winnerTeam;
      const ratingResult = await processMatchRatings({ ...updated, winnerTeam, sets: resolvedSets });

      await notifyMatchResult({ ...updated, winnerTeam }, ratingResult);

      betOutcomes = pairingChanged
        ? await refundOpenBets(id)
        : await settleMatchBets(id, winnerTeam, resolvedSets);
    }
    await notifyBetSettlements(id, betOutcomes);

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar resultado' }, { status: 500 });
  }
}
