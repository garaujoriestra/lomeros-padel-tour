import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
import { updateRewardInGroup, deactivateRewardInGroup } from '@/lib/rewards/queries';

// PUT /api/rewards/[id] — editar premio (admin DEL GRUPO objetivo; grupo en body.g)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    const { id } = await params;
    const fields: { title?: string; description?: string | null; cost?: number; active?: boolean } = {};
    if (typeof body.title === 'string' && body.title.trim()) fields.title = body.title.trim();
    if (body.description !== undefined) fields.description = body.description?.trim() || null;
    if (Number.isInteger(body.cost) && body.cost > 0) fields.cost = body.cost;
    if (typeof body.active === 'boolean') fields.active = body.active;
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }
    const updated = await updateRewardInGroup(groupId, id, fields);
    if (!updated) return NextResponse.json({ error: 'Premio no encontrado' }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error al actualizar premio' }, { status: 500 });
  }
}

// DELETE /api/rewards/[id]?g=<slug> — desactivar (soft delete; los canjes lo referencian)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGroupAdmin(await groupIdFromQuery(request));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    const { id } = await params;
    const updated = await deactivateRewardInGroup(groupId, id);
    if (!updated) return NextResponse.json({ error: 'Premio no encontrado' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error al desactivar premio' }, { status: 500 });
  }
}
