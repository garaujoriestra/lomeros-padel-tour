import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, type User } from '@/lib/db/schema';

export async function getUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, normalized));
  return user ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

/**
 * Sincroniza la autorización de un jugador desde el formulario de admin.
 * - email vacío  → desvincula/elimina la fila `users` de rol 'player' de ese jugador.
 * - email puesto → garantiza una fila `users` con ese email vinculada al jugador.
 *
 * Devuelve { ok:false, error } si el email ya pertenece a OTRO jugador.
 */
export async function upsertPlayerUser(
  playerId: string,
  rawEmail: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = (rawEmail ?? '').trim().toLowerCase();

  // Fila actual vinculada a este jugador (si existe)
  const [byPlayer] = await db.select().from(users).where(eq(users.playerId, playerId));

  // Sin email → desautorizar: solo borramos si es una cuenta de jugador.
  if (!email) {
    if (byPlayer && byPlayer.role === 'player') {
      await db.delete(users).where(eq(users.id, byPlayer.id));
    } else if (byPlayer) {
      // admin u otro rol: solo desvinculamos el playerId, no borramos la cuenta.
      await db.update(users).set({ playerId: null }).where(eq(users.id, byPlayer.id));
    }
    return { ok: true };
  }

  // Con email → ¿ese email ya existe en otra fila?
  const [byEmail] = await db.select().from(users).where(eq(users.email, email));

  if (byEmail) {
    if (byEmail.playerId && byEmail.playerId !== playerId) {
      return { ok: false, error: 'Ese email ya está asignado a otro jugador' };
    }
    // Vincular esa cuenta a este jugador (conserva su rol; útil si es la del admin).
    if (byPlayer && byPlayer.id !== byEmail.id) {
      // El jugador tenía otra cuenta 'player' con email distinto: la quitamos.
      await db.delete(users).where(eq(users.id, byPlayer.id));
    }
    await db.update(users).set({ playerId }).where(eq(users.id, byEmail.id));
    return { ok: true };
  }

  // El email es nuevo.
  if (byPlayer) {
    await db.update(users).set({ email }).where(eq(users.id, byPlayer.id));
  } else {
    await db.insert(users).values({ email, role: 'player', playerId });
  }
  return { ok: true };
}
