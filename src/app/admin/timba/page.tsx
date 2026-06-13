import { db } from '@/lib/db';
import { players, penalties, tokenLedger } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { potEuros } from '@/lib/betting/pot';
import { TimbaEntries, type TimbaPlayerRow } from '@/components/admin/timba-entries';

export const dynamic = 'force-dynamic';

export default async function AdminTimbaPage() {
  const [allPlayers, pendingPen, entries, pot] = await Promise.all([
    db.select().from(players).orderBy(players.name),
    db.select().from(penalties).where(eq(penalties.status, 'pending')),
    db.select({ playerId: tokenLedger.playerId, reason: tokenLedger.reason })
      .from(tokenLedger).where(inArray(tokenLedger.reason, ['buyin', 'rebuy'])),
    potEuros(),
  ]);
  const bankrupt = new Set(pendingPen.map((p) => p.playerId));
  const entered = new Set(entries.map((e) => e.playerId));

  const rows: TimbaPlayerRow[] = allPlayers.map((p) => ({
    id: p.id, name: p.name, nickname: p.nickname, tokenBalance: p.tokenBalance,
    hasEntered: entered.has(p.id), bankrupt: bankrupt.has(p.id),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">💰 La Timba — entradas y bote</h1>
        <p className="muted text-sm mt-1.5">Registra el pago de 5 € (entrada o recompra) y consulta el bote</p>
      </div>
      <TimbaEntries players={rows} potEuros={pot} />
    </div>
  );
}
