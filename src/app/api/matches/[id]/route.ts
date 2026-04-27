import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { matches, matchSets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { processMatchRatings } from '@/lib/rating/process-match';

function coerceSide(value: unknown): string | null {
  return value === 'drive' || value === 'reves' ? value : null;
}

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
  try {
    const { id } = await params;
    const body = await request.json();
    const { sets, team1Player1Side, team1Player2Side, team2Player1Side, team2Player2Side } = body;

    if (!sets || sets.length < 2 || sets.length > 3) {
      return NextResponse.json({ error: 'El partido necesita 2 o 3 sets' }, { status: 400 });
    }

    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (match.status === 'completed') {
      return NextResponse.json({ error: 'Este partido ya tiene resultado' }, { status: 400 });
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
    if (team1Player1Side !== undefined) updateFields.team1Player1Side = coerceSide(team1Player1Side);
    if (team1Player2Side !== undefined) updateFields.team1Player2Side = coerceSide(team1Player2Side);
    if (team2Player1Side !== undefined) updateFields.team2Player1Side = coerceSide(team2Player1Side);
    if (team2Player2Side !== undefined) updateFields.team2Player2Side = coerceSide(team2Player2Side);

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
