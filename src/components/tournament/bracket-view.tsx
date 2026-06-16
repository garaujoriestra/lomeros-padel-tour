import type { BracketView as BracketViewModel } from '@/lib/tournament/torneo-view';
import { ResultEntry } from './result-entry';

interface Props { tournamentId: string; bracket: BracketViewModel; editable: boolean }

const roundTitle = (round: number, total: number) => {
  const fromEnd = total - 1 - round; // 0 = final
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinales';
  if (fromEnd === 2) return 'Cuartos';
  return `Ronda ${round + 1}`;
};

export function BracketView({ tournamentId, bracket, editable }: Props) {
  if (bracket.rounds.length === 0) return null;
  const total = bracket.rounds.length;
  return (
    <div className="flex gap-6 overflow-x-auto">
      {bracket.rounds.map(({ round, matches }) => (
        <div key={round} className="space-y-3 min-w-48">
          <p className="font-medium text-sm">{roundTitle(round, total)}</p>
          {matches.map((m) => (
            <div key={m.matchId} className="border border-line rounded-md p-2 space-y-1">
              <div className="text-xs text-ink-3">{m.courtLabel ?? ''}{m.scheduledStart ? ` · ${m.scheduledStart}` : ''}</div>
              <div className={m.winner === 'A' ? 'font-semibold' : ''}>{m.teamA}</div>
              <div className={m.winner === 'B' ? 'font-semibold' : ''}>{m.teamB}</div>
              {m.status === 'completed' ? (
                <div className="text-xs">{m.teamAScore}–{m.teamBScore}</div>
              ) : editable && m.playable ? (
                <ResultEntry tournamentId={tournamentId} matchId={m.matchId} initialA={m.teamAScore} initialB={m.teamBScore} />
              ) : (
                <div className="text-xs text-ink-3">Pendiente</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
