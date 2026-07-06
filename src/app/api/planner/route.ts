import { NextRequest, NextResponse } from 'next/server';
import { requireGroupSession } from '@/lib/auth/guard';
import { groupIdFromQuery } from '@/lib/groups/request-group';
import { loadWeekView } from '@/lib/planner/week-data';
import { isEditableWeek, madridTodayIso, mondayOf } from '@/lib/planner/weeks';

// GET /api/planner?week=YYYY-MM-DD&g=slug → vista completa de la semana del grupo:
// disponibilidades de todos, pistas y coincidencias calculadas en servidor.
// Sin ?week → semana actual.
export async function GET(request: NextRequest) {
  const auth = await requireGroupSession(await groupIdFromQuery(request));
  if ('response' in auth) return auth.response;
  try {
    const today = madridTodayIso();
    const week = request.nextUrl.searchParams.get('week') ?? mondayOf(today);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || mondayOf(week) !== week) {
      return NextResponse.json({ error: 'Semana inválida (usa el lunes, YYYY-MM-DD)' }, { status: 400 });
    }
    const view = await loadWeekView(auth.ctx.groupId, week);
    return NextResponse.json({ ...view, editable: isEditableWeek(week, today) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al cargar el planificador' }, { status: 500 });
  }
}
