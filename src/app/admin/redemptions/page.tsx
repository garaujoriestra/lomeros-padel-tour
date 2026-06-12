import { db } from '@/lib/db';
import { redemptions, rewards, players } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { RedemptionsManager } from '@/components/admin/redemptions-manager';

export const dynamic = 'force-dynamic';

export default async function AdminRedemptionsPage() {
  const rows = await db
    .select({
      id: redemptions.id,
      status: redemptions.status,
      cost: redemptions.cost,
      requestedAt: redemptions.requestedAt,
      rewardTitle: rewards.title,
      playerName: players.name,
      playerNickname: players.nickname,
    })
    .from(redemptions)
    .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
    .innerJoin(players, eq(players.id, redemptions.playerId))
    .orderBy(desc(redemptions.requestedAt));

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
