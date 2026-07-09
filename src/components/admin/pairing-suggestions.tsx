'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import type { Player } from '@/lib/db/schema';
import type { PairingOption } from '@/lib/rating/recommend-pairs';
import { LptAvatar, displayName } from '@/components/lpt/ui';

type Side = '' | 'drive' | 'reves';

interface PairHistoryEntry {
  player1Id: string;
  player2Id: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  synergyScore: number;
}

interface PairingSuggestionsProps {
  selectedIds: string[];
  players: Player[];
  onApply: (
    team1: [string, string],
    team2: [string, string],
    team1Sides: [Side, Side],
    team2Sides: [Side, Side],
  ) => void;
}

function pairMatchesPlayed(p1: string, p2: string, history: PairHistoryEntry[]): number {
  const f = history.find(
    (h) =>
      (h.player1Id === p1 && h.player2Id === p2) ||
      (h.player1Id === p2 && h.player2Id === p1),
  );
  return f?.matchesPlayed ?? 0;
}

function sideForPlayer(rec: PairingOption['team1SideRec'], pid: string): Side {
  if (!rec) return '';
  if (rec.driveSidePlayerId === pid) return 'drive';
  if (rec.revesSidePlayerId === pid) return 'reves';
  return '';
}

export function PairingSuggestions({ selectedIds, players, onApply }: PairingSuggestionsProps) {
  const [options, setOptions] = useState<PairingOption[] | null>(null);
  const [history, setHistory] = useState<PairHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const distinct = Array.from(new Set(selectedIds.filter(Boolean)));
  const ready = distinct.length === 4;
  // Clave estable independiente del orden de los huecos.
  const key = ready ? [...distinct].sort().join(',') : '';

  useEffect(() => {
    if (!ready) {
      setOptions(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/pairings/preview?ids=${encodeURIComponent(distinct.join(','))}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || 'Error');
        return res.json();
      })
      .then((data: { options: PairingOption[]; pairHistory: PairHistoryEntry[] }) => {
        if (cancelled) return;
        setOptions(data.options);
        setHistory(data.pairHistory ?? []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || 'No se pudieron calcular las parejas');
        setOptions(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const playerMap = Object.fromEntries(players.map((p) => [p.id, p]));

  if (!ready) {
    return (
      <div className="bg-acc/5 border border-acc/20 rounded-xl px-4 py-3 text-sm text-ink-3">
        💡 Selecciona los 4 jugadores para ver las combinaciones de parejas recomendadas.
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-line shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black text-ink-3 uppercase tracking-widest">🎯 Parejas recomendadas</p>
        {loading && <span className="text-xs text-ink-3">Calculando…</span>}
      </div>
      <p className="muted text-xs">
        Las 3 combinaciones posibles con estos 4 jugadores, ordenadas por equilibrio de Elo. Pulsa
        «Aplicar» para colocar los equipos y los lados sugeridos.
      </p>

      {error && (
        <div className="bg-loss/10 border border-loss/30 rounded-xl px-3 py-2 text-sm text-loss">
          {error}
        </div>
      )}

      {options && (
        <div className="space-y-3">
          {options.map((opt, idx) => {
            const best = idx === 0;
            const t1Win = Math.round(opt.team1WinProb * 100);

            const apply = () =>
              onApply(
                [opt.team1[0].id, opt.team1[1].id],
                [opt.team2[0].id, opt.team2[1].id],
                [sideForPlayer(opt.team1SideRec, opt.team1[0].id), sideForPlayer(opt.team1SideRec, opt.team1[1].id)],
                [sideForPlayer(opt.team2SideRec, opt.team2[0].id), sideForPlayer(opt.team2SideRec, opt.team2[1].id)],
              );

            const renderTeam = (
              team: PairingOption['team1'],
              teamElo: number,
              rec: PairingOption['team1SideRec'],
            ) => {
              const together = pairMatchesPlayed(team[0].id, team[1].id, history);
              return (
                <div className="flex-1 min-w-0">
                  {team.map((p) => {
                    const side = sideForPlayer(rec, p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-2 py-0.5">
                        <LptAvatar player={playerMap[p.id]} size={24} />
                        <span className="font-bold text-sm truncate">{displayName(playerMap[p.id])}</span>
                        {side && (
                          <span className="lpt-badge" style={{ fontSize: 9.5, padding: '2px 7px' }}>
                            {side === 'drive' ? 'Drive' : 'Revés'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div className="muted num" style={{ fontSize: 11, marginTop: 3 }}>
                    Elo {Math.round(teamElo)} ·{' '}
                    {together === 0 ? (
                      <b style={{ color: 'var(--acc-text)' }}>✦ inédita</b>
                    ) : (
                      `${together} juntos`
                    )}
                  </div>
                </div>
              );
            };

            return (
              <div
                key={idx}
                className="lpt-card card-pad"
                style={
                  best
                    ? { borderColor: 'var(--acc)', boxShadow: '0 0 0 1px var(--acc)' }
                    : { opacity: idx === 2 ? 0.82 : 1 }
                }
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <span className={`lpt-badge ${best ? 'accent' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {best && <Star size={11} strokeWidth={2.6} />} {opt.label}
                  </span>
                  <span className="num muted" style={{ fontSize: 11.5 }}>
                    Δ Elo{' '}
                    <b style={{ color: opt.eloDiff < 30 ? 'var(--win)' : opt.eloDiff < 80 ? 'var(--warn)' : 'var(--loss)' }}>
                      ±{Math.round(opt.eloDiff)}
                    </b>
                  </span>
                </div>

                <div className="pairing-teams flex gap-3 items-start">
                  {renderTeam(opt.team1, opt.team1Elo, opt.team1SideRec)}
                  <div className="pairing-vs shrink-0">
                    <div className="display text-ink-3" style={{ fontSize: 15 }}>VS</div>
                    <div className="num" style={{ fontWeight: 800, color: 'var(--acc-text)', fontSize: 11.5 }}>
                      {t1Win}–{100 - t1Win}
                    </div>
                  </div>
                  {renderTeam(opt.team2, opt.team2Elo, opt.team2SideRec)}
                </div>

                <div style={{ display: 'flex', height: 5, borderRadius: 99, overflow: 'hidden', gap: 2, marginTop: 10 }}>
                  <div style={{ width: `${t1Win}%`, background: 'var(--acc)' }} />
                  <div style={{ flex: 1, background: 'var(--surface-2)' }} />
                </div>

                <button
                  type="button"
                  onClick={apply}
                  className={`press mt-3 w-full min-h-[44px] rounded-xl text-sm font-bold transition-colors ${
                    best ? 'bg-acc text-on-acc hover:brightness-95' : 'bg-surface-2 text-ink-2 hover:bg-line'
                  }`}
                >
                  Aplicar esta combinación
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
