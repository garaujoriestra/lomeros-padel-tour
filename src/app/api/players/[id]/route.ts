import { NextRequest, NextResponse } from 'next/server';
import { upsertPlayerUser } from '@/lib/auth/users';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
import { getPlayerInGroup, updatePlayerInGroup, deletePlayerInGroup } from '@/lib/players/queries';

// GET /api/players/[id]?g=<slug> (público; grupo por defecto = Lomeros)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const groupId = (await groupIdFromQuery(request)) ?? (await getDefaultGroupId());
    const player = await getPlayerInGroup(groupId, id);
    if (!player) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });
    return NextResponse.json(player);
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PUT /api/players/[id] (admin del grupo objetivo; grupo en body.g)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    const { id } = await params;
    const { name, nickname, avatarUrl, isLeftHanded, juegaPadel, email } = body;
    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const updated = await updatePlayerInGroup(groupId, id, {
      name: name.trim(),
      nickname: nickname?.trim() || null,
      avatarUrl: avatarUrl?.trim() || null,
      isLeftHanded: !!isLeftHanded,
      // Solo se toca si viene en el body; una edición parcial no debe
      // resetear a un apostante (juegaPadel=false) de vuelta a jugador.
      ...(typeof juegaPadel === 'boolean' ? { juegaPadel } : {}),
    });

    if (!updated) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });

    const result = await upsertPlayerUser(groupId, id, email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// DELETE /api/players/[id]?g=<slug> (admin del grupo objetivo)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGroupAdmin(await groupIdFromQuery(request));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;
  try {
    const { id } = await params;
    await deletePlayerInGroup(groupId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
