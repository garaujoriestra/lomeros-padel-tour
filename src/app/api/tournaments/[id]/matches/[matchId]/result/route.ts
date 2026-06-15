import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { recordResult } from '@/lib/tournament/results';
import { validateResultInput } from '@/lib/tournament/validation';

// POST /api/tournaments/[id]/matches/[matchId]/result — registra resultado + progresión.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; matchId: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { matchId } = await params;
    const body = await request.json();
    const v = validateResultInput(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    await recordResult(db, matchId, v.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error al registrar el resultado';
    const status = msg.includes('no encontrado') ? 404 : msg.includes('sin resolver') ? 409 : 500;
    if (status === 500) console.error(error);
    return NextResponse.json({ error: msg }, { status });
  }
}
