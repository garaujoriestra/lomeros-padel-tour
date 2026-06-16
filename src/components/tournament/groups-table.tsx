import type { GroupView } from '@/lib/tournament/torneo-view';
import { ResultEntry } from './result-entry';

interface Props { tournamentId: string; group: GroupView; editable: boolean }

export function GroupsTable({ tournamentId, group, editable }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium">Grupo {group.name}</h3>
      <table className="text-sm w-full max-w-lg">
        <thead>
          <tr className="text-left text-ink-3">
            <th className="p-1.5">#</th><th className="p-1.5">Pareja</th>
            <th className="p-1.5">PJ</th><th className="p-1.5">V</th><th className="p-1.5">E</th>
            <th className="p-1.5">D</th><th className="p-1.5">Dif</th><th className="p-1.5">Pts</th>
          </tr>
        </thead>
        <tbody>
          {group.standings.map((s) => (
            <tr key={s.pairId} className="border-t border-line">
              <td className="p-1.5">{s.rank}</td><td className="p-1.5">{s.label}</td>
              <td className="p-1.5">{s.played}</td><td className="p-1.5">{s.wins}</td><td className="p-1.5">{s.draws}</td>
              <td className="p-1.5">{s.losses}</td><td className="p-1.5">{s.gameDiff}</td><td className="p-1.5 font-medium">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-1 text-sm">
        {group.matches.map((m) => (
          <li key={m.matchId} className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-3 w-24">{m.courtLabel ?? ''}{m.scheduledStart ? ` · ${m.scheduledStart}` : ''}</span>
            <span className={m.winner === 'A' ? 'font-semibold' : ''}>{m.teamA}</span>
            <span className="text-ink-3">vs</span>
            <span className={m.winner === 'B' ? 'font-semibold' : ''}>{m.teamB}</span>
            {m.status === 'completed' ? (
              <span className="text-xs">{m.teamAScore}–{m.teamBScore}</span>
            ) : editable && m.playable ? (
              <ResultEntry tournamentId={tournamentId} matchId={m.matchId} initialA={m.teamAScore} initialB={m.teamBScore} />
            ) : (
              <span className="text-xs text-ink-3">Pendiente</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
