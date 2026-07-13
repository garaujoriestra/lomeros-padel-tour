import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { loadPlayerProfile } from '@/lib/players/profile-data';
import { PlayerProfileView } from '@/components/players/player-profile-view';
import { DirectionalTransition } from '@/components/shared/view-transitions';
import { resolvePageContext } from '@/lib/auth/page-context';

export const dynamic = 'force-dynamic';

// Réplica de (public)/players/[id]/page.tsx resolviendo el grupo por slug (26 líneas
// en la raíz: por debajo del umbral de extracción de body compartido, se copia con
// sustituciones — mismo patrón que matches/[id]/page.tsx documenta para su caso).
export default async function GroupPlayerProfilePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await resolvePageContext(slug);
  const data = await loadPlayerProfile(ctx.groupId, id);
  if (!data) notFound();
  return (
    <DirectionalTransition>
      <div>
        <Link href={`${ctx.basePath}/rankings`} transitionTypes={['nav-back']} className="sec-link" style={{ marginBottom: 14, display: 'inline-flex' }}>
          <ArrowLeft size={14} /> Ranking
        </Link>
        <PlayerProfileView data={data} editable={false} basePath={ctx.basePath} />
      </div>
    </DirectionalTransition>
  );
}
