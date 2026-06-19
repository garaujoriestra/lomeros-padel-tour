import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listRedemptionsAllInGroup } from '@/lib/rewards/queries';
import { RedemptionsManager } from '@/components/admin/redemptions-manager';

export const dynamic = 'force-dynamic';

export default async function AdminRedemptionsPage() {
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const rows = await listRedemptionsAllInGroup(groupId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">🎟️ Canjes</h1>
        <p className="muted text-sm mt-1.5">Valida o cancela los canjes de premios</p>
      </div>
      <RedemptionsManager redemptions={rows} />
    </div>
  );
}
