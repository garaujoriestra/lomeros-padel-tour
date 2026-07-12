'use client';

import { useEffect, useRef } from 'react';
import type { BracketView as BracketViewModel, MatchCell } from '@/lib/tournament/torneo-view';
import { ResultEntry } from './result-entry';

const D = { fontFamily: 'var(--font-display)' as const };

const roundTitle = (round: number, total: number) => {
  const fromEnd = total - 1 - round; // 0 = final
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinales';
  if (fromEnd === 2) return 'Cuartos';
  return `Ronda ${round + 1}`;
};

interface Props { tournamentId: string; bracket: BracketViewModel; editable: boolean; myPairIds?: string[]; groupSlug?: string; }

export function BracketView({ tournamentId, bracket, editable, myPairIds = [], groupSlug }: Props) {
  const mine = new Set(myPairIds);
  const liveCol = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-centra la ronda en juego en móvil al abrir.
    if (liveCol.current) liveCol.current.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
  }, []);

  if (bracket.rounds.length === 0) return null;
  const total = bracket.rounds.length;
  const liveRound = bracket.rounds.find((r) => r.matches.some((m) => m.playable))?.round ?? -1;
  const finalMatch = bracket.rounds[total - 1]?.matches[0];
  const champion = finalMatch && finalMatch.status === 'completed'
    ? (finalMatch.winner === 'A' ? finalMatch.teamA : finalMatch.teamB)
    : null;

  const sideRow = (label: string, id: string | null, score: number | null, isWinner: boolean, isBye: boolean) => (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 ${isWinner ? 'bg-[color-mix(in_oklab,var(--win)_14%,transparent)]' : ''}`}>
      {/* title=: los nombres largos truncados siempre tienen escape. */}
      <span title={isBye ? undefined : label} className={`flex-1 min-w-0 truncate text-[13.5px] ${isWinner ? 'font-extrabold text-win' : 'font-medium'} ${id && mine.has(id) ? 'underline decoration-dotted' : ''}`}>
        {isBye ? <span className="text-ink-3 italic">pasa directo</span> : label}
      </span>
      <span style={D} className={`italic font-extrabold text-base w-6 text-center tabular-nums ${isWinner ? 'text-win' : 'text-ink-3'}`}>
        {score ?? '·'}
      </span>
    </div>
  );

  const matchCard = (m: MatchCell, roundIsLive: boolean) => {
    const isMine = (m.teamAId && mine.has(m.teamAId)) || (m.teamBId && mine.has(m.teamBId));
    const pending = m.status !== 'completed';
    return (
      <div key={m.matchId} className={`lpt-card overflow-hidden ${m.isBye ? 'border-dashed opacity-80' : ''} ${isMine ? 'ring-2 ring-[color-mix(in_oklab,var(--win)_42%,var(--line))]' : ''}`}>
        <div className="flex justify-between items-center px-2.5 pt-1.5 text-[11px] text-ink-3">
          <span className="truncate">{m.courtLabel ?? ''}{m.scheduledStart ? ` · ${m.scheduledStart}` : ''}</span>
          {/* El ● verde se reserva a la ronda realmente en juego: un partido
              jugable de una ronda futura es «A continuación», no «en pista». */}
          {m.status === 'completed'
            ? <span className="status-pill completed">Final</span>
            : m.playable && roundIsLive
              ? <span className="status-pill" style={{ background: 'color-mix(in oklab, var(--win) 16%, transparent)', color: 'var(--win)' }}>● En pista</span>
              : m.playable
                ? <span className="status-pill completed">A continuación</span>
                : <span className="status-pill scheduled">Pendiente</span>}
        </div>
        {sideRow(m.teamA, m.teamAId, m.teamAScore, m.winner === 'A', m.isBye && m.teamAId === null)}
        <div className="border-t border-line" />
        {sideRow(m.teamB, m.teamBId, m.teamBScore, m.winner === 'B', m.isBye && m.teamBId === null)}
        {editable && m.playable && pending && (
          <div className="px-2.5 py-2 border-t border-line">
            <ResultEntry tournamentId={tournamentId} matchId={m.matchId} initialA={m.teamAScore} initialB={m.teamBScore} groupSlug={groupSlug} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Peak-end: el campeón abre la vista a ancho completo, no escondido al
          final del scroll horizontal. La celda del cuadro queda como secundaria. */}
      {champion && (
        <div className="lpt-card card-pad podium-gold text-center mb-4">
          <p className="text-3xl mb-1">👑</p>
          <p className="kicker justify-center">Campeón</p>
          <p style={D} className="italic font-extrabold uppercase text-2xl leading-tight mt-1">{champion}</p>
        </div>
      )}
      <div className="flex gap-5 overflow-x-auto pb-2 -mx-1 px-1">
        {bracket.rounds.map(({ round, matches }) => (
          <div
            key={round}
            ref={round === liveRound ? liveCol : undefined}
            // En móvil, un solo eje de scroll (el de la página): el max-h con
            // scroll interno por columna solo se aplica en pantallas grandes.
            className="flex flex-col gap-3 min-w-[230px] md:max-h-[70vh] md:overflow-y-auto snap-start"
          >
            <p className="kicker sticky top-0 z-[1] py-0.5 bg-surface">{roundTitle(round, total)}</p>
            {matches.map((m) => matchCard(m, round === liveRound))}
          </div>
        ))}
        {champion && (
          <div className="flex flex-col justify-center min-w-[200px]">
            <p className="kicker mb-2">Campeón</p>
            <div className="lpt-card card-pad podium-gold text-center">
              <p className="text-2xl mb-1">👑</p>
              <p style={D} className="italic font-extrabold text-lg leading-tight">{champion}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
