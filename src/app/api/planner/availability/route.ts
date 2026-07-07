import { NextRequest, NextResponse } from 'next/server';
import { requireGroupSession } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { upsertDaySlots } from '@/lib/planner/queries';
import { writePayloadError } from '@/lib/planner/validate';
import { madridTodayIso } from '@/lib/planner/weeks';

// PUT /api/planner/availability — MI disponibilidad de un día.
// Body: { g?, week: 'YYYY-MM-DD' (lunes), day: 0-6, slots: number[] }
// Solo escribe la ficha del propio usuario (ctx.playerId); nadie edita la de otros.
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
    await upsertDaySlots(auth.ctx.groupId, week, day, 'player', playerId, slots);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar la disponibilidad' }, { status: 500 });
  }
}
