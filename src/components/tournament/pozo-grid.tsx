import type { PozoGridView } from '@/lib/tournament/pozo-view';
import { ResultEntry } from './result-entry';

interface Props {
  tournamentId: string;
  grid: PozoGridView;
  editable: boolean; // admin = true; pública = false
}

export function PozoGrid({ tournamentId, grid, editable }: Props) {
  if (grid.rounds.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2">Pista (escalera)</th>
            {grid.rounds.map((r) => <th key={r} className="text-left p-2">Ronda {r + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map(({ court, cells }, idx) => (
            <tr key={court.id} className="border-t border-line">
              <td className="p-2 font-medium whitespace-nowrap">{idx === 0 ? '👑 ' : ''}{court.label}</td>
              {cells.map((cell, j) => (
                <td key={j} className="p-2 align-top">
                  {!cell ? <span className="text-ink-3">—</span> : (
                    <div className="space-y-1">
                      <div className="text-xs text-ink-3">{cell.scheduledStart ?? ''}</div>
                      <div className={cell.winner === 'A' ? 'font-semibold' : ''}>{cell.teamA}</div>
                      <div className={cell.winner === 'B' ? 'font-semibold' : ''}>{cell.teamB}</div>
                      {cell.status === 'completed' ? (
                        <div className="text-xs">{cell.teamAScore}–{cell.teamBScore}</div>
                      ) : editable && cell.playable ? (
                        <ResultEntry tournamentId={tournamentId} matchId={cell.matchId}
                          initialA={cell.teamAScore} initialB={cell.teamBScore} />
                      ) : (
                        <div className="text-xs text-ink-3">Pendiente</div>
                      )}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
