import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listRewardsInGroup } from '@/lib/rewards/queries';
import { RewardsManager } from '@/components/admin/rewards-manager';

export const dynamic = 'force-dynamic';

export default async function AdminRewardsPage() {
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const all = await listRewardsInGroup(groupId);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">🎁 Premios de La Timba</h1>
        <p className="muted text-sm mt-1.5">Catálogo de premios canjeables por fichas</p>
      </div>
      <RewardsManager rewards={all} />
    </div>
  );
}
