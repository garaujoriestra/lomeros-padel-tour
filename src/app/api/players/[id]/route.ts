import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { upsertPlayerUser } from '@/lib/auth/users';
import { requireAdmin } from '@/lib/auth/guard';

// GET /api/players/[id]
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [player] = await db.select().from(players).where(eq(players.id, id));
    if (!player) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });
    return NextResponse.json(player);
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PUT /api/players/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, nickname, avatarUrl, isLeftHanded, email } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const [updated] = await db
      .update(players)
      .set({
        name: name.trim(),
        nickname: nickname?.trim() || null,
        avatarUrl: avatarUrl?.trim() || null,
        isLeftHanded: !!isLeftHanded,
      })
      .where(eq(players.id, id))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });

    const result = await upsertPlayerUser(id, email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// DELETE /api/players/[id]
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    await db.delete(players).where(eq(players.id, id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
