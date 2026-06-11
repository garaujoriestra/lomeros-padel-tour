import { NextResponse } from 'next/server';
import { getSession, type Session } from '@/lib/auth/session';

// Devuelve { session } si el usuario es admin, o { response } con el error a devolver.
export async function requireAdmin(): Promise<{ session: Session } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }
  if (session.role !== 'admin') {
    return { response: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }
  return { session };
}
