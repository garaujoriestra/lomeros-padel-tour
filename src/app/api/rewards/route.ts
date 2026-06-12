import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { rewards } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';

// GET /api/rewards — catálogo completo (la UI pública filtra por active)
export async function GET() {
  try {
    const all = await db.select().from(rewards).orderBy(rewards.cost, desc(rewards.createdAt));
    return NextResponse.json(all);
  } catch {
    return NextResponse.json({ error: 'Error al obtener premios' }, { status: 500 });
  }
}

// POST /api/rewards — crear premio (admin)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { title, description, cost } = await request.json();
    if (!title?.trim()) return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 });
    if (!Number.isInteger(cost) || cost <= 0) {
      return NextResponse.json({ error: 'El coste debe ser un entero positivo' }, { status: 400 });
    }
    const [reward] = await db.insert(rewards).values({
      title: title.trim(),
      description: description?.trim() || null,
      cost,
    }).returning();
    return NextResponse.json(reward, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error al crear premio' }, { status: 500 });
  }
}
