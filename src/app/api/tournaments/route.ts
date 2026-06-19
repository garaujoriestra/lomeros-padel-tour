import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listPlayersByElo } from '@/lib/players/queries';
import { createEvent, listEvents } from '@/lib/tournament/event-store';
import { validateEventInput } from '@/lib/tournament/validation';
import type { EventKind } from '@/lib/tournament/types';

// GET /api/tournaments?kind=pozo|torneo — listado por tipo (admin), scopeado al grupo.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const kind = request.nextUrl.searchParams.get('kind');
  if (kind !== 'pozo' && kind !== 'torneo') {
    return NextResponse.json({ error: 'kind requerido (pozo|torneo)' }, { status: 400 });
  }
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const events = await listEvents(db, groupId, kind as EventKind);
  return NextResponse.json({ events });
}

// POST /api/tournaments — crea un evento (pozo o torneo) en el grupo. Devuelve { id }.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await request.json();
    // Roster del GRUPO: un torneo no puede incluir jugadores de otro grupo.
    const roster = await listPlayersByElo(groupId);
    const rosterIds = new Set(roster.map((p) => p.id));
    const v = validateEventInput(body, rosterIds);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const id = await createEvent(db, groupId, {
      name: v.value.name, date: v.value.date, location: v.value.location,
      kind: v.value.kind, format: v.value.format, config: v.value.config,
      createdBy: auth.session.userId,
      courts: v.value.courts.map((c) => ({
        label: c.label, sortOrder: c.order, availableFrom: c.availableFrom, availableTo: c.availableTo,
      })),
      participantPlayerIds: v.value.participantPlayerIds,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear el evento' }, { status: 500 });
  }
}
