import { db } from '@/lib/db';
import { players, tournamentGroups } from '@/lib/db/schema';
import { inArray, eq, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { loadTorneoMatches } from '@/lib/tournament/torneo-run';
import { buildDisplayContext } from '@/lib/tournament/pozo-view';
import { buildGroupsView, buildBracketView, torneoNextMatch } from '@/lib/tournament/torneo-view';
import { getSession } from '@/lib/auth/session';
import { TorneoBoard } from '@/components/tournament/torneo-board';

export const dynamic = 'force-dynamic';

export default async function PublicTorneoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = await getDefaultGroupId();
  if (!(await getTournamentInGroup(groupId, id))) notFound();
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  if (ev.kind !== 'torneo') notFound();

  const roster = ev.participantPlayerIds.length
    ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ev.participantPlayerIds))
    : [];
  const pairs = await loadPairs(db, id);
  const ctx = buildDisplayContext(roster, pairs);
  const courtLabelById = new Map(ev.courts.map((c) => [c.id, c.label]));
  const matches = ev.status !== 'draft' ? await loadTorneoMatches(db, id) : [];
  const groupRows = ev.status !== 'draft'
    ? await db.select({ id: tournamentGroups.id, name: tournamentGroups.name })
        .from(tournamentGroups).where(eq(tournamentGroups.tournamentId, id)).orderBy(asc(tournamentGroups.name))
    : [];
  const groupsView = buildGroupsView(groupRows, pairs, matches, ctx, courtLabelById);
  const bracket = buildBracketView(matches, ctx, courtLabelById);

  const session = await getSession();
  const myPlayerId = session?.player?.id ?? null;
  const myPairIds = myPlayerId ? pairs.filter((p) => p.player1Id === myPlayerId || p.player2Id === myPlayerId).map((p) => p.id) : [];
  const next = myPlayerId ? torneoNextMatch(matches, ctx, courtLabelById, myPlayerId, myPairIds) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">{ev.name}</h1>
        <p className="muted text-sm mt-1">{ev.date}{ev.location ? ` · ${ev.location}` : ''} · Torneo</p>
      </div>

      {ev.status === 'draft' && <p className="text-ink-3 text-sm">El torneo aún no se ha generado.</p>}

      {next && (
        <div className="lpt-card card-pad flex items-center gap-3">
          <span className="status-pill scheduled">Tu próximo partido</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{next.teamA} vs {next.teamB}</p>
            <p className="text-xs text-ink-3">{next.courtLabel ?? ''}{next.scheduledStart ? ` · ${next.scheduledStart}` : ''}</p>
          </div>
        </div>
      )}

      {(groupsView.length > 0 || bracket.rounds.length > 0) && (
        <TorneoBoard
          tournamentId={id}
          groups={groupsView}
          bracket={bracket}
          advance={(ev.config as { advancePerGroup?: number }).advancePerGroup ?? 2}
          editable={false}
          myPairIds={myPairIds}
        />
      )}
    </div>
  );
}
