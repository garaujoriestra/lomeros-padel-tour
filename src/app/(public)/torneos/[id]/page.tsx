import { db } from '@/lib/db';
import { players, tournamentGroups } from '@/lib/db/schema';
import { inArray, eq, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { loadTorneoMatches } from '@/lib/tournament/torneo-run';
import { buildDisplayContext } from '@/lib/tournament/pozo-view';
import { buildGroupsView, buildBracketView, torneoNextMatch } from '@/lib/tournament/torneo-view';
import { getSession } from '@/lib/auth/session';
import { GroupsTable } from '@/components/tournament/groups-table';
import { BracketView } from '@/components/tournament/bracket-view';

export const dynamic = 'force-dynamic';

export default async function PublicTorneoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
        <div className="border border-line rounded-md p-3 bg-surface">
          <p className="font-medium">Tu próximo partido</p>
          <p className="text-sm">{next.teamA} vs {next.teamB}</p>
          <p className="text-xs text-ink-3">{next.courtLabel ?? ''}{next.scheduledStart ? ` · ${next.scheduledStart}` : ''}</p>
        </div>
      )}

      {groupsView.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-medium">Grupos</h2>
          {groupsView.map((g) => <GroupsTable key={g.name} tournamentId={id} group={g} editable={false} />)}
        </section>
      )}
      {bracket.rounds.length > 0 && (
        <section><h2 className="font-medium mb-2">Cuadro</h2><BracketView tournamentId={id} bracket={bracket} editable={false} /></section>
      )}
    </div>
  );
}
