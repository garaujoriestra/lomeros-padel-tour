import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/guard';
import { loadEvent, updateEvent, deleteEvent } from '@/lib/tournament/event-store';
import { validateEventInput } from '@/lib/tournament/validation';

// GET /api/tournaments/[id] — carga un evento por id (admin).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const event = await loadEvent(db, id);
    return NextResponse.json({ event });
  } catch (error) {
    if (error === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al cargar el evento' }, { status: 500 });
  }
}

// PATCH /api/tournaments/[id] — edita meta + pistas + participantes de un evento.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const body = await request.json();
    const roster = await db.select({ id: players.id }).from(players);
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

// DELETE /api/tournaments/[id] — borra un evento (pozo o torneo) y todos sus hijos (admin).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    await deleteEvent(db, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
  }
}
