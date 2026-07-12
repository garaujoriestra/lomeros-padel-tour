import Link from 'next/link';
import { db } from '@/lib/db';
import { resolvePageContext } from '@/lib/auth/page-context';
import { listEvents } from '@/lib/tournament/event-store';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

// Réplica de admin/torneos/page.tsx (Task 7, paridad 2b): por debajo del umbral de
// extracción de body compartido, se copia con sustituciones (getGroupContext →
// resolvePageContext(slug), hrefs con basePath). Hereda el gate admin-del-grupo
// del layout de /g/[slug]/admin.
export default async function GroupAdminTorneosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { groupId, basePath } = await resolvePageContext(slug);
  const torneos = await listEvents(db, groupId, 'torneo');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="sec-title">Torneos</h1>
          <p className="muted text-sm mt-1.5">Eliminación directa o grupos → eliminación.</p>
        </div>
        <Link href={`${basePath}/admin/torneos/new`}><Button>Nuevo torneo</Button></Link>
      </div>
      {torneos.length === 0 ? (
        <p className="text-sm text-ink-3">Aún no hay torneos. Crea el primero con «Nuevo torneo».</p>
      ) : (
        <ul className="space-y-2">
          {torneos.map((t) => (
            <li key={t.id}>
              <Link href={`${basePath}/admin/torneos/${t.id}`} className="block border border-line rounded-md px-3 py-2 hover:bg-surface">
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
