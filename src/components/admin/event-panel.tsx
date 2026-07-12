import { db } from '@/lib/db';
import { players, tournamentGroups } from '@/lib/db/schema';
import { inArray, eq, asc } from 'drizzle-orm';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { listPozoMatches, pozoStandingsLive } from '@/lib/tournament/pozo-engine';
import { loadTorneoMatches } from '@/lib/tournament/torneo-run';
import { buildDisplayContext, buildEscaleraView, formatLabel } from '@/lib/tournament/pozo-view';
import { buildGroupsView, buildBracketView } from '@/lib/tournament/torneo-view';
import { PairsEditor } from './pairs-editor';
import { GenerateButton } from './generate-button';
import { DeleteEventButton } from './delete-event-button';
import { ShareEventButton } from './share-event-button';
import { PozoEscalera } from '@/components/tournament/pozo-escalera';
import { TorneoBoard } from '@/components/tournament/torneo-board';

export async function EventPanel({ id, groupSlug }: { id: string; groupSlug?: string }) {
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
          {ev.date}{ev.location ? ` · ${ev.location}` : ''} · {isPozo ? 'Pozo' : 'Torneo'} · {formatLabel(ev.format)}
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
              initialPairs={pairs.map((p) => [p.player1Id, p.player2Id] as [string, string])} groupSlug={groupSlug} />
          )}
          <GenerateButton tournamentId={id}
            disabled={needsPairs && !pairsComplete}
            disabledReason={needsPairs && !pairsComplete ? 'Define todas las parejas antes de generar.' : undefined}
            groupSlug={groupSlug} />
        </div>
      )}

      {isPozo && !isDraft && <PozoSection id={id} courtsByOrder={courtsByOrder} ctx={ctx} format={ev.format} participantPlayerIds={ev.participantPlayerIds} groupSlug={groupSlug} />}
      {!isPozo && !isDraft && <TorneoSection id={id} ctx={ctx} courtLabelById={courtLabelById} groupSlug={groupSlug} />}

      <div className="pt-6 mt-2 border-t border-line flex flex-wrap gap-3">
        <ShareEventButton id={id} kind={ev.kind} groupSlug={groupSlug} />
        <DeleteEventButton id={id} kind={ev.kind} groupSlug={groupSlug} />
      </div>
    </div>
  );
}

async function PozoSection({ id, courtsByOrder, ctx, format, participantPlayerIds, groupSlug }: {
  id: string; courtsByOrder: { id: string; label: string }[]; ctx: ReturnType<typeof buildDisplayContext>;
  format: string; participantPlayerIds: string[]; groupSlug?: string;
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
      <PozoEscalera tournamentId={id} view={view} standings={standings} editable groupSlug={groupSlug} />
    </section>
  );
}

async function TorneoSection({ id, ctx, courtLabelById, groupSlug }: {
  id: string; ctx: ReturnType<typeof buildDisplayContext>; courtLabelById: Map<string, string>; groupSlug?: string;
}) {
  const ev = await loadEvent(db, id);
  const matches = await loadTorneoMatches(db, id);
  const pairs = await loadPairs(db, id);
  const groupRows = await db.select({ id: tournamentGroups.id, name: tournamentGroups.name })
    .from(tournamentGroups).where(eq(tournamentGroups.tournamentId, id)).orderBy(asc(tournamentGroups.name));
  const groupsView = buildGroupsView(groupRows, pairs, matches, ctx, courtLabelById);
  const bracket = buildBracketView(matches, ctx, courtLabelById);
  const advance = (ev.config as { advancePerGroup?: number }).advancePerGroup ?? 2;
  return <TorneoBoard tournamentId={id} groups={groupsView} bracket={bracket} advance={advance} editable groupSlug={groupSlug} />;
}
