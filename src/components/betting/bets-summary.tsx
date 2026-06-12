// Resumen de liquidación de «La Timba» para partidos ya jugados (server component).
import { db } from '@/lib/db';
import { bets, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { LptAvatar } from '@/components/lpt/ui';

const TEAM_LABEL: Record<number, string> = { 1: 'Equipo 1', 2: 'Equipo 2' };

export async function BetsSummary({ matchId }: { matchId: string }) {
  const rows = await db
    .select({
      id: bets.id,
      market: bets.market,
      predictedTeam: bets.predictedTeam,
      predictedScore: bets.predictedScore,
      amount: bets.amount,
      odds: bets.odds,
      status: bets.status,
      payout: bets.payout,
      playerId: players.id,
      playerName: players.name,
      playerNickname: players.nickname,
      playerAvatarUrl: players.avatarUrl,
    })
    .from(bets)
    .innerJoin(players, eq(players.id, bets.playerId))
    .where(eq(bets.matchId, matchId));

  if (rows.length === 0) return null;

  return (
    <section className="section">
      <div className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="sec-title" style={{ margin: 0 }}>🎰 La Timba — resultado</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => {
            let delta: string;
            let color: string;
            if (r.status === 'won') {
              delta = `🎉 +${r.payout} tk`;
              color = 'var(--win)';
            } else if (r.status === 'lost') {
              delta = `💸 -${r.amount} tk`;
              color = 'var(--loss)';
            } else {
              // refunded (o cualquier otro estado residual): tokens devueltos
              delta = '↩️ ±0 tk (devuelta)';
              color = 'var(--ink-3)';
            }
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LptAvatar
                  player={{ id: r.playerId, name: r.playerName, nickname: r.playerNickname, avatarUrl: r.playerAvatarUrl }}
                  size={26}
                />
                <span className="small" style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.playerNickname || r.playerName}
                </span>
                <span className="small muted num" style={{ whiteSpace: 'nowrap' }}>
                  {TEAM_LABEL[r.predictedTeam] ?? `Equipo ${r.predictedTeam}`}
                  {r.predictedScore ? ` (${r.predictedScore})` : ''} · x{r.odds}
                </span>
                <span className="small num" style={{ marginLeft: 'auto', fontWeight: 800, color, whiteSpace: 'nowrap' }}>
                  {delta}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
