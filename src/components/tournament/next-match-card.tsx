import type { PozoMatchRow } from '@/lib/tournament/pozo-run';
import type { DisplayContext } from '@/lib/tournament/display';
import { matchTeamLabels, nextMatchForPlayer, type PlayerScheduleMatch } from '@/lib/tournament/display';
import { matchSlots } from '@/lib/tournament/pozo-view';

interface Props {
  matches: PozoMatchRow[];
  playerId: string;
  myPairIds: string[];
  courtLabelById: Map<string, string>;
  ctx: DisplayContext;
}

export function NextMatchCard({ matches, playerId, myPairIds, courtLabelById, ctx }: Props) {
  const scheduleMatches: (PlayerScheduleMatch & { id: string; courtId: string | null })[] = matches.map((m) => ({
    ...matchSlots(m), scheduledStart: m.scheduledStart, status: m.status, id: m.id, courtId: m.courtId,
  }));
  const next = nextMatchForPlayer(scheduleMatches, playerId, new Set(myPairIds));
  if (!next) return null;
  const { teamA, teamB } = matchTeamLabels(next, ctx);
  const court = next.courtId ? (courtLabelById.get(next.courtId) ?? '') : '';
  return (
    <div className="lpt-card card-pad flex items-center gap-3">
      <span className="status-pill scheduled">Tu próximo</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">{teamA} vs {teamB}</p>
        <p className="text-xs text-ink-3">{court}{next.scheduledStart ? ` · ${next.scheduledStart}` : ''}</p>
      </div>
    </div>
  );
}
