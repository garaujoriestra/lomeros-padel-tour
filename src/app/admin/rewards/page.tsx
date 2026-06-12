import { db } from '@/lib/db';
import { rewards } from '@/lib/db/schema';
import { RewardsManager } from '@/components/admin/rewards-manager';

export const dynamic = 'force-dynamic';

export default async function AdminRewardsPage() {
  const all = await db.select().from(rewards).orderBy(rewards.cost);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">🎁 Premios de La Timba</h1>
        <p className="muted text-sm mt-1.5">Catálogo de premios canjeables por tokens</p>
      </div>
      <RewardsManager rewards={all} />
    </div>
  );
}
