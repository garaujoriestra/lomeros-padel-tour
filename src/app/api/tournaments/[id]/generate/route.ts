import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { loadEvent } from '@/lib/tournament/event-store';
import { generatePozo } from '@/lib/tournament/pozo-engine';

// POST /api/tournaments/[id]/generate — genera la ronda 0 del pozo (admin). Body: { seed?: number }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const ev = await loadEvent(db, id);
    if (ev.kind !== 'pozo') return NextResponse.json({ error: 'Solo se puede generar un pozo aquí' }, { status: 400 });
    if (ev.status !== 'draft') return NextResponse.json({ error: 'El pozo ya está generado' }, { status: 409 });
    if (ev.format === 'americano' && ev.participantPlayerIds.length < 4) {
      return NextResponse.json({ error: 'Un pozo americano necesita al menos 4 jugadores' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const seed = typeof body.seed === 'number' ? body.seed : Math.floor(Math.random() * 0x7fffffff);
    await generatePozo(db, id, seed);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'NO_PAIRS') {
      return NextResponse.json({ error: 'Define las parejas antes de generar' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'UNBALANCED_PAIRS') {
      return NextResponse.json({ error: 'Demasiadas parejas para las pistas: como mucho pueden descansar 2 (una pista). Añade pistas o quita parejas.' }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al generar' }, { status: 500 });
  }
}
