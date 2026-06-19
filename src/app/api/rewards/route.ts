import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listRewardsInGroup, createRewardInGroup } from '@/lib/rewards/queries';

// GET /api/rewards — catálogo del grupo por defecto (la UI pública filtra por active)
export async function GET() {
  try {
    const groupId = await getDefaultGroupId();
    const all = await listRewardsInGroup(groupId);
    return NextResponse.json(all);
  } catch {
    return NextResponse.json({ error: 'Error al obtener premios' }, { status: 500 });
  }
}

// POST /api/rewards — crear premio (admin)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const { title, description, cost } = await request.json();
    if (!title?.trim()) return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 });
    if (!Number.isInteger(cost) || cost <= 0) {
      return NextResponse.json({ error: 'El coste debe ser un entero positivo' }, { status: 400 });
    }
    const reward = await createRewardInGroup(groupId, {
      title: title.trim(),
      description: description?.trim() || null,
      cost,
    });
    return NextResponse.json(reward, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error al crear premio' }, { status: 500 });
  }
}
