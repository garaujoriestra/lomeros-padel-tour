import Link from 'next/link';
import { db } from '@/lib/db';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listEvents } from '@/lib/tournament/event-store';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';

export const dynamic = 'force-dynamic';

export default async function PozosPage() {
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const pozos = await listEvents(db, groupId, 'pozo');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="sec-title">Pozos</h1>
          <p className="muted text-sm mt-1.5">Rey de la pista: parejas fijas o americano.</p>
        </div>
        <Link href="/admin/pozos/new"><Button>Nuevo pozo</Button></Link>
      </div>
      {pozos.length === 0 ? (
        <EmptyState
          emoji="🏟️"
          title="Aún no hay pozos"
          hint="Crea el primero con «Nuevo pozo»."
          action={<Link href="/admin/pozos/new"><Button>Nuevo pozo</Button></Link>}
        />
      ) : (
        <ul className="space-y-2">
          {pozos.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/pozos/${p.id}`} className="block border border-line rounded-md px-3 py-2 hover:bg-surface">
                <span className="font-medium">{p.name}</span>
                <span className="text-ink-3 text-sm ml-2">{p.date} · {p.format === 'americano' ? 'Americano' : 'Parejas fijas'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
