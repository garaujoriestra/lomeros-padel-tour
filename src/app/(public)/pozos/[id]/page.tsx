import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { listPozoMatches, pozoStandingsLive } from '@/lib/tournament/pozo-engine';
import { buildDisplayContext, buildEscaleraView, formatLabel } from '@/lib/tournament/pozo-view';
import { getSession } from '@/lib/auth/session';
import { PozoEscalera } from '@/components/tournament/pozo-escalera';
import { NextMatchCard } from '@/components/tournament/next-match-card';

export const dynamic = 'force-dynamic';

export default async function PublicPozoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  if (ev.kind !== 'pozo') notFound();

  const roster = ev.participantPlayerIds.length
    ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ev.participantPlayerIds))
    : [];
  const pairs = await loadPairs(db, id);
  const ctx = buildDisplayContext(roster, pairs);
  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ id: c.id, label: c.label }));
  const courtLabelById = new Map(courtsByOrder.map((c) => [c.id, c.label]));

  const matches = ev.status !== 'draft' ? await listPozoMatches(db, id) : [];
  const standings = ev.status !== 'draft' ? await pozoStandingsLive(db, id) : [];

  // "Tu próximo partido" para el jugador logueado, si participa.
  const session = await getSession();
  const myPlayerId = session?.player?.id ?? null;
  const myPairIds = myPlayerId
    ? pairs.filter((p) => p.player1Id === myPlayerId || p.player2Id === myPlayerId).map((p) => p.id)
    : [];

  const allEntityIds = ev.format === 'americano' ? ev.participantPlayerIds : pairs.map((p) => p.id);
  const view = buildEscaleraView(matches, courtsByOrder, ctx, allEntityIds);
  const myEntityIds = ev.format === 'americano' ? (myPlayerId ? [myPlayerId] : []) : myPairIds;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">{ev.name}</h1>
        <p className="muted text-sm mt-1">{ev.date}{ev.location ? ` · ${ev.location}` : ''} · Pozo · {formatLabel(ev.format)}</p>
        {ev.format === 'americano' && (
          <p className="text-ink-3 text-xs mt-1">Las parejas rotan cada ronda; clasificación individual.</p>
        )}
      </div>

      {ev.status === 'draft' && <p className="text-ink-3 text-sm">El pozo aún no se ha generado.</p>}

      {matches.length > 0 && myPlayerId && (
        <NextMatchCard matches={matches} playerId={myPlayerId} myPairIds={myPairIds} courtLabelById={courtLabelById} ctx={ctx} />
      )}

      {matches.length > 0 && (
        <PozoEscalera tournamentId={id} view={view} standings={standings} editable={false} myEntityIds={myEntityIds} />
      )}
    </div>
  );
}
