import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { loadEvent } from '@/lib/tournament/event-store';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { generateEvent } from '@/lib/tournament/event-engine';

// POST /api/tournaments/[id]/generate — genera el evento (pozo o torneo) (admin del grupo).
// Body: { seed?: number, g?: string }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    if (!(await getTournamentInGroup(auth.ctx.groupId, id))) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const ev = await loadEvent(db, id);
    if (ev.status !== 'draft') return NextResponse.json({ error: 'El evento ya está generado' }, { status: 409 });
    if (ev.kind === 'pozo' && ev.format === 'americano' && ev.participantPlayerIds.length < 4) {
      return NextResponse.json({ error: 'Un pozo americano necesita al menos 4 jugadores' }, { status: 400 });
    }

    const seed = typeof body.seed === 'number' ? body.seed : Math.floor(Math.random() * 0x7fffffff);
    await generateEvent(db, id, seed);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    if (error instanceof Error && ['NO_PAIRS', 'UNBALANCED_PAIRS', 'TOO_FEW_PAIRS', 'GROUP_TOO_SMALL'].includes(error.message)) {
      const msg: Record<string, string> = {
        NO_PAIRS: 'Define las parejas antes de generar',
        UNBALANCED_PAIRS: 'Demasiadas parejas para las pistas: como mucho pueden descansar 2 (una pista). Añade pistas o quita parejas.',
        TOO_FEW_PAIRS: 'El torneo necesita al menos 2 parejas',
        GROUP_TOO_SMALL: 'Cada grupo necesita al menos 2 parejas: reduce el nº de grupos o añade parejas',
      };
      return NextResponse.json({ error: msg[error.message] }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al generar' }, { status: 500 });
  }
}
