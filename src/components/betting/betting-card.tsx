'use client';

// Card de apuestas pari-mutuel para partidos programados.
// Dos mercados INDEPENDIENTES, ambos apostables a la vez con fichas separadas:
//   · Ganador        (winner)       — a qué pareja gana
//   · Marcador exacto (exact_score) — 2-0 / 2-1 de un equipo
// Cada uno es su propio «slip» con su importe y su botón. Si juegas el partido,
// solo se muestra el de Ganador, bloqueado a tu propia pareja.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { LptAvatar } from '@/components/lpt/ui';
import type { MatchPools, MarketView } from '@/lib/betting/match-odds';

export interface PublicBet {
  id: string; playerId: string;
  playerName: string; playerNickname: string | null; playerAvatarUrl: string | null;
  market: string; predictedTeam: number; predictedScore: string | null; amount: number;
}

interface BettingCardProps {
  matchId: string;
  groupSlug?: string;      // undefined en la raíz; slug del grupo bajo /g/[slug]
  team1Label: string;
  team2Label: string;
  pools: MatchPools;
  closesAtIso: string;
  balance: number | null;        // null = sin jugador vinculado
  bankrupt: boolean;
  ownTeam: 0 | 1 | 2;            // 0 = no juega este partido; 1/2 = su pareja
  myBets: { market: string; predictedTeam: number; predictedScore: string | null; amount: number }[];
  allBets: PublicBet[];
  minBet: number;
  maxBet: number;
}

const SCORES = ['2-0', '2-1'] as const;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function BettingCard(props: BettingCardProps) {
  const router = useRouter();
  const isPlayer = props.ownTeam !== 0;

  // Estado independiente por slip.
  const [winnerTeam, setWinnerTeam] = useState<1 | 2>(isPlayer ? (props.ownTeam as 1 | 2) : 1);
  const [winnerAmount, setWinnerAmount] = useState(props.minBet);
  const [marcadorTeam, setMarcadorTeam] = useState<1 | 2>(1);
  const [marcadorScore, setMarcadorScore] = useState<'2-0' | '2-1'>('2-0');
  const [marcadorAmount, setMarcadorAmount] = useState(props.minBet);
  // Progressive disclosure: la mayoría solo quiere el ganador; el marcador
  // exacto se abre a demanda (o si ya tienes una apuesta en ese mercado).
  const [showMarcador, setShowMarcador] = useState(() =>
    props.myBets.some((b) => b.market === 'exact_score'),
  );
  const [loading, setLoading] = useState(false);

  const closesAt = new Date(props.closesAtIso);
  const closesLabel = closesAt.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  const teamLabel = (t: number) => (t === 1 ? props.team1Label : props.team2Label);

  // Pago estimado si aciertas: pari-mutuel metiendo TU apuesta en el bote de ESE
  // mercado. Se excluye tu apuesta previa en ese mercado, porque el POST la sustituye.
  function estimate(marketView: MarketView, market: 'winner' | 'exact_score', selKey: string, amount: number) {
    const my = props.myBets.find((b) => b.market === market);
    const mySelKey = my
      ? my.market === 'winner' ? `team:${my.predictedTeam}` : `exact:${my.predictedTeam}:${my.predictedScore}`
      : null;
    const myAmt = my?.amount ?? 0;
    const baseTotal = marketView.total - myAmt;
    const baseSel = (marketView.selections[selKey]?.pool ?? 0) - (mySelKey === selKey ? myAmt : 0);
    const valid = amount >= props.minBet && amount <= props.maxBet;
    const payout = valid ? Math.round((amount * (baseTotal + amount)) / (baseSel + amount)) : null;
    const ratio = payout != null && amount > 0 ? round1(payout / amount) : null;
    return { payout, ratio, noPool: baseTotal <= 0 };
  }

  async function placeBet(
    market: 'winner' | 'exact_score',
    predictedTeam: 1 | 2,
    predictedScore: '2-0' | '2-1' | undefined,
    amount: number,
  ) {
    setLoading(true);
    try {
      const res = await fetch('/api/bets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: props.matchId, market, predictedTeam,
          predictedScore: market === 'exact_score' ? predictedScore : undefined, amount,
          ...(props.groupSlug && { g: props.groupSlug }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al apostar');
      toast.success(`Apuesta hecha: ${amount} fichas`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al apostar');
    } finally { setLoading(false); }
  }

  async function cancelBet(m: 'winner' | 'exact_score') {
    setLoading(true);
    try {
      const g = props.groupSlug ? `&g=${encodeURIComponent(props.groupSlug)}` : '';
      const res = await fetch(`/api/bets?matchId=${props.matchId}&market=${m}${g}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cancelar');
      toast.success('Apuesta cancelada y fichas devueltas');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cancelar');
    } finally { setLoading(false); }
  }

  const canBet = (amount: number) =>
    !loading && amount >= props.minBet && amount <= props.maxBet
    && props.balance !== null && amount <= props.balance && !props.bankrupt;

  // Preview del gasto ANTES de tocar el botón: cuánto queda, si sustituye una
  // apuesta previa, o por qué el botón está deshabilitado. Gastar fichas no
  // debe ser menos legible que canjear un premio.
  const renderSpendInfo = (market: 'winner' | 'exact_score', amount: number) => {
    if (props.balance === null) return null;
    const prev = props.myBets.find((b) => b.market === market)?.amount ?? 0;
    if (!Number.isFinite(amount) || amount < props.minBet || amount > props.maxBet) {
      return (
        <div className="small" style={{ color: 'var(--loss)', fontWeight: 600 }}>
          El importe debe estar entre {props.minBet} y {props.maxBet} fichas.
        </div>
      );
    }
    if (amount > props.balance) {
      return (
        <div className="small" style={{ color: 'var(--loss)', fontWeight: 600 }}>
          No te llega el saldo: tienes {props.balance} fichas.
        </div>
      );
    }
    return (
      <div className="small muted" style={{ fontWeight: 600 }}>
        {prev > 0 && <>Sustituirá tu apuesta actual de <b className="num">{prev} fichas</b> · </>}
        Te quedarán <b className="num" style={{ color: 'var(--ink)' }}>{props.balance + prev - amount} fichas</b>.
      </div>
    );
  };

  // Pago estimado como protagonista (display type) o, en bote frío, la verdad
  // sin número engañoso: el primer apostador no tiene proyección real.
  const renderPayout = (est: { payout: number | null; ratio: number | null; noPool: boolean }) => {
    if (est.noPool) {
      return (
        <div className="small muted" style={{ fontWeight: 600 }}>
          Serías el primero en este bote: el pago dependerá de quién apueste después.
        </div>
      );
    }
    if (est.payout == null) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
        <span className="small muted" style={{ fontWeight: 600 }}>Si aciertas cobras</span>
        <span className="display num" style={{ fontSize: 26, color: 'var(--acc-text)' }}>≈{est.payout}</span>
        <span className="small muted" style={{ fontWeight: 600 }}>
          fichas{est.ratio != null ? ` (x${est.ratio})` : ''}
        </span>
      </div>
    );
  };

  // ── Slip de Ganador ──
  const winnerSelKey = `team:${winnerTeam}`;
  const winnerEst = estimate(props.pools.winner, 'winner', winnerSelKey, winnerAmount);

  // ── Slip de Marcador exacto ──
  const marcadorSelKey = `exact:${marcadorTeam}:${marcadorScore}`;
  const marcadorEst = estimate(props.pools.exact, 'exact_score', marcadorSelKey, marcadorAmount);

  const showForms = props.balance !== null && !props.bankrupt;

  return (
    <section className="section">
      <div className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h2 className="sec-title" style={{ margin: 0 }}>🎰 La Timba</h2>
          <span className="small muted" style={{ fontWeight: 600 }}>Cierra {closesLabel}</span>
        </div>

        {props.balance === null && <p className="small muted" style={{ margin: 0 }}>Inicia sesión con tu cuenta para apostar.</p>}
        {props.balance !== null && props.bankrupt && (
          <p className="small" style={{ margin: 0, color: 'var(--loss)', fontWeight: 600 }}>💀 Estás en bancarrota. Recompra para volver a apostar.</p>
        )}
        {isPlayer && props.balance !== null && !props.bankrupt && (
          <p className="small muted" style={{ margin: 0 }}>Juegas este partido: solo puedes apostar a tu propia victoria. 💪</p>
        )}

        {showForms && (
          <>
            {/* ───── Mercado: Ganador ───── */}
            <div style={slipStyle}>
              <div style={slipTitleStyle}>Ganador</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {[1, 2].map((t) => {
                  const v = props.pools.winner.selections[`team:${t}`];
                  const fav = props.pools.eloFavoriteTeam === t;
                  const selected = winnerTeam === t;
                  const selectable = !isPlayer || props.ownTeam === t;
                  return (
                    <button
                      key={t} type="button"
                      disabled={!selectable}
                      className="press"
                      onClick={() => selectable && setWinnerTeam(t as 1 | 2)}
                      style={{
                        flex: 1, minWidth: 0, textAlign: 'left', padding: '11px 12px', borderRadius: 12,
                        border: selected ? '1.5px solid var(--acc)' : '1px solid var(--line)',
                        background: selected ? 'color-mix(in oklab, var(--acc) 12%, transparent)' : 'var(--surface)',
                        color: 'inherit', cursor: selectable ? 'pointer' : 'not-allowed', opacity: selectable ? 1 : 0.45,
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {teamLabel(t)} {fav && <span title="Favorito según Elo">⭐</span>}
                      </div>
                      <div className="small num muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                        Bote {v.pool} fichas{v.multiplier != null ? ` · x${v.multiplier}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Input type="number" min={props.minBet} max={props.maxBet} step={1} value={winnerAmount}
                  inputMode="numeric" enterKeyHint="done"
                  onChange={(e) => setWinnerAmount(Number(e.target.value))} style={{ maxWidth: 110 }}
                  aria-label="Fichas a apostar al ganador" data-testid="bet-winner-amount" />
                <span className="small muted" style={{ fontWeight: 600 }}>fichas ({props.minBet}–{props.maxBet})</span>
              </div>
              {renderSpendInfo('winner', winnerAmount)}
              <button type="button" data-testid="bet-winner-submit" className="press"
                onClick={() => placeBet('winner', winnerTeam, undefined, winnerAmount)} disabled={!canBet(winnerAmount)}
                style={submitStyle(canBet(winnerAmount))}>
                {loading ? 'Apostando…' : <>Apostar al ganador · {teamLabel(winnerTeam)}</>}
              </button>
              {renderPayout(winnerEst)}
            </div>

            {/* ───── Mercado: Marcador exacto (solo espectadores) ─────
                Colapsado por defecto: una decisión cada vez. Se abre a demanda
                o si ya tienes apuesta en ese mercado. */}
            {!isPlayer && !showMarcador && (
              <button
                type="button"
                className="press"
                data-testid="bet-marcador-toggle"
                onClick={() => setShowMarcador(true)}
                style={{
                  padding: '10px 14px', borderRadius: 12, fontWeight: 700, fontSize: 13,
                  border: '1px dashed var(--line-strong)', background: 'transparent',
                  color: 'var(--ink-2)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                ＋ Apostar también al marcador exacto
              </button>
            )}
            {!isPlayer && showMarcador && (
              <div style={slipStyle}>
                <div style={slipTitleStyle}>Marcador exacto</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2].map((t) => (
                    <button key={t} type="button" className="press" onClick={() => setMarcadorTeam(t as 1 | 2)} style={toggleStyle(marcadorTeam === t)}>
                      {teamLabel(t)}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {SCORES.map((s) => (
                    <button key={s} type="button" className="press" onClick={() => setMarcadorScore(s)} style={toggleStyle(marcadorScore === s)}>{s}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Input type="number" min={props.minBet} max={props.maxBet} step={1} value={marcadorAmount}
                    inputMode="numeric" enterKeyHint="done"
                    onChange={(e) => setMarcadorAmount(Number(e.target.value))} style={{ maxWidth: 110 }}
                    aria-label="Fichas a apostar al marcador" data-testid="bet-marcador-amount" />
                  <span className="small muted" style={{ fontWeight: 600 }}>fichas ({props.minBet}–{props.maxBet})</span>
                </div>
                {renderSpendInfo('exact_score', marcadorAmount)}
                <button type="button" data-testid="bet-marcador-submit" className="press"
                  onClick={() => placeBet('exact_score', marcadorTeam, marcadorScore, marcadorAmount)} disabled={!canBet(marcadorAmount)}
                  style={submitStyle(canBet(marcadorAmount))}>
                  {loading ? 'Apostando…' : <>Apostar al marcador · {teamLabel(marcadorTeam)} {marcadorScore}</>}
                </button>
                {renderPayout(marcadorEst)}
              </div>
            )}

            <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, gap: 8, flexWrap: 'wrap' }}>
              <span data-testid="bet-balance">Saldo: <b className="num" style={{ color: 'var(--ink)' }}>{props.balance} fichas</b></span>
            </div>
            <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
              Son dos apuestas independientes: puedes jugar a Ganador y a Marcador con fichas por separado.
              Cobro orientativo: el real depende de cómo quede cada bote al cerrar.
            </p>
          </>
        )}

        {props.balance !== null && props.myBets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="small muted" style={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10.5 }}>Tus apuestas</div>
            {props.myBets.map((b) => (
              <div key={b.market} data-testid={b.market === 'winner' ? 'my-bet-winner' : 'my-bet-marcador'}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="small" style={{ fontWeight: 700 }}>
                  {b.market === 'winner' ? 'Ganador' : 'Marcador'}: {teamLabel(b.predictedTeam)}
                  {b.market === 'exact_score' ? ` ${b.predictedScore}` : ''} · {b.amount} fichas
                </span>
                <button
                  type="button"
                  className="press"
                  onClick={() => cancelBet(b.market as 'winner' | 'exact_score')}
                  disabled={loading}
                  style={{
                    marginLeft: 'auto', padding: '4px 12px', minHeight: 44, borderRadius: 8, fontWeight: 700, fontSize: 11.5,
                    display: 'inline-flex', alignItems: 'center',
                    border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--loss-text)',
                    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1,
                  }}
                >
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        )}

        {props.allBets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="small muted" style={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10.5 }}>Apuestas de la peña</div>
            {props.allBets.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LptAvatar player={{ id: b.playerId, name: b.playerName, nickname: b.playerNickname, avatarUrl: b.playerAvatarUrl }} size={26} />
                <span className="small" style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.playerNickname || b.playerName}</span>
                <span className="small muted num" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  → {teamLabel(b.predictedTeam)}{b.market === 'exact_score' ? ` (${b.predictedScore})` : ''} · {b.amount} fichas
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const slipStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12,
  padding: 14, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface)',
};

const slipTitleStyle: React.CSSProperties = {
  fontWeight: 800, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)',
};

function submitStyle(enabled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '12px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 14,
    cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.5,
    background: 'var(--acc)', color: 'var(--on-acc)',
  };
}

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '8px 10px', borderRadius: 10, fontWeight: 700, fontSize: 12.5,
    border: active ? '1.5px solid var(--acc)' : '1px solid var(--line)',
    background: active ? 'color-mix(in oklab, var(--acc) 14%, transparent)' : 'var(--surface)',
    color: active ? 'var(--acc-text)' : 'var(--ink-3)', cursor: 'pointer',
  };
}
