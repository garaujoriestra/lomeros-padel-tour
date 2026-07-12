import type { GroupView, StandingRow } from '@/lib/tournament/torneo-view';
import { ResultEntry } from './result-entry';

const D = { fontFamily: 'var(--font-display)' as const };

interface Props { tournamentId: string; group: GroupView; advance: number; editable: boolean; myPairIds?: string[]; groupSlug?: string; }

export function GroupsTable({ tournamentId, group, advance, editable, myPairIds = [], groupSlug }: Props) {
  const mine = new Set(myPairIds);
  const qualifies = (s: StandingRow) => s.rank <= advance;

  const standRow = (s: StandingRow) => {
    const isMine = mine.has(s.pairId);
    const q = qualifies(s);
    return (
      <div
        key={s.pairId}
        className={`flex items-center gap-3 px-3 py-2 border-b border-line last:border-b-0 ${q ? 'bg-[color-mix(in_oklab,var(--win)_8%,transparent)]' : ''} ${s.rank === advance ? 'border-b-2 border-dashed border-[color-mix(in_oklab,var(--win)_45%,var(--line))]' : ''}`}
      >
        <span style={D} className={`italic font-extrabold text-lg w-7 text-center tabular-nums ${q ? 'text-win' : 'text-ink-3'}`}>{s.rank}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-[14px] truncate ${isMine ? 'underline decoration-dotted' : ''}`}>{s.label}</p>
          <p className="text-[11.5px] text-ink-3 tabular-nums">PJ {s.played} · {s.wins}-{s.losses}{s.draws ? `-${s.draws}` : ''} · {s.gameDiff >= 0 ? '+' : ''}{s.gameDiff}</p>
        </div>
        <span style={D} className={`italic font-extrabold text-xl tabular-nums ${q ? 'text-win' : 'text-ink'}`}>{s.points}</span>
      </div>
    );
  };

  return (
    <div className="lpt-card overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <h3 className="kicker">Grupo {group.name}</h3>
        <span className="text-[11px] text-ink-3">clasifican {advance}</span>
      </div>
      <div>{group.standings.map(standRow)}</div>
      <details className="border-t border-line">
        <summary className="px-3 py-2 text-[12.5px] text-ink-3 cursor-pointer select-none">Ver los {group.matches.length} partidos ▾</summary>
        <ul className="px-3 pb-3 space-y-1.5">
          {group.matches.map((m) => (
            <li key={m.matchId} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-[11px] text-ink-3 w-20 shrink-0">{m.courtLabel ?? ''}{m.scheduledStart ? ` · ${m.scheduledStart}` : ''}</span>
              <span className={m.winner === 'A' ? 'font-extrabold text-win' : ''}>{m.teamA}</span>
              <span className="text-ink-3">vs</span>
              <span className={m.winner === 'B' ? 'font-extrabold text-win' : ''}>{m.teamB}</span>
              {m.status === 'completed'
                ? <span style={D} className="italic font-extrabold tabular-nums">{m.teamAScore}–{m.teamBScore}</span>
                : editable && m.playable
                  ? <ResultEntry tournamentId={tournamentId} matchId={m.matchId} initialA={m.teamAScore} initialB={m.teamBScore} groupSlug={groupSlug} />
                  : <span className="text-[11px] text-ink-3">Pendiente</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
