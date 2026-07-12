import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups, memberships } from '@/lib/db/schema';

export interface GroupRow {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
  paidUntil: string | null;
}

const groupColumns = {
  id: groups.id,
  slug: groups.slug,
  name: groups.name,
  logoUrl: groups.logoUrl,
  accentColor: groups.accentColor,
  paidUntil: groups.paidUntil,
};

// Todos los grupos. Lo usa el cron (itera por grupo), el conmutador del súper-admin
// y la futura vista cross-grupo.
export async function listGroups(): Promise<GroupRow[]> {
  return db.select(groupColumns).from(groups);
}

// Un grupo por id (o null). Fuente del nombre de marca (OG y branding Fase 3).
export async function getGroupById(id: string): Promise<GroupRow | null> {
  const [g] = await db.select(groupColumns).from(groups).where(eq(groups.id, id));
  return g ?? null;
}

// Branding editable por el admin del grupo (Fase 3). null = volver al valor por defecto.
export async function updateGroupBranding(
  id: string,
  branding: { logoUrl: string | null; accentColor: string | null },
): Promise<void> {
  await db.update(groups).set(branding).where(eq(groups.id, id));
}

// Vigencia del Pase de Temporada (la escribe SOLO el webhook de Stripe).
export async function setGroupPaidUntil(id: string, paidUntil: string): Promise<void> {
  await db.update(groups).set({ paidUntil }).where(eq(groups.id, id));
}

// ¿Es una violación de UNIQUE de SQLite/libsql? El error puede venir envuelto
// (drizzle re-lanza con `cause`), así que se recorre la cadena.
function isUniqueViolation(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause instanceof Error ? e.cause : undefined) {
    if (e.message.includes('UNIQUE constraint failed')) return true;
  }
  return false;
}

// Crea un grupo con su primera membership de admin (onboarding). El id = slug,
// como los grupos existentes ('lomeros', 'grupo-test'). Devuelve error legible si
// el slug ya existe. Los dos INSERT van en una transacción para que nunca quede un
// grupo huérfano sin admin, y la violación de UNIQUE se captura para cubrir la
// carrera entre el check del form y el INSERT (dos requests con el mismo slug).
export async function createGroupWithAdmin(input: {
  slug: string;
  name: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [existing] = await db.select({ id: groups.id }).from(groups).where(eq(groups.slug, input.slug));
  if (existing) return { ok: false, error: 'Ese nombre corto ya está cogido' };
  try {
    await db.transaction(async (tx) => {
      await tx.insert(groups).values({ id: input.slug, slug: input.slug, name: input.name });
      await tx.insert(memberships).values({
        userId: input.userId,
        groupId: input.slug,
        role: 'admin',
        playerId: null,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: 'Ese nombre corto ya está cogido' };
    throw err;
  }
  return { ok: true };
}
