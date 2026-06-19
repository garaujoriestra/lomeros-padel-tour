import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { loadEvent } from '@/lib/tournament/event-store';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { replacePairs } from '@/lib/tournament/pair-store';
import { validatePairsInput } from '@/lib/tournament/validation';

// PUT /api/tournaments/[id]/pairs — reemplaza el set de parejas del evento (admin).
// Solo en borrador; valida contra el roster del evento.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    if (!(await getTournamentInGroup(groupId, id))) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const ev = await loadEvent(db, id);
    if (ev.status !== 'draft') {
      return NextResponse.json({ error: 'El evento ya está generado' }, { status: 409 });
    }
    const body = await request.json();
    const v = validatePairsInput(body, new Set(ev.participantPlayerIds));
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    await replacePairs(db, id, v.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar las parejas' }, { status: 500 });
  }
}
