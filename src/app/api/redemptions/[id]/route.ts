import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { getRedemptionInGroup, updateRedemptionStatus } from '@/lib/rewards/queries';
import { applyTokenMovement, hasLedgerEntry } from '@/lib/betting/bank';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// PUT /api/redemptions/[id] — admin. Body: { g?, status: 'fulfilled' | 'cancelled' }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;
  try {
    const { id } = await params;
    const { status } = body;
    if (status !== 'fulfilled' && status !== 'cancelled') {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }
    const redemption = await getRedemptionInGroup(groupId, id);
    if (!redemption) return NextResponse.json({ error: 'Canje no encontrado' }, { status: 404 });
    if (redemption.status !== 'pending') {
      return NextResponse.json({ error: 'Este canje ya está resuelto' }, { status: 400 });
    }
    if (status === 'cancelled' && !(await hasLedgerEntry('redemption_refunded', redemption.id))) {
      await applyTokenMovement(redemption.playerId, redemption.cost, 'redemption_refunded', redemption.id);
    }
    const updated = await updateRedemptionStatus(id, status, now());
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error al resolver canje' }, { status: 500 });
  }
}
