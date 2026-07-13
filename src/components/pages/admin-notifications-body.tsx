import { db } from '@/lib/db';
import { memberships, pushSubscriptions, users } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { Bell, BellOff } from 'lucide-react';
import { BroadcastForm } from '@/components/admin/broadcast-form';
import type { PageContext } from '@/lib/auth/page-context';

// Cuerpo compartido de /admin/notifications (raíz) y /g/[slug]/admin/notifications
// (Task 8, paridad 2b): por encima del umbral de extracción (>80 líneas) y con
// lógica de datos no trivial (join memberships↔usuarios para el nombre de ficha),
// se extrae en vez de copiar (criterio del plan).
//
// ADAPTACIÓN group-aware: la lista "Estado por usuario" se restringe a los MIEMBROS
// del grupo (vía memberships), igual que ya scopea la entrega real del aviso
// sendToGroup (src/lib/push/send.ts). El original (`db.select().from(users)`) leía
// la tabla global sin filtrar: invisible mientras la página solo existía en la raíz
// de Lomeros (todo usuario registrado ya tiene membership ahí), pero activarla para
// otros grupos (el motivo de esta task) habría filtrado los emails de TODOS los
// usuarios de la app a cualquier admin de grupo. Se corrige aquí, en ambas rutas.
export async function AdminNotificationsBody({ ctx }: { ctx: PageContext }) {
  const { groupId } = ctx;
  const groupSlug = ctx.basePath ? ctx.group.slug : undefined;

  const [groupMemberships, allPlayers, allSubs] = await Promise.all([
    db
      .select({ userId: memberships.userId, playerId: memberships.playerId })
      .from(memberships)
      .where(eq(memberships.groupId, groupId)),
    listAllPlayersInGroup(groupId),
    db.select().from(pushSubscriptions),
  ]);

  const memberUserIds = groupMemberships.map((m) => m.userId);
  const groupUsers = memberUserIds.length
    ? await db.select().from(users).where(inArray(users.id, memberUserIds))
    : [];

  const playerIdByUser = new Map(
    groupMemberships.filter((m) => m.playerId).map((m) => [m.userId, m.playerId!]),
  );
  const playerName = new Map(allPlayers.map((p) => [p.id, p.name]));
  const subCount = new Map<string, number>();
  for (const s of allSubs) {
    subCount.set(s.userId, (subCount.get(s.userId) ?? 0) + 1);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="sec-title">Notificaciones</h1>

      <BroadcastForm groupSlug={groupSlug} />

      <div className="lpt-card card-pad">
        <h2 className="kicker mb-3">Estado por usuario</h2>
        <ul className="divide-y divide-line">
          {groupUsers.map((u) => {
            const count = subCount.get(u.id) ?? 0;
            const linkedPlayerId = playerIdByUser.get(u.id);
            const name = linkedPlayerId ? playerName.get(linkedPlayerId) : null;
            return (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-ink-2 truncate">{name ?? u.email}</span>
                  {name && <span className="block text-xs text-ink-3 truncate">{u.email}</span>}
                </span>
                {count > 0 ? (
                  <span className="lpt-badge win shrink-0">
                    <Bell size={11} /> Activadas{count > 1 ? ` · ${count}` : ''}
                  </span>
                ) : (
                  <span className="lpt-badge shrink-0"><BellOff size={11} /> No</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
