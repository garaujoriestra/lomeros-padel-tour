import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { listPozoMatches, pozoStandingsLive } from '@/lib/tournament/pozo-engine';
import { buildDisplayContext, buildPozoGrid } from '@/lib/tournament/pozo-view';
import { PairsEditor } from './pairs-editor';
import { GenerateButton } from './generate-button';
import { PozoGrid } from '@/components/tournament/pozo-grid';
import { PozoStandings } from '@/components/tournament/pozo-standings';

export async function EventPanel({ id }: { id: string }) {
  const ev = await loadEvent(db, id);
  const roster = ev.participantPlayerIds.length
    ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ev.participantPlayerIds))
    : [];
  const pairs = await loadPairs(db, id);
  const ctx = buildDisplayContext(roster, pairs);
  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ id: c.id, label: c.label }));

  const isPozo = ev.kind === 'pozo';
  const isDraft = ev.status === 'draft';
  const needsPairs = isPozo && ev.format === 'fixed_pairs';
  const pairsComplete = pairs.length > 0 && pairs.length * 2 === ev.participantPlayerIds.length;

  const matches = isPozo && !isDraft ? await listPozoMatches(db, id) : [];
  const standings = isPozo && !isDraft ? await pozoStandingsLive(db, id) : [];
  const grid = buildPozoGrid(matches, courtsByOrder, ctx);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sec-title">{ev.name}</h1>
        <p className="muted text-sm mt-1">
          {ev.date}{ev.location ? ` · ${ev.location}` : ''} · {isPozo ? 'Pozo' : 'Torneo'} · {ev.format}
        </p>
      </div>

      <div className="text-sm">
        <p className="font-medium">Pistas (escalera):</p>
        <ol className="list-decimal ml-5">
          {courtsByOrder.map((c) => <li key={c.id}>{c.label}</li>)}
        </ol>
        <p className="font-medium mt-2">Participantes: {ev.participantPlayerIds.length}</p>
      </div>

      {!isPozo && (
        <p className="text-ink-3 text-sm">La UI del torneo llega en la siguiente tanda.</p>
      )}

      {isPozo && isDraft && (
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

      {isPozo && !isDraft && (
        <div className="space-y-6">
          <section>
            <h2 className="font-medium mb-2">Parrilla</h2>
            <PozoGrid tournamentId={id} grid={grid} editable />
          </section>
          <section>
            <h2 className="font-medium mb-2">Clasificación</h2>
            <PozoStandings standings={standings} courtsByOrder={courtsByOrder} ctx={ctx} />
          </section>
        </div>
      )}
    </div>
  );
}
