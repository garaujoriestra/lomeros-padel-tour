import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { players, pairStats } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';

// GET /api/rankings - ranking individual + parejas
export async function GET() {
  try {
    const individualRanking = await db
      .select()
      .from(players)
      .where(sql`${players.matchesPlayed} > 0`)
      .orderBy(desc(players.eloRating));

    const pairsRanking = await db
      .select()
      .from(pairStats)
      .where(sql`${pairStats.matchesPlayed} >= 3`)
      .orderBy(desc(pairStats.pairElo));

    return NextResponse.json({ individual: individualRanking, pairs: pairsRanking });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
