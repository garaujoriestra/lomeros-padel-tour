import { resolvePageContext } from '@/lib/auth/page-context';
import { listRedemptionsAllInGroup } from '@/lib/rewards/queries';
import { RedemptionsManager } from '@/components/admin/redemptions-manager';

export const dynamic = 'force-dynamic';

// Réplica de admin/redemptions/page.tsx (Task 8, paridad 2b): por debajo del umbral
// de extracción de body compartido, se copia con sustituciones (getGroupContext →
// resolvePageContext(slug), groupSlug threaded a RedemptionsManager para el PUT con
// body.g). Hereda el gate admin-del-grupo del layout de /g/[slug]/admin.
export default async function GroupAdminRedemptionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  const rows = await listRedemptionsAllInGroup(ctx.groupId);
  const groupSlug = ctx.basePath ? ctx.group.slug : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">🎟️ Canjes</h1>
        <p className="muted text-sm mt-1.5">Valida o cancela los canjes de premios</p>
      </div>
      <RedemptionsManager redemptions={rows} groupSlug={groupSlug} />
    </div>
  );
}
