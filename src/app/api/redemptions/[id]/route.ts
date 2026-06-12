import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redemptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { applyTokenMovement } from '@/lib/betting/bank';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// PUT /api/redemptions/[id] — admin. Body: { status: 'fulfilled' | 'cancelled' }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const { status } = await request.json();
    if (status !== 'fulfilled' && status !== 'cancelled') {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }
    const [redemption] = await db.select().from(redemptions).where(eq(redemptions.id, id));
    if (!redemption) return NextResponse.json({ error: 'Canje no encontrado' }, { status: 404 });
    if (redemption.status !== 'pending') {
      return NextResponse.json({ error: 'Este canje ya está resuelto' }, { status: 400 });
    }

    if (status === 'cancelled') {
      await applyTokenMovement(redemption.playerId, redemption.cost, 'redemption_refunded', redemption.id);
    }
    const [updated] = await db.update(redemptions)
      .set({ status, resolvedAt: now() })
      .where(eq(redemptions.id, id))
      .returning();
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error al resolver canje' }, { status: 500 });
  }
}
