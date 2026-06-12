import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { penalties } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { applyTokenMovement } from '@/lib/betting/bank';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// PUT /api/penalties/[id] — admin.
// Body: { description } para asignar la penalización, o { status: 'fulfilled' }
// para marcarla cumplida (dispara la recarga).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json();

    const [penalty] = await db.select().from(penalties).where(eq(penalties.id, id));
    if (!penalty) return NextResponse.json({ error: 'Penalización no encontrada' }, { status: 404 });
    if (penalty.status === 'fulfilled') {
      return NextResponse.json({ error: 'Ya está cumplida' }, { status: 400 });
    }

    if (typeof body.description === 'string') {
      const [updated] = await db.update(penalties)
        .set({ description: body.description.trim() || null })
        .where(eq(penalties.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    if (body.status === 'fulfilled') {
      await applyTokenMovement(penalty.playerId, penalty.rechargeAmount, 'recharge', penalty.id);
      const [updated] = await db.update(penalties)
        .set({ status: 'fulfilled', fulfilledAt: now() })
        .where(eq(penalties.id, id))
        .returning();
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Error al actualizar penalización' }, { status: 500 });
  }
}
