import { resolvePageContext } from '@/lib/auth/page-context';
import { listRewardsInGroup } from '@/lib/rewards/queries';
import { RewardsManager } from '@/components/admin/rewards-manager';

export const dynamic = 'force-dynamic';

// Réplica de admin/rewards/page.tsx (Task 8, paridad 2b): por debajo del umbral de
// extracción de body compartido, se copia con sustituciones (getGroupContext →
// resolvePageContext(slug), groupSlug threaded a RewardsManager para las mutaciones
// con body.g). Hereda el gate admin-del-grupo del layout de /g/[slug]/admin.
export default async function GroupAdminRewardsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  const all = await listRewardsInGroup(ctx.groupId);
  const groupSlug = ctx.basePath ? ctx.group.slug : undefined;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">🎁 Premios de La Timba</h1>
        <p className="muted text-sm mt-1.5">Catálogo de premios canjeables por fichas</p>
      </div>
      <RewardsManager rewards={all} groupSlug={groupSlug} />
    </div>
  );
}
