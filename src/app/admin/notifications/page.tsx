import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users, memberships, pushSubscriptions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolvePageContext } from '@/lib/auth/page-context';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { Bell, BellOff } from 'lucide-react';
import { BroadcastForm } from '@/components/admin/broadcast-form';

export const dynamic = 'force-dynamic';

export default async function AdminNotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/admin/notifications');
  const ctx = await resolvePageContext();
  if (ctx.role !== 'admin') redirect('/me');

  const groupId = ctx.groupId;
  const allUsers = await db.select().from(users);
  const allPlayers = await listAllPlayersInGroup(groupId);
  const subs = await db.select().from(pushSubscriptions);

  // Enlace user↔ficha para este grupo viene de memberships (1C).
  const groupMemberships = await db
    .select({ userId: memberships.userId, playerId: memberships.playerId })
    .from(memberships)
    .where(eq(memberships.groupId, groupId));
  const playerIdByUser = new Map(
    groupMemberships.filter((m) => m.playerId).map((m) => [m.userId, m.playerId!]),
  );

  const playerName = new Map(allPlayers.map((p) => [p.id, p.name]));
  const subCount = new Map<string, number>();
  for (const s of subs) {
    subCount.set(s.userId, (subCount.get(s.userId) ?? 0) + 1);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="sec-title">Notificaciones</h1>

      <BroadcastForm />

      <div className="lpt-card card-pad">
        <h2 className="kicker mb-3">Estado por usuario</h2>
        <ul className="divide-y divide-line">
          {allUsers.map((u) => {
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
