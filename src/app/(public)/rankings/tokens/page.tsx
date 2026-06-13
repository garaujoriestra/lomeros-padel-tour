import { db } from '@/lib/db';
import { players, penalties } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { Coins } from 'lucide-react';
import { SectionHead, LptAvatar, displayName } from '@/components/lpt/ui';
import { potEuros } from '@/lib/betting/pot';

export const dynamic = 'force-dynamic';

export default async function TokensRankingPage() {
  const [ranked, pendingPenalties, pot] = await Promise.all([
    db.select().from(players).orderBy(desc(players.tokenBalance), players.name),
    db.select().from(penalties).where(eq(penalties.status, 'pending')),
    potEuros(),
  ]);
  const bankruptIds = new Set(pendingPenalties.map((p) => p.playerId));

  return (
    <section className="section">
      <SectionHead icon={Coins} title="La Timba — clasificación" />
      <div className="lpt-card" style={{ padding: 14, textAlign: 'center', marginBottom: 12 }}>
        <span className="muted text-sm">💰 Bote actual: </span>
        <strong>{pot.toFixed(2)} €</strong>
      </div>
      <div className="lpt-card" style={{ overflow: 'hidden' }}>
        {ranked.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center gap-3 px-4 py-2.5"
            style={{ borderTop: i ? '1px solid var(--line)' : 'none' }}
          >
            <span className="muted" style={{ width: 22, textAlign: 'right' }}>{i + 1}</span>
            <LptAvatar player={p} size={30} />
            <span className="text-sm font-semibold">
              {displayName(p)} {bankruptIds.has(p.id) && '💀'}
            </span>
            <span style={{ marginLeft: 'auto', fontWeight: 700 }}>{p.tokenBalance} tk</span>
          </div>
        ))}
      </div>
    </section>
  );
}
