import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
import { listRewardsInGroup, createRewardInGroup } from '@/lib/rewards/queries';

// GET /api/rewards?g=<slug> — catálogo del grupo indicado (público; por defecto = Lomeros)
export async function GET(request: NextRequest) {
  try {
    const groupId = (await groupIdFromQuery(request)) ?? (await getDefaultGroupId());
    const all = await listRewardsInGroup(groupId);
    return NextResponse.json(all);
  } catch {
    return NextResponse.json({ error: 'Error al obtener premios' }, { status: 500 });
  }
}

// POST /api/rewards — crear premio (admin DEL GRUPO objetivo; grupo en body.g)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    const { title, description, cost } = body;
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
