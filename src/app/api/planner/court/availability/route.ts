import { NextRequest, NextResponse } from 'next/server';
import { requireGroupSession } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { getCourtByOwner, upsertDaySlots } from '@/lib/planner/queries';
import { writePayloadError } from '@/lib/planner/validate';
import { madridTodayIso } from '@/lib/planner/weeks';

// PUT /api/planner/court/availability — disponibilidad de MI pista para un día.
// Body: { g?, week, day, slots }. Solo el dueño de la pista puede escribirla.
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  const auth = await requireGroupSession(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const playerId = auth.ctx.playerId;
  if (!playerId) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
  try {
    const { week, day, slots } = body;
    const err = writePayloadError(week, day, slots, madridTodayIso());
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const court = await getCourtByOwner(auth.ctx.groupId, playerId);
    if (!court) return NextResponse.json({ error: 'No tienes pista declarada' }, { status: 404 });
    await upsertDaySlots(auth.ctx.groupId, week, day, 'court', court.id, slots);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar la disponibilidad de la pista' }, { status: 500 });
  }
}
