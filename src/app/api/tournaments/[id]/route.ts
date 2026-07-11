import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromQuery, groupIdFromValue } from '@/lib/groups/request-group';
import { listPlayersByElo } from '@/lib/players/queries';
import { loadEvent, updateEvent, deleteEvent } from '@/lib/tournament/event-store';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { validateEventInput } from '@/lib/tournament/validation';

// GET /api/tournaments/[id]?g=<slug> — carga un evento del grupo por id (admin del grupo).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGroupAdmin(await groupIdFromQuery(request));
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    if (!(await getTournamentInGroup(auth.ctx.groupId, id))) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const event = await loadEvent(db, id);
    return NextResponse.json({ event });
  } catch (error) {
    if (error === 'NOT_FOUND' || (error instanceof Error && error.message === 'NOT_FOUND')) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al cargar el evento' }, { status: 500 });
  }
}

// PATCH /api/tournaments/[id] — edita meta + pistas + participantes (admin del grupo; grupo en body.g).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const groupId = auth.ctx.groupId;
  const { id } = await params;
  try {
    if (!(await getTournamentInGroup(groupId, id))) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const roster = await listPlayersByElo(groupId);
    const v = validateEventInput(body, new Set(roster.map((p) => p.id)));
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    await updateEvent(db, id, {
      name: v.value.name, date: v.value.date, location: v.value.location, config: v.value.config,
      courts: v.value.courts.map((c) => ({
        label: c.label, sortOrder: c.order, availableFrom: c.availableFrom, availableTo: c.availableTo,
      })),
      participantPlayerIds: v.value.participantPlayerIds,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }
}

// DELETE /api/tournaments/[id]?g=<slug> — borra un evento del grupo y todos sus hijos (admin del grupo).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireGroupAdmin(await groupIdFromQuery(request));
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    if (!(await getTournamentInGroup(auth.ctx.groupId, id))) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    await deleteEvent(db, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
  }
}
