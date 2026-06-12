import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rewards } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';

// PUT /api/rewards/[id] — editar premio (admin). Body: { title?, description?, cost?, active? }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const fields: Record<string, unknown> = {};
    if (typeof body.title === 'string' && body.title.trim()) fields.title = body.title.trim();
    if (body.description !== undefined) fields.description = body.description?.trim() || null;
    if (Number.isInteger(body.cost) && body.cost > 0) fields.cost = body.cost;
    if (typeof body.active === 'boolean') fields.active = body.active;
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }
    const [updated] = await db.update(rewards).set(fields).where(eq(rewards.id, id)).returning();
    if (!updated) return NextResponse.json({ error: 'Premio no encontrado' }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error al actualizar premio' }, { status: 500 });
  }
}

// DELETE /api/rewards/[id] — desactivar (soft delete; los canjes lo referencian)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const [updated] = await db.update(rewards).set({ active: false }).where(eq(rewards.id, id)).returning();
    if (!updated) return NextResponse.json({ error: 'Premio no encontrado' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error al desactivar premio' }, { status: 500 });
  }
}
