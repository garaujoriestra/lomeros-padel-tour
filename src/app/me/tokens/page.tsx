import { redirect } from 'next/navigation';
import { eq, desc, and } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/lib/db';
import { bets, tokenLedger, rewards, redemptions, penalties } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { RedeemButton } from '@/components/betting/redeem-button';
import { potEuros } from '@/lib/betting/pot';

export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<string, string> = {
  buyin: 'Entrada (5 €)',
  rebuy: 'Recompra (5 €)',
  bet_placed: 'Apuesta',
  bet_cancelled: 'Apuesta cancelada',
  bet_won: 'Apuesta ganada',
  bet_refunded: 'Apuesta devuelta',
  redemption: 'Canje de premio',
  redemption_refunded: 'Canje cancelado',
  settlement_reversal: 'Corrección de resultado',
  adjustment: 'Ajuste',
};

const REDEMPTION_STATUS_LABEL: Record<string, string> = {
  pending: '⏳ Pendiente',
  fulfilled: '✅ Entregado',
  cancelled: '❌ Cancelado',
};

export default async function TokensPage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/me/tokens');
  const player = session.player;
  if (!player) redirect('/me');

  const [openBets, ledger, catalog, myRedemptions, myPenalties, pot] = await Promise.all([
    db
      .select()
      .from(bets)
      .where(and(eq(bets.playerId, player.id), eq(bets.status, 'open')))
      .orderBy(desc(bets.createdAt)),
    db
      .select()
      .from(tokenLedger)
      .where(eq(tokenLedger.playerId, player.id))
      .orderBy(desc(tokenLedger.createdAt))
      .limit(50),
    db.select().from(rewards).where(eq(rewards.active, true)).orderBy(rewards.cost),
    db
      .select({
        id: redemptions.id,
        cost: redemptions.cost,
        status: redemptions.status,
        requestedAt: redemptions.requestedAt,
        rewardTitle: rewards.title,
      })
      .from(redemptions)
      .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
      .where(eq(redemptions.playerId, player.id))
      .orderBy(desc(redemptions.requestedAt)),
    db
      .select()
      .from(penalties)
      .where(and(eq(penalties.playerId, player.id), eq(penalties.status, 'pending'))),
    potEuros(),
  ]);

  const pendingPenalty = myPenalties[0] ?? null;

  return (
    <div className="space-y-6">
      {/* ── Cabecera: saldo ── */}
      <section className="section">
        <div className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <h1 className="sec-title" style={{ margin: 0 }}>🪙 Mi cartera</h1>
            <Link href="/me" className="small muted" style={{ fontWeight: 600 }}>← Volver</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span
              className="num"
              style={{ fontSize: 48, fontWeight: 900, lineHeight: 1, color: pendingPenalty ? 'var(--loss)' : 'var(--acc-text)' }}
            >
              {player.tokenBalance}
            </span>
            <span className="muted" style={{ fontWeight: 700, fontSize: 16 }}>tokens</span>
          </div>
          <div className="small muted" style={{ textAlign: 'center', marginTop: 6 }}>💰 Bote de La Timba: {pot.toFixed(2)} €</div>

          {pendingPenalty && (
            <div
              style={{
                marginTop: 4,
                padding: 'calc(12px * var(--sp))',
                borderRadius: 12,
                border: '1.5px solid color-mix(in oklab, var(--loss) 35%, transparent)',
                background: 'color-mix(in oklab, var(--loss) 8%, transparent)',
              }}
            >
              <p style={{ margin: 0, fontWeight: 800, color: 'var(--loss)', fontSize: 14 }}>
                💀 Estás en bancarrota.
              </p>
              {pendingPenalty.description ? (
                <p className="small muted" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
                  Tu penalización: &ldquo;{pendingPenalty.description}&rdquo;. Cúmplela y el admin te recargará{' '}
                  <b className="num">{pendingPenalty.rechargeAmount} tokens</b>.
                </p>
              ) : (
                <p className="small muted" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
                  El admin te asignará una penalización; al cumplirla recibirás{' '}
                  <b className="num">{pendingPenalty.rechargeAmount} tokens</b>.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Apuestas abiertas ── */}
      {openBets.length > 0 && (
        <section className="section">
          <div className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="sec-title" style={{ margin: 0 }}>🎰 Apuestas abiertas</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {openBets.map((b) => (
                <Link
                  key={b.id}
                  href={`/matches/${b.matchId}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: 'calc(9px * var(--sp)) calc(11px * var(--sp))',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                    background: 'var(--surface-2)',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <span className="small" style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Equipo {b.predictedTeam}
                    {b.predictedScore ? ` (${b.predictedScore})` : ''} · x{b.odds}
                  </span>
                  <span className="small num" style={{ whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--acc-text)' }}>
                    {b.amount} tk → {b.odds != null ? `${Math.round(b.amount * b.odds)} tk` : '?'}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Premios ── */}
      <section className="section">
        <div className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 className="sec-title" style={{ margin: 0 }}>🎁 Premios</h2>

          {catalog.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>El admin aún no ha creado premios.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {catalog.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: 'calc(10px * var(--sp)) calc(12px * var(--sp))',
                    borderRadius: 12,
                    border: '1px solid var(--line)',
                    background: 'var(--surface-2)',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.title}</div>
                    {r.description && (
                      <div className="small muted" style={{ marginTop: 3, lineHeight: 1.4 }}>{r.description}</div>
                    )}
                  </div>
                  <RedeemButton
                    rewardId={r.id}
                    cost={r.cost}
                    disabled={!!pendingPenalty || player.tokenBalance < r.cost}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Mis canjes */}
          {myRedemptions.length > 0 && (
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                className="small muted"
                style={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10.5 }}
              >
                Mis canjes
              </div>
              {myRedemptions.map((rd) => (
                <div
                  key={rd.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: 'calc(8px * var(--sp)) calc(11px * var(--sp))',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                    background: 'var(--surface-2)',
                  }}
                >
                  <span className="small" style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rd.rewardTitle}
                  </span>
                  <span className="small num" style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
                    {REDEMPTION_STATUS_LABEL[rd.status] ?? rd.status} · {rd.cost} tk
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Movimientos ── */}
      <section className="section">
        <div className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 className="sec-title" style={{ margin: 0 }}>📋 Movimientos</h2>
          {ledger.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>Sin movimientos aún.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ledger.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: 'calc(7px * var(--sp)) calc(10px * var(--sp))',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--surface-2)',
                  }}
                >
                  <span className="small" style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {REASON_LABEL[entry.reason] ?? entry.reason}
                  </span>
                  <span
                    className="small num"
                    style={{
                      whiteSpace: 'nowrap',
                      fontWeight: 800,
                      color: entry.amount >= 0 ? 'var(--win)' : 'var(--loss)',
                    }}
                  >
                    {entry.amount >= 0 ? '+' : ''}{entry.amount} → {entry.balanceAfter}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
