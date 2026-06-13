'use client';

// Card de apuestas pari-mutuel para partidos programados.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { LptAvatar } from '@/components/lpt/ui';
import type { MatchPools } from '@/lib/betting/match-odds';

export interface PublicBet {
  id: string; playerId: string;
  playerName: string; playerNickname: string | null; playerAvatarUrl: string | null;
  market: string; predictedTeam: number; predictedScore: string | null; amount: number;
}

interface BettingCardProps {
  matchId: string;
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

export function BettingCard(props: BettingCardProps) {
  const router = useRouter();
  const isPlayer = props.ownTeam !== 0;
  const [market, setMarket] = useState<'winner' | 'exact_score'>('winner');
  const [team, setTeam] = useState<1 | 2>(isPlayer ? (props.ownTeam as 1 | 2) : 1);
  const [score, setScore] = useState<'2-0' | '2-1'>('2-0');
  const [amount, setAmount] = useState(props.minBet);
  const [loading, setLoading] = useState(false);

  const closesAt = new Date(props.closesAtIso);
  const closesLabel = closesAt.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  const outOfRange = amount < props.minBet || amount > props.maxBet;
  const overBalance = props.balance != null && amount > props.balance;
  const canSubmit = !loading && !outOfRange && !overBalance && props.balance !== null && !props.bankrupt;

  const selKey = market === 'winner' ? `team:${team}` : `exact:${team}:${score}`;
  const marketView = market === 'winner' ? props.pools.winner : props.pools.exact;

  // Pago estimado si aciertas: pari-mutuel metiendo TU apuesta en el bote.
  // Se excluye tu apuesta previa en este mercado, porque el POST la sustituye.
  const myInMarket = props.myBets.find((b) => b.market === market);
  const mySelKey = myInMarket
    ? myInMarket.market === 'winner'
      ? `team:${myInMarket.predictedTeam}`
      : `exact:${myInMarket.predictedTeam}:${myInMarket.predictedScore}`
    : null;
  const baseTotal = marketView.total - (myInMarket?.amount ?? 0);
  const baseSel = (marketView.selections[selKey]?.pool ?? 0) - (mySelKey === selKey ? (myInMarket?.amount ?? 0) : 0);
  const validAmount = amount >= props.minBet && amount <= props.maxBet;
  const estPayout = validAmount ? Math.round((amount * (baseTotal + amount)) / (baseSel + amount)) : null;
  const estRatio = estPayout != null && amount > 0 ? Math.round((estPayout / amount) * 10) / 10 : null;
  const noPoolYet = baseTotal <= 0; // serías el primero del mercado

  async function placeBet() {
    setLoading(true);
    try {
      const res = await fetch('/api/bets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: props.matchId, market, predictedTeam: team,
          predictedScore: market === 'exact_score' ? score : undefined, amount,
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
      const res = await fetch(`/api/bets?matchId=${props.matchId}&market=${m}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cancelar');
      toast.success('Apuesta cancelada y fichas devueltas');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cancelar');
    } finally { setLoading(false); }
  }

  const teamLabel = (t: number) => (t === 1 ? props.team1Label : props.team2Label);

  return (
    <section className="section">
      <div className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h2 className="sec-title" style={{ margin: 0 }}>🎰 La Timba</h2>
          <span className="small muted" style={{ fontWeight: 600 }}>Cierra {closesLabel}</span>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {[1, 2].map((t) => {
            const v = props.pools.winner.selections[`team:${t}`];
            const fav = props.pools.eloFavoriteTeam === t;
            const selected = team === t;
            const selectable = !isPlayer || props.ownTeam === t;
            return (
              <button
                key={t} type="button"
                disabled={!selectable}
                onClick={() => selectable && setTeam(t as 1 | 2)}
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

        {props.balance === null && <p className="small muted" style={{ margin: 0 }}>Inicia sesión con tu cuenta para apostar.</p>}
        {props.balance !== null && props.bankrupt && (
          <p className="small" style={{ margin: 0, color: 'var(--loss)', fontWeight: 600 }}>💀 Estás en bancarrota. Recompra para volver a apostar.</p>
        )}
        {isPlayer && props.balance !== null && !props.bankrupt && (
          <p className="small muted" style={{ margin: 0 }}>Juegas este partido: solo puedes apostar a tu propia victoria. 💪</p>
        )}

        {props.balance !== null && !props.bankrupt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!isPlayer && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setMarket('winner')} style={toggleStyle(market === 'winner')}>Ganador</button>
                <button type="button" onClick={() => setMarket('exact_score')} style={toggleStyle(market === 'exact_score')}>Marcador exacto</button>
              </div>
            )}
            {market === 'exact_score' && (
              <div style={{ display: 'flex', gap: 8 }}>
                {SCORES.map((s) => (
                  <button key={s} type="button" onClick={() => setScore(s)} style={toggleStyle(score === s)}>{s}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Input type="number" min={props.minBet} max={props.maxBet} step={1} value={amount}
                onChange={(e) => setAmount(Number(e.target.value))} style={{ maxWidth: 110 }} aria-label="Fichas a apostar" />
              <span className="small muted" style={{ fontWeight: 600 }}>fichas ({props.minBet}–{props.maxBet})</span>
            </div>
            <button type="button" onClick={placeBet} disabled={!canSubmit}
              style={{
                width: '100%', padding: '12px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 14,
                cursor: canSubmit ? 'pointer' : 'not-allowed', opacity: canSubmit ? 1 : 0.5,
                background: 'var(--acc)', color: 'var(--on-acc)',
              }}>
              Apostar · {teamLabel(team)}{market === 'exact_score' ? ` ${score}` : ''}
            </button>
            <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, gap: 8, flexWrap: 'wrap' }}>
              <span>Saldo: <b className="num" style={{ color: 'var(--ink)' }}>{props.balance} fichas</b></span>
              {estPayout != null && (
                <span>Si aciertas, cobras ≈ <b className="num" style={{ color: 'var(--acc-text)' }}>{estPayout} fichas</b>{estRatio != null ? ` (x${estRatio})` : ''}</span>
              )}
            </div>
            <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
              {noPoolYet
                ? 'Aún no hay bote: serías el primero. Tu cobro crecerá según cuánta gente apueste al otro lado.'
                : 'Estimación orientativa: el cobro real depende de cómo quede el bote al cerrar.'}
            </p>
          </div>
        )}

        {props.balance !== null && props.myBets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="small muted" style={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10.5 }}>Tus apuestas</div>
            {props.myBets.map((b) => (
              <div key={b.market} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="small" style={{ fontWeight: 700 }}>
                  {b.market === 'winner' ? 'Ganador' : 'Marcador'}: {teamLabel(b.predictedTeam)}
                  {b.market === 'exact_score' ? ` ${b.predictedScore}` : ''} · {b.amount} fichas
                </span>
                <button
                  type="button"
                  onClick={() => cancelBet(b.market as 'winner' | 'exact_score')}
                  disabled={loading}
                  style={{
                    marginLeft: 'auto', padding: '4px 10px', borderRadius: 8, fontWeight: 700, fontSize: 11.5,
                    border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--loss)',
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

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '8px 10px', borderRadius: 10, fontWeight: 700, fontSize: 12.5,
    border: active ? '1.5px solid var(--acc)' : '1px solid var(--line)',
    background: active ? 'color-mix(in oklab, var(--acc) 14%, transparent)' : 'var(--surface)',
    color: active ? 'var(--acc-text)' : 'var(--ink-3)', cursor: 'pointer',
  };
}
