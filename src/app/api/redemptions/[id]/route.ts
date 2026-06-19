import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getRedemptionInGroup, updateRedemptionStatus } from '@/lib/rewards/queries';
import { applyTokenMovement, hasLedgerEntry } from '@/lib/betting/bank';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// PUT /api/redemptions/[id] — admin. Body: { status: 'fulfilled' | 'cancelled' }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const { status } = await request.json();
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
