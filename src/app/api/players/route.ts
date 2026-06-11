import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { upsertPlayerUser } from '@/lib/auth/users';
import { requireAdmin } from '@/lib/auth/guard';

// GET /api/players - listar todos los jugadores
export async function GET() {
  try {
    const all = await db
      .select()
      .from(players)
      .orderBy(players.eloRating);
    return NextResponse.json(all.reverse());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al obtener jugadores' }, { status: 500 });
  }
}

// POST /api/players - crear jugador
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const body = await request.json();
    const { name, nickname, avatarUrl, isLeftHanded, email } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const [player] = await db.insert(players).values({
      name: name.trim(),
      nickname: nickname?.trim() || null,
      avatarUrl: avatarUrl?.trim() || null,
      isLeftHanded: !!isLeftHanded,
    }).returning();

    const result = await upsertPlayerUser(player.id, email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(player, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear jugador' }, { status: 500 });
  }
}
