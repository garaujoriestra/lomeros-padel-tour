import { resolvePageContext } from '@/lib/auth/page-context';
import { listPlayersByTokenBalance } from '@/lib/players/queries';
import { listPendingPenaltiesInGroup } from '@/lib/betting/queries';
import { Coins } from 'lucide-react';
import { SectionHead, LptAvatar, displayName } from '@/components/lpt/ui';
import { potEuros } from '@/lib/betting/pot';
import { EmptyState } from '@/components/shared/empty-state';

export const dynamic = 'force-dynamic';

// Réplica de (public)/rankings/tokens/page.tsx (44 líneas: por debajo del umbral
// de extracción de body compartido, se copia con sustituciones — mismo patrón
// documentado en matches/[id]/page.tsx y players/[id]/page.tsx). Sin hrefs
// internos que requieran basePath. `potEuros(groupId)` scopea el bote a los
// jugadores de este grupo (Task 8, paridad 2b — antes sumaba TODOS los grupos).
export default async function GroupTokensRankingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  const [ranked, pendingPenalties, pot] = await Promise.all([
    listPlayersByTokenBalance(ctx.groupId),
    listPendingPenaltiesInGroup(ctx.groupId),
    potEuros(ctx.groupId),
  ]);
  const bankruptIds = new Set(pendingPenalties.map((p) => p.playerId));

  return (
    <section className="section">
      <SectionHead icon={Coins} title="La Timba — clasificación" />
      <div className="lpt-card" style={{ padding: 14, textAlign: 'center', marginBottom: 12 }}>
        <span className="muted text-sm">💰 Bote actual: </span>
        <strong>{pot.toFixed(2)} €</strong>
      </div>
      {ranked.length === 0 ? (
        <EmptyState
          emoji="🪙"
          title="La Timba aún no ha empezado"
          hint="Cuando haya jugadores con fichas, verás aquí la clasificación."
        />
      ) : (
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
      )}
    </section>
  );
}
