import { NextResponse } from 'next/server';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { listRankedPlayers } from '@/lib/players/queries';
import { listPairStatsInGroup } from '@/lib/rating/queries';

// GET /api/rankings - ranking individual + parejas (grupo por defecto)
export async function GET() {
  try {
    const groupId = await getDefaultGroupId();
    const [individual, pairs] = await Promise.all([
      listRankedPlayers(groupId),
      listPairStatsInGroup(groupId, 3),
    ]);
    return NextResponse.json({ individual, pairs });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
