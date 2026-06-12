'use client';

// Card de apuestas para partidos programados con apuestas abiertas («La Timba»).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { LptAvatar } from '@/components/lpt/ui';
import type { MatchOdds } from '@/lib/betting/odds';

export interface PublicBet {
  id: string;
  playerId: string;
  playerName: string;
  playerNickname: string | null;
  playerAvatarUrl: string | null;
  market: string;
  predictedTeam: number;
  predictedScore: string | null;
  amount: number;
  odds: number;
}

interface MyBet {
  market: string;
  predictedTeam: number;
  predictedScore: string | null;
  amount: number;
  odds: number;
}

interface BettingCardProps {
  matchId: string;
  team1Label: string;
  team2Label: string;
  odds: MatchOdds;
  closesAtIso: string;
  balance: number | null; // null = sin jugador vinculado (solo lectura)
  bankrupt: boolean;
  canBet: boolean; // false si el usuario juega este partido
  myBets: MyBet[];
  allBets: PublicBet[];
  minBet: number;
  maxBet: number;
}

const MARKET_LABEL: Record<string, string> = {
  winner: 'Ganador',
  exact_score: 'Marcador exacto',
};

function teamLabelOf(props: BettingCardProps, team: number): string {
  return team === 1 ? props.team1Label : props.team2Label;
}

export function BettingCard(props: BettingCardProps) {
  const router = useRouter();
  const [market, setMarket] = useState<'winner' | 'exact_score'>('winner');
  const [team, setTeam] = useState<1 | 2>(1);
  const [score, setScore] = useState<'2-0' | '2-1'>('2-0');
  const [amount, setAmount] = useState(props.minBet);
  const [loading, setLoading] = useState(false);

  const teamOdds = team === 1 ? props.odds.team1 : props.odds.team2;
  const currentOdds = market === 'winner' ? teamOdds.winner : teamOdds.exactScore;
  const closesAt = new Date(props.closesAtIso);
  const closesLabel = closesAt.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const existingInMarket = props.myBets.find((b) => b.market === market);
  const outOfRange = amount < props.minBet || amount > props.maxBet;
  const overBalance = props.balance != null && amount > props.balance;
  const canSubmit = !loading && !outOfRange && !overBalance;

  async function placeBet() {
    setLoading(true);
    try {
      const res = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: props.matchId,
          market,
          predictedTeam: team,
          predictedScore: market === 'exact_score' ? score : undefined,
          amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al apostar');
      toast.success(`Apuesta hecha: ${amount} tokens a cuota x${data.bet.odds}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al apostar');
    } finally {
      setLoading(false);
    }
  }

  async function cancelBet(m: 'winner' | 'exact_score') {
    setLoading(true);
    try {
      const res = await fetch(`/api/bets?matchId=${props.matchId}&market=${m}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al cancelar');
      toast.success('Apuesta cancelada y tokens devueltos');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cancelar');
    } finally {
      setLoading(false);
    }
  }

  const teamButton = (t: 1 | 2, label: string, o: { winner: number; exactScore: number }) => {
    const selected = team === t;
    return (
      <button
        type="button"
        onClick={() => setTeam(t)}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          padding: 'calc(11px * var(--sp)) calc(12px * var(--sp))',
          borderRadius: 12,
          border: selected ? '1.5px solid var(--acc)' : '1px solid var(--line)',
          background: selected ? 'color-mix(in oklab, var(--acc) 12%, transparent)' : 'var(--surface)',
          color: 'inherit',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <div
          style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {label}
        </div>
        <div className="small num muted" style={{ fontSize: 11.5, marginTop: 3 }}>
          Ganador <b style={{ color: 'var(--acc-text)' }}>x{o.winner}</b> · Exacto{' '}
          <b style={{ color: 'var(--acc-text)' }}>x{o.exactScore}</b>
        </div>
      </button>
    );
  };

  const toggleBtn = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: 'calc(8px * var(--sp)) 10px',
        borderRadius: 10,
        fontWeight: 700,
        fontSize: 12.5,
        border: active ? '1.5px solid var(--acc)' : '1px solid var(--line)',
        background: active ? 'color-mix(in oklab, var(--acc) 14%, transparent)' : 'var(--surface)',
        color: active ? 'var(--acc-text)' : 'var(--ink-3)',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <section className="section">
      <div className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <h2 className="sec-title" style={{ margin: 0 }}>🎰 La Timba</h2>
          <span className="small muted" style={{ fontWeight: 600 }}>Cierra {closesLabel}</span>
        </div>

        {/* Selector de equipo + cuotas */}
        <div style={{ display: 'flex', gap: 10 }}>
          {teamButton(1, props.team1Label, props.odds.team1)}
          {teamButton(2, props.team2Label, props.odds.team2)}
        </div>

        {/* Estados sin formulario */}
        {props.balance === null && (
          <p className="small muted" style={{ margin: 0 }}>
            Inicia sesión con tu cuenta de jugador para apostar.
          </p>
        )}
        {props.balance !== null && !props.canBet && (
          <p className="small muted" style={{ margin: 0 }}>
            Juegas este partido: no puedes apostar en él. 😏
          </p>
        )}
        {props.balance !== null && props.canBet && props.bankrupt && (
          <p className="small" style={{ margin: 0, color: 'var(--loss)', fontWeight: 600 }}>
            💀 Estás en bancarrota. Cumple tu penalización para volver a apostar.
          </p>
        )}

        {/* Formulario */}
        {props.balance !== null && props.canBet && !props.bankrupt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Mercado */}
            <div style={{ display: 'flex', gap: 8 }}>
              {toggleBtn(market === 'winner', 'Ganador', () => setMarket('winner'))}
              {toggleBtn(market === 'exact_score', 'Marcador exacto', () => setMarket('exact_score'))}
            </div>

            {/* Marcador exacto */}
            {market === 'exact_score' && (
              <div style={{ display: 'flex', gap: 8 }}>
                {toggleBtn(score === '2-0', '2-0', () => setScore('2-0'))}
                {toggleBtn(score === '2-1', '2-1', () => setScore('2-1'))}
              </div>
            )}

            {/* Cantidad */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Input
                type="number"
                min={props.minBet}
                max={props.maxBet}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                style={{ maxWidth: 110 }}
                aria-label="Cantidad a apostar"
              />
              <span className="small muted" style={{ fontWeight: 600 }}>
                tokens ({props.minBet}–{props.maxBet})
              </span>
            </div>

            {/* Botón apostar */}
            <button
              type="button"
              onClick={placeBet}
              disabled={!canSubmit}
              style={{
                width: '100%',
                padding: 'calc(12px * var(--sp))',
                borderRadius: 12,
                border: 'none',
                fontWeight: 800,
                fontSize: 14,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                opacity: canSubmit ? 1 : 0.5,
                background: 'var(--acc)',
                color: 'var(--on-acc)',
                transition: 'all 0.15s',
              }}
            >
              {existingInMarket ? 'Sustituir apuesta' : 'Apostar'} ·{' '}
              {teamLabelOf(props, team)} x{currentOdds}
            </button>

            <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
              <span>
                Saldo: <b className="num" style={{ color: 'var(--ink)' }}>{props.balance} tk</b>
              </span>
              <span>
                Pago potencial:{' '}
                <b className="num" style={{ color: 'var(--acc-text)' }}>{Math.round(amount * currentOdds)} tk</b>
              </span>
            </div>
          </div>
        )}

        {/* Mis apuestas abiertas */}
        {props.myBets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="small muted" style={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10.5 }}>
              Tus apuestas
            </div>
            {props.myBets.map((b) => (
              <div
                key={b.market}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  justifyContent: 'space-between',
                  padding: 'calc(9px * var(--sp)) calc(11px * var(--sp))',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: 'var(--surface-2)',
                }}
              >
                <div className="small" style={{ minWidth: 0, fontWeight: 600 }}>
                  <span className="lpt-badge accent" style={{ marginRight: 7 }}>{MARKET_LABEL[b.market] ?? b.market}</span>
                  {teamLabelOf(props, b.predictedTeam)}
                  {b.predictedScore ? ` (${b.predictedScore})` : ''} ·{' '}
                  <span className="num">{b.amount} tk · x{b.odds}</span>
                </div>
                <button
                  type="button"
                  onClick={() => cancelBet(b.market as 'winner' | 'exact_score')}
                  disabled={loading}
                  className="lpt-badge loss"
                  style={{ cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, border: '1px solid color-mix(in oklab, var(--loss) 30%, transparent)' }}
                >
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Apuestas de la peña */}
        {props.allBets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="small muted" style={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10.5 }}>
              Apuestas de la peña
            </div>
            {props.allBets.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LptAvatar
                  player={{ id: b.playerId, name: b.playerName, nickname: b.playerNickname, avatarUrl: b.playerAvatarUrl }}
                  size={26}
                />
                <span className="small" style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {b.playerNickname || b.playerName}
                </span>
                <span className="small muted num" style={{ marginLeft: 'auto', whiteSpace: 'nowrap', textAlign: 'right' }}>
                  → {teamLabelOf(props, b.predictedTeam)}
                  {b.predictedScore ? ` (${b.predictedScore})` : ''} · {b.amount} tk · x{b.odds}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
