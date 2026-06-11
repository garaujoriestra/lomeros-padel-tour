import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users, players, pushSubscriptions } from '@/lib/db/schema';
import { BroadcastForm } from '@/components/admin/broadcast-form';

export const dynamic = 'force-dynamic';

export default async function AdminNotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/admin/notifications');
  if (session.role !== 'admin') redirect('/');

  const allUsers = await db.select().from(users);
  const allPlayers = await db.select().from(players);
  const subs = await db.select().from(pushSubscriptions);

  const playerName = new Map(allPlayers.map((p) => [p.id, p.name]));
  const subCount = new Map<string, number>();
  for (const s of subs) {
    subCount.set(s.userId, (subCount.get(s.userId) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-bold text-foreground">Notificaciones</h1>

      <BroadcastForm />

      <div className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-3 font-semibold text-foreground">Estado por usuario</h2>
        <ul className="divide-y divide-line">
          {allUsers.map((u) => {
            const count = subCount.get(u.id) ?? 0;
            const name = u.playerId ? playerName.get(u.playerId) : null;
            return (
              <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink-2">
                  {name ?? u.email}
                  {name && <span className="ml-2 text-ink-3">{u.email}</span>}
                </span>
                {count > 0 ? (
                  <span className="font-medium text-win">
                    🔔 Activadas{count > 1 ? ` · ${count} disp.` : ''}
                  </span>
                ) : (
                  <span className="text-ink-3">🔕 Desactivadas</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
