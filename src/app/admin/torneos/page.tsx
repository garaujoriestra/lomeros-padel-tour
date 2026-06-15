import Link from 'next/link';
import { db } from '@/lib/db';
import { listEvents } from '@/lib/tournament/event-store';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function TorneosPage() {
  const torneos = await listEvents(db, 'torneo');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="sec-title">Torneos</h1>
          <p className="muted text-sm mt-1.5">Eliminación directa o grupos → eliminación.</p>
        </div>
        <Link href="/admin/torneos/new"><Button>Nuevo torneo</Button></Link>
      </div>
      {torneos.length === 0 ? (
        <p className="text-sm text-ink-3">Aún no hay torneos.</p>
      ) : (
        <ul className="space-y-2">
          {torneos.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/tournaments/${t.id}`} className="block border border-line rounded-md px-3 py-2 hover:bg-surface">
                <span className="font-medium">{t.name}</span>
                <span className="text-ink-3 text-sm ml-2">{t.date} · {t.format === 'groups_elim' ? 'Grupos → eliminación' : 'Eliminación directa'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
