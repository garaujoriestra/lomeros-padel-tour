import { db } from '@/lib/db';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { tournamentGroups } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { getPlayersInGroup } from '@/lib/players/queries';
import { notFound } from 'next/navigation';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { loadTorneoMatches } from '@/lib/tournament/torneo-run';
import { buildDisplayContext } from '@/lib/tournament/pozo-view';
import { buildGroupsView, buildBracketView, torneoNextMatch } from '@/lib/tournament/torneo-view';
import { TorneoBoard } from '@/components/tournament/torneo-board';
import { EmptyState } from '@/components/shared/empty-state';
import type { PageContext } from '@/lib/auth/page-context';

// Cuerpo compartido de /torneos/[id] (raíz) y /g/[slug]/torneos/[id]. Recibe el
// contexto de página ya resuelto (el llamante decide si resolverlo con o sin slug).
export async function TorneoPublicBody({ ctx, tournamentId: id }: { ctx: PageContext; tournamentId: string }) {
  const { groupId, basePath } = ctx;

  if (!(await getTournamentInGroup(groupId, id))) notFound();
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  if (ev.kind !== 'torneo') notFound();

  const roster = ev.participantPlayerIds.length
    ? await getPlayersInGroup(groupId, ev.participantPlayerIds)
    : [];
  const pairs = await loadPairs(db, id);
  const displayCtx = buildDisplayContext(roster, pairs);
  const courtLabelById = new Map(ev.courts.map((c) => [c.id, c.label]));
  const matches = ev.status !== 'draft' ? await loadTorneoMatches(db, id) : [];
  const groupRows = ev.status !== 'draft'
    ? await db.select({ id: tournamentGroups.id, name: tournamentGroups.name })
        .from(tournamentGroups).where(eq(tournamentGroups.tournamentId, id)).orderBy(asc(tournamentGroups.name))
    : [];
  const groupsView = buildGroupsView(groupRows, pairs, matches, displayCtx, courtLabelById);
  const bracket = buildBracketView(matches, displayCtx, courtLabelById);

  const myPlayerId = ctx.player?.id ?? null;
  const myPairIds = myPlayerId ? pairs.filter((p) => p.player1Id === myPlayerId || p.player2Id === myPlayerId).map((p) => p.id) : [];
  const next = myPlayerId ? torneoNextMatch(matches, displayCtx, courtLabelById, myPlayerId, myPairIds) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${basePath}/eventos`} className="sec-link" style={{ marginBottom: 10, display: 'inline-flex' }}>
          <ArrowLeft size={14} /> Eventos
        </Link>
        <h1 className="sec-title">{ev.name}</h1>
        <p className="muted text-sm mt-1">{ev.date}{ev.location ? ` · ${ev.location}` : ''} · Torneo</p>
      </div>

      {ev.status === 'draft' && (
        <EmptyState
          emoji="🏟️"
          title="El cuadro aún no está generado"
          hint="El organizador generará los partidos desde el panel de administración."
        />
      )}

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
