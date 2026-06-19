import { NextRequest, NextResponse } from 'next/server';
import { upsertPlayerUser } from '@/lib/auth/users';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getPlayerInGroup, updatePlayerInGroup, deletePlayerInGroup } from '@/lib/players/queries';

// GET /api/players/[id] (público; grupo por defecto)
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const groupId = await getDefaultGroupId();
    const player = await getPlayerInGroup(groupId, id);
    if (!player) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });
    return NextResponse.json(player);
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PUT /api/players/[id] (admin)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await request.json();
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

// DELETE /api/players/[id] (admin)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    await deletePlayerInGroup(groupId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
