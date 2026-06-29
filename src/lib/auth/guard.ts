import { NextResponse } from 'next/server';
import { getSession, type Session } from '@/lib/auth/session';
import { getGroupContext, type GroupContext } from '@/lib/auth/group-context';

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

// Devuelve { session } si hay CUALQUIER usuario autenticado, o { response } 401.
export async function requireSession(): Promise<{ session: Session } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }
  return { session };
}

// Admin del GRUPO OBJETIVO (no del grupo por defecto). 401 sin sesión; 403 si el usuario
// no es admin de ese grupo (super_admin es solo-lectura → rechazado en escrituras admin).
// targetGroupId null/undefined → getGroupContext usa la única membership: comportamiento de
// Lomeros idéntico mientras los callers no envíen grupo. Reemplaza a requireAdmin en las
// rutas ya migradas al Paso B.
export async function requireGroupAdmin(
  targetGroupId?: string | null,
): Promise<{ ctx: GroupContext } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }
  const ctx = await getGroupContext(targetGroupId ? { targetGroupId } : {});
  if (!ctx || ctx.role !== 'admin') {
    return { response: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }
  return { ctx };
}

// Miembro (cualquier rol) o super_admin del GRUPO OBJETIVO. 401 sin sesión; 403 sin acceso
// a ese grupo. Devuelve el contexto (incl. ctx.playerId = ficha del usuario EN ESE grupo,
// null si super_admin o sin ficha). Las rutas de jugador usan ctx.playerId en vez de
// session.player (horneado al grupo por defecto).
export async function requireGroupSession(
  targetGroupId?: string | null,
): Promise<{ ctx: GroupContext } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }
  const ctx = await getGroupContext(targetGroupId ? { targetGroupId } : {});
  if (!ctx) {
    return { response: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }
  return { ctx };
}
