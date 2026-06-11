import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';

// POST /api/admin/flip-sides?confirm=YES
//
// One-shot data correction: every existing match was registered with drive and
// revés inverted. This endpoint flips drive↔reves on all four side columns of
// every match. Idempotent in the sense of "running twice returns to the
// original (wrong) state" — only call ONCE.
//
// Requires an admin session and an explicit ?confirm=YES
// to avoid accidental triggers.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const confirm = req.nextUrl.searchParams.get('confirm');
  if (confirm !== 'YES') {
    return NextResponse.json(
      { error: 'Missing ?confirm=YES — destructive one-shot operation' },
      { status: 400 },
    );
  }

  const result = await db.run(sql`
    UPDATE matches
    SET
      team1_player1_side = CASE team1_player1_side
        WHEN 'drive' THEN 'reves'
        WHEN 'reves' THEN 'drive'
        ELSE team1_player1_side
      END,
      team1_player2_side = CASE team1_player2_side
        WHEN 'drive' THEN 'reves'
        WHEN 'reves' THEN 'drive'
        ELSE team1_player2_side
      END,
      team2_player1_side = CASE team2_player1_side
        WHEN 'drive' THEN 'reves'
        WHEN 'reves' THEN 'drive'
        ELSE team2_player1_side
      END,
      team2_player2_side = CASE team2_player2_side
        WHEN 'drive' THEN 'reves'
        WHEN 'reves' THEN 'drive'
        ELSE team2_player2_side
      END
    WHERE
      team1_player1_side IN ('drive','reves')
      OR team1_player2_side IN ('drive','reves')
      OR team2_player1_side IN ('drive','reves')
      OR team2_player2_side IN ('drive','reves')
  `);

  return NextResponse.json({ success: true, rowsAffected: result.rowsAffected });
}
