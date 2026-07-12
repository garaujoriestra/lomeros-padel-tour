// Resumen de liquidación de «La Timba» para partidos ya jugados (server component).
import { db } from '@/lib/db';
import { bets, players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { LptAvatar } from '@/components/lpt/ui';

const TEAM_LABEL: Record<number, string> = { 1: 'Equipo 1', 2: 'Equipo 2' };

// El contexto llega por props (myPlayerId): este componente puede renderizarse
// bajo /g/[slug], y resolver su propio contexto sin slug le daría siempre el
// grupo por defecto en vez del grupo de la página que lo está montando.
export async function BetsSummary({ matchId, myPlayerId }: { matchId: string; myPlayerId: string | null }) {
  const rows = await db
    .select({
      id: bets.id,
      market: bets.market,
      predictedTeam: bets.predictedTeam,
      predictedScore: bets.predictedScore,
      amount: bets.amount,
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

  // El acierto es el pico emocional de La Timba: si el jugador con sesión ganó
  // aquí, su premio abre la liquidación como momento de retransmisión, no como
  // una línea verde más del ledger.
  const myWinTotal = myPlayerId
    ? rows
        .filter((r) => r.playerId === myPlayerId && r.status === 'won')
        .reduce((sum, r) => sum + (r.payout ?? 0), 0)
    : 0;

  return (
    <section className="section">
      <div className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="sec-title" style={{ margin: 0 }}>🎰 La Timba — resultado</h2>
        {myWinTotal > 0 && (
          <div
            data-testid="timba-celebration"
            className="lpt-card card-pad podium-gold"
            style={{ textAlign: 'center', animation: 'celebrateIn 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }}
          >
            <p style={{ fontSize: 30, lineHeight: 1, margin: 0 }}>🎉</p>
            <p className="display" style={{ fontSize: 26, margin: '6px 0 0' }}>¡Acertaste!</p>
            <p className="display num" style={{ fontSize: 42, color: 'var(--acc-text)', margin: '2px 0 0' }}>
              +{myWinTotal} fichas
            </p>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => {
            let delta: string;
            let color: string;
            if (r.status === 'won') {
              delta = `🎉 +${r.payout} fichas`;
              color = 'var(--win)';
            } else if (r.status === 'lost') {
              delta = `💸 -${r.amount} fichas`;
              color = 'var(--loss)';
            } else {
              // refunded: tokens devueltos
              delta = `↩️ +${r.amount} fichas`;
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
                  {r.predictedScore ? ` (${r.predictedScore})` : ''}
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
