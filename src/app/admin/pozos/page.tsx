import Link from 'next/link';
import { db } from '@/lib/db';
import { listEvents } from '@/lib/tournament/event-store';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function PozosPage() {
  const pozos = await listEvents(db, 'pozo');
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
        <p className="text-sm text-ink-3">Aún no hay pozos.</p>
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
