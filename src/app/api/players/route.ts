import { NextRequest, NextResponse } from 'next/server';
import { upsertPlayerUser } from '@/lib/auth/users';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listPlayersByElo, createPlayerInGroup } from '@/lib/players/queries';

// GET /api/players - listar los jugadores del grupo por defecto (público)
export async function GET() {
  try {
    const groupId = await getDefaultGroupId();
    const all = await listPlayersByElo(groupId);
    return NextResponse.json(all);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al obtener jugadores' }, { status: 500 });
  }
}

// POST /api/players - crear jugador (admin)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await request.json();
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

    const result = await upsertPlayerUser(player.id, email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(player, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear jugador' }, { status: 500 });
  }
}
