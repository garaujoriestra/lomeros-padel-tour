import Link from 'next/link';
import { db } from '@/lib/db';
import { resolvePageContext } from '@/lib/auth/page-context';
import { listEvents } from '@/lib/tournament/event-store';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

// Réplica de admin/pozos/page.tsx (Task 7, paridad 2b): por debajo del umbral de
// extracción de body compartido, se copia con sustituciones (getGroupContext →
// resolvePageContext(slug), hrefs con basePath). Hereda el gate admin-del-grupo
// del layout de /g/[slug]/admin.
export default async function GroupAdminPozosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { groupId, basePath } = await resolvePageContext(slug);
  const pozos = await listEvents(db, groupId, 'pozo');
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="sec-title">Pozos</h1>
          <p className="muted text-sm mt-1.5">Rey de la pista: parejas fijas o americano.</p>
        </div>
        <Link href={`${basePath}/admin/pozos/new`}><Button>Nuevo pozo</Button></Link>
      </div>
      {pozos.length === 0 ? (
        <p className="text-sm text-ink-3">Aún no hay pozos. Crea el primero con «Nuevo pozo».</p>
      ) : (
        <ul className="space-y-2">
          {pozos.map((p) => (
            <li key={p.id}>
              <Link href={`${basePath}/admin/pozos/${p.id}`} className="block border border-line rounded-md px-3 py-2 hover:bg-surface">
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
