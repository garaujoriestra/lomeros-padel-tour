import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { matches, matchSets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { processMatchRatings } from '@/lib/rating/process-match';
import { coerceSide } from '@/lib/rating/side-stats';
import { requireAdmin } from '@/lib/auth/guard';

// GET /api/matches/[id]
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });

    const sets = await db
      .select()
      .from(matchSets)
      .where(eq(matchSets.matchId, id))
      .orderBy(matchSets.setNumber);

    return NextResponse.json({ ...match, sets });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// DELETE /api/matches/[id]
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    // Los sets se borran en cascada (ON DELETE CASCADE)
    await db.delete(matches).where(eq(matches.id, id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PUT /api/matches/[id] — add result to a scheduled match
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json();
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

    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (match.status === 'completed') {
      return NextResponse.json({ error: 'Este partido ya tiene resultado' }, { status: 400 });
    }

    // Optional pairing reassignment: the 4 IDs must match the originally scheduled players.
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
      if (!newPairingIds.every((id) => originalIds.has(id as string))) {
        return NextResponse.json(
          { error: 'Los jugadores deben coincidir con los del partido programado' },
          { status: 400 },
        );
      }
    }

    // Calculate winner
    let team1SetsWon = 0;
    let team2SetsWon = 0;
    for (const set of sets) {
      if (set.team1Games > set.team2Games) team1SetsWon++;
      else team2SetsWon++;
    }
    const winnerTeam: 1 | 2 = team1SetsWon > team2SetsWon ? 1 : 2;

    // Save sets
    for (const set of sets) {
      await db.insert(matchSets).values({
        matchId: id,
        setNumber: set.setNumber,
        team1Games: set.team1Games,
        team2Games: set.team2Games,
      });
    }

    // Update match status + winner
    const updateFields: Record<string, unknown> = { winnerTeam, status: 'completed' };
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

    const [updated] = await db
      .update(matches)
      .set(updateFields)
      .where(eq(matches.id, id))
      .returning();

    // Trigger Elo calculation
    await processMatchRatings({ ...updated, winnerTeam, sets });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar resultado' }, { status: 500 });
  }
}
