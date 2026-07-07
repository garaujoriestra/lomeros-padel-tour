import { NextRequest, NextResponse } from 'next/server';
import { requireGroupSession } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { createCourt, getCourtByOwner, renameCourt } from '@/lib/planner/queries';

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

// POST /api/planner/court — declara MI pista. Body: { g?, name }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  const auth = await requireGroupSession(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const playerId = auth.ctx.playerId;
  if (!playerId) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
  try {
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: 'Nombre de pista inválido (1–60 caracteres)' }, { status: 400 });
    if (await getCourtByOwner(auth.ctx.groupId, playerId)) {
      return NextResponse.json({ error: 'Ya tienes una pista declarada' }, { status: 409 });
    }
    const court = await createCourt(auth.ctx.groupId, playerId, name);
    return NextResponse.json({ court }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Carrera de doble alta: el UNIQUE físico de owner_player_id la corta; se
    // mapea al mismo 409 que la comprobación previa.
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Ya tienes una pista declarada' }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al crear la pista' }, { status: 500 });
  }
}

// PATCH /api/planner/court — renombra MI pista. Body: { g?, name }
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  const auth = await requireGroupSession(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const playerId = auth.ctx.playerId;
  if (!playerId) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
  try {
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: 'Nombre de pista inválido (1–60 caracteres)' }, { status: 400 });
    const court = await renameCourt(auth.ctx.groupId, playerId, name);
    if (!court) return NextResponse.json({ error: 'No tienes pista declarada' }, { status: 404 });
    return NextResponse.json({ court });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al renombrar la pista' }, { status: 500 });
  }
}
