import { NextRequest, NextResponse, after } from 'next/server';
import { requireGroupSession } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { getPlayerDaySlots, upsertDaySlots } from '@/lib/planner/queries';
import { hasNewSlots } from '@/lib/planner/slots';
import { writePayloadError } from '@/lib/planner/validate';
import { madridTodayIso } from '@/lib/planner/weeks';
import { notifyPlannerAvailability } from '@/lib/push/planner-events';

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
    const previous = await getPlayerDaySlots(auth.ctx.groupId, week, day, playerId);
    await upsertDaySlots(auth.ctx.groupId, week, day, 'player', playerId, slots);
    // Marcar disponibilidad nueva es noticia para el grupo; recortarla no. El
    // aviso va en after() para que el autoguardado no espere a los envíos push
    // (su propio antispam decide si de verdad se manda algo).
    if (hasNewSlots(previous, slots)) {
      after(() => notifyPlannerAvailability({
        groupId: auth.ctx.groupId,
        actorPlayerId: playerId,
        weekStart: week,
      }));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar la disponibilidad' }, { status: 500 });
  }
}
