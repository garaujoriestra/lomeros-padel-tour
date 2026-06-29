import { NextRequest, NextResponse } from 'next/server';
import { upsertPlayerUser } from '@/lib/auth/users';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
import { listPlayersByElo, createPlayerInGroup } from '@/lib/players/queries';

// GET /api/players?g=<slug> - jugadores del grupo indicado (público; por defecto = Lomeros)
export async function GET(request: NextRequest) {
  try {
    const groupId = (await groupIdFromQuery(request)) ?? (await getDefaultGroupId());
    const all = await listPlayersByElo(groupId);
    return NextResponse.json(all);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al obtener jugadores' }, { status: 500 });
  }
}

// POST /api/players - crear jugador (admin DEL GRUPO objetivo; grupo en body.g)
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    const { name, nickname, avatarUrl, isLeftHanded, email, juegaPadel } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const player = await createPlayerInGroup(groupId, {
      name: name.trim(),
      nickname: nickname?.trim() || null,
      avatarUrl: avatarUrl?.trim() || null,
      isLeftHanded: !!isLeftHanded,
      juegaPadel: juegaPadel === false ? false : true,
      // La Timba v2: se arranca a 0; las fichas solo entran pagando el buy-in.
      tokenBalance: 0,
    });

    const result = await upsertPlayerUser(groupId, player.id, email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(player, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear jugador' }, { status: 500 });
  }
}
