import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { getSession } from '@/lib/auth/session';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
import { listPlayersByElo } from '@/lib/players/queries';
import { createEvent, listEvents } from '@/lib/tournament/event-store';
import { validateEventInput } from '@/lib/tournament/validation';
import type { EventKind } from '@/lib/tournament/types';

// GET /api/tournaments?kind=pozo|torneo&g=<slug> — listado por tipo (admin DEL grupo objetivo).
export async function GET(request: NextRequest) {
  const auth = await requireGroupAdmin(await groupIdFromQuery(request));
  if ('response' in auth) return auth.response;
  const kind = request.nextUrl.searchParams.get('kind');
  if (kind !== 'pozo' && kind !== 'torneo') {
    return NextResponse.json({ error: 'kind requerido (pozo|torneo)' }, { status: 400 });
  }
  const events = await listEvents(db, auth.ctx.groupId, kind as EventKind);
  return NextResponse.json({ events });
}

// POST /api/tournaments — crea un evento (pozo o torneo) (admin DEL grupo objetivo; grupo en body.g).
// Devuelve { id }.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;

  try {
    // createdBy es el usuario, no la membership: GroupContext no lo lleva → getSession
    // extra (cookie ya verificada por el guard, no puede ser null).
    const session = await getSession();
    // Roster del GRUPO: un torneo no puede incluir jugadores de otro grupo.
    const roster = await listPlayersByElo(groupId);
    const rosterIds = new Set(roster.map((p) => p.id));
    const v = validateEventInput(body, rosterIds);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const id = await createEvent(db, groupId, {
      name: v.value.name, date: v.value.date, location: v.value.location,
      kind: v.value.kind, format: v.value.format, config: v.value.config,
      createdBy: session!.userId,
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
