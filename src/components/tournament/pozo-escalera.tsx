'use client';

import { useState, Fragment } from 'react';
import type { EscaleraView, EscaleraLane, EscaleraSide } from '@/lib/tournament/pozo-view';
import type { LadderStanding } from '@/lib/tournament/ladder';
import { ResultEntry } from './result-entry';

interface Props {
  tournamentId: string;
  view: EscaleraView;
  standings: LadderStanding[];
  editable: boolean;            // admin true; público false
  myEntityIds?: string[];       // pareja/jugador del que mira (resalta su carril)
}

const D = { fontFamily: 'var(--font-display)' as const };

export function PozoEscalera({ tournamentId, view, standings, editable, myEntityIds = [] }: Props) {
  const [round, setRound] = useState(view.latestRound);
  const data = view.byRound[round];
  const stand = new Map(standings.map((s) => [s.entityId, s] as const));
  const mine = new Set(myEntityIds);

  if (!data) return <p className="muted text-sm">El pozo aún no se ha generado.</p>;

  const memberRow = (entityId: string, label: string) => {
    const s = stand.get(entityId);
    return (
      <div className="flex items-center gap-3 py-0.5">
        <span style={D} className={`italic font-extrabold text-lg w-6 text-center tabular-nums ${s?.rank === 1 ? 'text-acc-text' : 'text-ink-3'}`}>
          {s ? s.rank : '·'}
        </span>
        <span className="flex-1 font-bold text-[14.5px] min-w-0 truncate">{label}</span>
        {s && <span className="text-xs text-ink-3 tabular-nums">{s.games} <span className="opacity-60">jg</span></span>}
      </div>
    );
  };

  const sideScore = (side: EscaleraSide) => (
    <span style={D} className={`italic font-extrabold text-[22px] w-9 text-center tabular-nums rounded-md ${side.isWinner ? 'text-acc-text bg-[color-mix(in_oklab,var(--acc)_12%,transparent)]' : 'text-ink-3'}`}>
      {side.score ?? '·'}
    </span>
  );

  const sideBlock = (side: EscaleraSide) => (
    <div className="flex items-center gap-2">
      <div className="flex-1">{side.members.map((m) => <Fragment key={m.entityId}>{memberRow(m.entityId, m.label)}</Fragment>)}</div>
      {sideScore(side)}
    </div>
  );

  const sideLabel = (side: EscaleraSide) => side.members.map((m) => m.label).join(' / ');

  const movement = (lane: EscaleraLane) => {
    if (lane.status !== 'completed') {
      return <div className="flex justify-center text-[11px] text-ink-3 py-1">▲▼ se decide al guardar</div>;
    }
    const winSide = lane.sideA.isWinner ? lane.sideA : lane.sideB;
    const loseSide = lane.sideA.isWinner ? lane.sideB : lane.sideA;
    const upText = lane.isTop ? 'se quedan arriba' : 'suben';
    const downText = lane.isBottom ? 'se quedan' : 'bajan';
    return (
      <div className="flex justify-center gap-4 py-1 text-[11px] font-extrabold flex-wrap">
        <span className="text-win">▲ {sideLabel(winSide)} {upText}</span>
        <span className="text-loss">▼ {sideLabel(loseSide)} {downText}</span>
      </div>
    );
  };

  const statusPill = (lane: EscaleraLane) => {
    if (lane.status === 'completed') return <span className="status-pill completed">Final</span>;
    if (lane.playable) return <span className="status-pill" style={{ background: 'color-mix(in oklab, var(--win) 16%, transparent)', color: 'var(--win)' }}>● Jugándose</span>;
    return <span className="status-pill scheduled">Pendiente</span>;
  };

  const laneIsMine = (lane: EscaleraLane) =>
    lane.sideA.members.some((m) => mine.has(m.entityId)) ||
    lane.sideB.members.some((m) => mine.has(m.entityId));

  return (
    <div>
      {/* Scrubber */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <span className="kicker">Ronda</span>
        <div className="seg" role="group" aria-label="Selector de ronda">
          {view.rounds.map((r) => (
            <button key={r} onClick={() => setRound(r)} className={r === round ? 'on' : (r < view.latestRound ? 'text-acc-text' : '')} style={D} aria-label={`Ronda ${r + 1}`} aria-pressed={r === round}>
              {r + 1}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-ink-3">{round + 1} de {view.rounds.length}</span>
      </div>

      {/* Carriles */}
      <div className="flex flex-col gap-2">
        {data.lanes.map((lane) => (
          <div key={lane.matchId}>
            <div className={`lpt-card card-pad ${lane.isTop ? 'podium-gold' : ''} ${laneIsMine(lane) ? 'ring-2 ring-[color-mix(in_oklab,var(--win)_42%,var(--line))]' : ''}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="kicker">{lane.isTop ? '👑 ' : ''}{lane.courtLabel}</span>
                {statusPill(lane)}
              </div>
              {sideBlock(lane.sideA)}
              {sideBlock(lane.sideB)}
              {editable && lane.playable && lane.status !== 'completed' && (
                <div className="mt-2 pt-2 border-t border-line">
                  <ResultEntry tournamentId={tournamentId} matchId={lane.matchId} initialA={lane.sideA.score} initialB={lane.sideB.score} />
                </div>
              )}
            </div>
            {movement(lane)}
          </div>
        ))}

        {data.restingLabels.length > 0 && (
          <div className="lpt-card card-pad opacity-70">
            <div className="flex justify-between items-center mb-1">
              <span className="kicker">Descanso</span>
            </div>
            <p className="text-sm text-ink-2">😴 {data.restingLabels.join(', ')} {data.restingLabels.length === 1 ? 'descansa' : 'descansan'} esta ronda</p>
          </div>
        )}
      </div>
    </div>
  );
}
