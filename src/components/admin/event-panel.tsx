import { db } from '@/lib/db';
import { players, tournamentGroups } from '@/lib/db/schema';
import { inArray, eq, asc } from 'drizzle-orm';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { listPozoMatches, pozoStandingsLive } from '@/lib/tournament/pozo-engine';
import { loadTorneoMatches } from '@/lib/tournament/torneo-run';
import { buildDisplayContext, buildEscaleraView } from '@/lib/tournament/pozo-view';
import { buildGroupsView, buildBracketView } from '@/lib/tournament/torneo-view';
import { PairsEditor } from './pairs-editor';
import { GenerateButton } from './generate-button';
import { PozoEscalera } from '@/components/tournament/pozo-escalera';
import { GroupsTable } from '@/components/tournament/groups-table';
import { BracketView } from '@/components/tournament/bracket-view';

export async function EventPanel({ id }: { id: string }) {
  const ev = await loadEvent(db, id);
  const roster = ev.participantPlayerIds.length
    ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ev.participantPlayerIds))
    : [];
  const pairs = await loadPairs(db, id);
  const ctx = buildDisplayContext(roster, pairs);
  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ id: c.id, label: c.label }));
  const courtLabelById = new Map(courtsByOrder.map((c) => [c.id, c.label]));

  const isPozo = ev.kind === 'pozo';
  const isDraft = ev.status === 'draft';
  const needsPairs = isPozo ? ev.format === 'fixed_pairs' : true;
  const pairsComplete = pairs.length > 0 && pairs.length * 2 === ev.participantPlayerIds.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sec-title">{ev.name}</h1>
        <p className="muted text-sm mt-1">
          {ev.date}{ev.location ? ` · ${ev.location}` : ''} · {isPozo ? 'Pozo' : 'Torneo'} · {ev.format}
        </p>
      </div>

      <div className="text-sm">
        <p className="font-medium">Pistas{isPozo ? ' (escalera)' : ''}:</p>
        <ol className="list-decimal ml-5">{courtsByOrder.map((c) => <li key={c.id}>{c.label}</li>)}</ol>
        <p className="font-medium mt-2">Participantes: {ev.participantPlayerIds.length}</p>
      </div>

      {isDraft && (
        <div className="space-y-3">
          {needsPairs && (
            <PairsEditor tournamentId={id} participants={roster}
              initialPairs={pairs.map((p) => [p.player1Id, p.player2Id] as [string, string])} />
          )}
          <GenerateButton tournamentId={id}
            disabled={needsPairs && !pairsComplete}
            disabledReason={needsPairs && !pairsComplete ? 'Define todas las parejas antes de generar.' : undefined} />
        </div>
      )}

      {isPozo && !isDraft && <PozoSection id={id} courtsByOrder={courtsByOrder} ctx={ctx} format={ev.format} participantPlayerIds={ev.participantPlayerIds} />}
      {!isPozo && !isDraft && <TorneoSection id={id} ctx={ctx} courtLabelById={courtLabelById} />}
    </div>
  );
}

async function PozoSection({ id, courtsByOrder, ctx, format, participantPlayerIds }: {
  id: string; courtsByOrder: { id: string; label: string }[]; ctx: ReturnType<typeof buildDisplayContext>;
  format: string; participantPlayerIds: string[];
}) {
  const matches = await listPozoMatches(db, id);
  const standings = await pozoStandingsLive(db, id);
  const allEntityIds = format === 'americano'
    ? participantPlayerIds
    : (await loadPairs(db, id)).map((p) => p.id);
  const view = buildEscaleraView(matches, courtsByOrder, ctx, allEntityIds);
  return (
    <section>
      <h2 className="sec-title mb-3">Escalera</h2>
      <PozoEscalera tournamentId={id} view={view} standings={standings} editable />
    </section>
  );
}

async function TorneoSection({ id, ctx, courtLabelById }: {
  id: string; ctx: ReturnType<typeof buildDisplayContext>; courtLabelById: Map<string, string>;
}) {
  const matches = await loadTorneoMatches(db, id);
  const pairs = await loadPairs(db, id);
  const groupRows = await db.select({ id: tournamentGroups.id, name: tournamentGroups.name })
    .from(tournamentGroups).where(eq(tournamentGroups.tournamentId, id)).orderBy(asc(tournamentGroups.name));
  const groupsView = buildGroupsView(groupRows, pairs, matches, ctx, courtLabelById);
  const bracket = buildBracketView(matches, ctx, courtLabelById);
  return (
    <div className="space-y-6">
      {groupsView.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-medium">Grupos</h2>
          {groupsView.map((g) => <GroupsTable key={g.name} tournamentId={id} group={g} editable />)}
        </section>
      )}
      {bracket.rounds.length > 0 && (
        <section><h2 className="font-medium mb-2">Cuadro</h2><BracketView tournamentId={id} bracket={bracket} editable /></section>
      )}
    </div>
  );
}
