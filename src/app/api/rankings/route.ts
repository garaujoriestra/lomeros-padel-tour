import { NextRequest, NextResponse } from 'next/server';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { groupIdFromQuery } from '@/lib/groups/request-group';
import { listRankedPlayers } from '@/lib/players/queries';
import { listPairStatsInGroup } from '@/lib/rating/queries';

// GET /api/rankings?g=<slug> - ranking individual + parejas (público; por defecto = Lomeros)
export async function GET(request: NextRequest) {
  try {
    const groupId = (await groupIdFromQuery(request)) ?? (await getDefaultGroupId());
    const [individual, pairs] = await Promise.all([
      listRankedPlayers(groupId),
      listPairStatsInGroup(groupId, 3),
    ]);
    return NextResponse.json({ individual, pairs });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
