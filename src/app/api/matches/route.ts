import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { matches, matchSets } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { processMatchRatings } from '@/lib/rating/process-match';

// GET /api/matches
export async function GET() {
  try {
    const all = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.date));
    return NextResponse.json(all);
  } catch {
    return NextResponse.json({ error: 'Error al obtener partidos' }, { status: 500 });
  }
}

// POST /api/matches
// Supports two modes:
//   - With sets  → status='completed', calculates winner, triggers Elo
//   - Without sets → status='scheduled', winnerTeam=null, no Elo yet
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      date,
      location,
      team1Player1Id,
      team1Player2Id,
      team2Player1Id,
      team2Player2Id,
      sets, // optional: [{setNumber, team1Games, team2Games}]
    } = body;

    // 4 distinct players always required
    const playerIds = [team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id];
    if (playerIds.some((id) => !id) || new Set(playerIds).size !== 4) {
      return NextResponse.json(
        { error: 'Se necesitan 4 jugadores distintos' },
        { status: 400 }
      );
    }

    const isScheduled = !sets || sets.length === 0;

    if (!isScheduled && (sets.length < 2 || sets.length > 3)) {
      return NextResponse.json(
        { error: 'El partido necesita 2 o 3 sets' },
        { status: 400 }
      );
    }

    let winnerTeam: 1 | 2 | null = null;
    if (!isScheduled) {
      let team1SetsWon = 0;
      let team2SetsWon = 0;
      for (const set of sets) {
        if (set.team1Games > set.team2Games) team1SetsWon++;
        else team2SetsWon++;
      }
      winnerTeam = team1SetsWon > team2SetsWon ? 1 : 2;
    }

    // Save match
    const [match] = await db
      .insert(matches)
      .values({
        date,
        location: location?.trim() || null,
        team1Player1Id,
        team1Player2Id,
        team2Player1Id,
        team2Player2Id,
        winnerTeam,
        status: isScheduled ? 'scheduled' : 'completed',
      })
      .returning();

    if (!isScheduled) {
      // Save sets
      for (const set of sets) {
        await db.insert(matchSets).values({
          matchId: match.id,
          setNumber: set.setNumber,
          team1Games: set.team1Games,
          team2Games: set.team2Games,
        });
      }

      // Update ratings
      await processMatchRatings({
        ...match,
        winnerTeam: winnerTeam as 1 | 2,
        sets,
      });
    }

    return NextResponse.json(match, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear partido' }, { status: 500 });
  }
}
