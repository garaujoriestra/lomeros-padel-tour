import { db } from '@/lib/db';
import { penalties, players } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { PenaltiesManager } from '@/components/admin/penalties-manager';

export const dynamic = 'force-dynamic';

export default async function AdminPenaltiesPage() {
  const rows = await db
    .select({
      id: penalties.id,
      description: penalties.description,
      status: penalties.status,
      rechargeAmount: penalties.rechargeAmount,
      createdAt: penalties.createdAt,
      playerName: players.name,
      playerNickname: players.nickname,
    })
    .from(penalties)
    .innerJoin(players, eq(players.id, penalties.playerId))
    .orderBy(desc(penalties.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">💀 Penalizaciones</h1>
        <p className="muted text-sm mt-1.5">
          Asigna penalizaciones a los arruinados y márcalas cumplidas para recargarles
        </p>
      </div>
      <PenaltiesManager penalties={rows} />
    </div>
  );
}
