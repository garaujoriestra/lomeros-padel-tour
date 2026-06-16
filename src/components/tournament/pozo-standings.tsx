import type { LadderStanding } from '@/lib/tournament/ladder';
import type { DisplayContext } from '@/lib/tournament/display';
import { standingLabel } from '@/lib/tournament/pozo-view';

interface Props {
  standings: LadderStanding[];
  courtsByOrder: { id: string; label: string }[];
  ctx: DisplayContext;
}

export function PozoStandings({ standings, courtsByOrder, ctx }: Props) {
  if (standings.length === 0) return null;
  const courtLabel = (court: number | null) =>
    court === null ? 'Descansa' : (courtsByOrder[court]?.label ?? `Pista ${court + 1}`);
  return (
    <table className="text-sm w-full max-w-md">
      <thead>
        <tr className="text-left text-ink-3">
          <th className="p-1.5">#</th><th className="p-1.5">Participante</th><th className="p-1.5">Pista</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s) => (
          <tr key={s.entityId} className="border-t border-line">
            <td className="p-1.5">{s.rank}</td>
            <td className="p-1.5">{standingLabel(s.entityId, ctx)}</td>
            <td className="p-1.5">{s.rank === 1 ? '👑 ' : ''}{courtLabel(s.court)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
