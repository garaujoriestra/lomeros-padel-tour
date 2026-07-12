import { listPairStatsInGroup } from '@/lib/rating/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import Link from 'next/link';
import { Users, Info, Zap, ZapOff } from 'lucide-react';
import { SectionHead, AvatarStack, StatBar } from '@/components/lpt/ui';
import { DirectionalTransition } from '@/components/shared/view-transitions';
import type { PageContext } from '@/lib/auth/page-context';

// Body compartido entre (public)/rankings/pairs/page.tsx y g/[slug]/rankings/pairs/page.tsx
// (86 líneas > 80 → extracción). `ctx.groupId` sustituye a `getDefaultGroupId()`,
// `ctx.basePath` prefija los hrefs de jugador (raíz con basePath='' → idéntico).
export async function RankingsPairsBody({ ctx }: { ctx: PageContext }) {
  const groupId = ctx.groupId;
  const pairs = await listPairStatsInGroup(groupId, 1);
  const allPlayers = await listAllPlayersInGroup(groupId);
  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  return (
    <DirectionalTransition>
      <div>
      <section className="section">
        <SectionHead icon={Users} title="Ranking de parejas" />
        <p className="muted" style={{ margin: '0 0 18px', fontSize: 13.5, maxWidth: '58ch' }}>
          Elo conjunto de cada pareja y su <b>sinergia</b>: si rinden mejor (verde) o peor (rojo) juntos que por separado.
        </p>

        {pairs.length === 0 ? (
          <div className="muted" style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontSize: 40, margin: '0 0 10px' }}>👥</p>
            <p style={{ fontWeight: 600, margin: 0 }}>Aún no hay datos de parejas</p>
            <p className="small" style={{ marginTop: 6 }}>Registra partidos para ver las estadísticas de pareja</p>
          </div>
        ) : (
          <div className="stagger" style={{ display: 'grid', gap: 'calc(10px * var(--sp))' }}>
            {pairs.map((pair, i) => {
              const a = playerMap[pair.player1Id];
              const b = playerMap[pair.player2Id];
              const wr = pair.matchesPlayed > 0 ? Math.round((pair.wins / pair.matchesPlayed) * 100) : 0;
              const synergyPct = Math.round(pair.synergyScore * 100);
              const pos = synergyPct >= 0;
              return (
                <div key={pair.id} className="lpt-card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
                  <span className={`rank-pos ${i < 3 ? 'top' : ''}`} style={{ width: 28 }}>{i + 1}</span>
                  <AvatarStack players={[a, b]} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      <Link href={`${ctx.basePath}/players/${pair.player1Id}`} style={{ cursor: 'pointer' }}>{a ? a.nickname || a.name : '?'}</Link>
                      <span className="muted"> & </span>
                      <Link href={`${ctx.basePath}/players/${pair.player2Id}`} style={{ cursor: 'pointer' }}>{b ? b.nickname || b.name : '?'}</Link>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, minWidth: 0 }}>
                      <div style={{ flex: '1 1 60px', maxWidth: 130, minWidth: 36 }}>
                        <StatBar pct={wr} tone={wr >= 50 ? 'win' : 'loss'} height={5} />
                      </div>
                      <span className="small muted num" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {wr}% · {pair.matchesPlayed} juntos
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <span className="elo-num num">{Math.round(pair.pairElo)}</span>
                    <span className={`synergy ${pos ? 'pos' : 'neg'}`} title="Sinergia">
                      {pos ? <Zap size={13} strokeWidth={2.4} /> : <ZapOff size={13} strokeWidth={2.4} />}
                      {pos ? '+' : ''}{synergyPct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {pairs.length > 0 && (
        <div className="lpt-card card-pad" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Info size={16} style={{ color: 'var(--acc-text)', marginTop: 2, flexShrink: 0 }} />
          <p className="small muted" style={{ margin: 0 }}>
            La sinergia mide si una pareja rinde <b>mejor o peor de lo esperado</b> según sus estadísticas individuales.
            <span style={{ color: 'var(--win)', fontWeight: 600 }}> Positivo</span> = rinden mejor juntos.
            <span style={{ color: 'var(--loss)', fontWeight: 600 }}> Negativo</span> = rinden peor juntos.
          </p>
        </div>
      )}
      </div>
    </DirectionalTransition>
  );
}
