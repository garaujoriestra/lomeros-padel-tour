import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { matches } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { coerceSide } from '@/lib/rating/side-stats';
import { requireAdmin } from '@/lib/auth/guard';

// PATCH /api/matches/[id]/sides — update only the side columns
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const { team1Player1Side, team1Player2Side, team2Player1Side, team2Player2Side } = body;

    const [updated] = await db
      .update(matches)
      .set({
        team1Player1Side: coerceSide(team1Player1Side),
        team1Player2Side: coerceSide(team1Player2Side),
        team2Player1Side: coerceSide(team2Player1Side),
        team2Player2Side: coerceSide(team2Player2Side),
      })
      .where(eq(matches.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar lados' }, { status: 500 });
  }
}
