import { db } from '@/lib/db';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getPlayersInGroup } from '@/lib/players/queries';
import { notFound } from 'next/navigation';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { listPozoMatches, pozoStandingsLive } from '@/lib/tournament/pozo-engine';
import { buildDisplayContext, buildEscaleraView, formatLabel } from '@/lib/tournament/pozo-view';
import { resolvePageContext } from '@/lib/auth/page-context';
import { PozoEscalera } from '@/components/tournament/pozo-escalera';
import { NextMatchCard } from '@/components/tournament/next-match-card';

export const dynamic = 'force-dynamic';

// Réplica de (public)/pozos/[id]/page.tsx (Task 5, paridad 2b): por debajo del
// umbral de extracción de body compartido, se copia con sustituciones
// (getDefaultGroupId→ctx.groupId, resolvePageContext(slug), href de vuelta con
// ctx.basePath).
export default async function GroupPozoPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await resolvePageContext(slug);
  const { groupId, basePath } = ctx;
  if (!(await getTournamentInGroup(groupId, id))) notFound();
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  if (ev.kind !== 'pozo') notFound();

  const roster = ev.participantPlayerIds.length
    ? await getPlayersInGroup(groupId, ev.participantPlayerIds)
    : [];
  const pairs = await loadPairs(db, id);
  const displayCtx = buildDisplayContext(roster, pairs);
  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ id: c.id, label: c.label }));
  const courtLabelById = new Map(courtsByOrder.map((c) => [c.id, c.label]));

  const matches = ev.status !== 'draft' ? await listPozoMatches(db, id) : [];
  const standings = ev.status !== 'draft' ? await pozoStandingsLive(db, id) : [];

  // "Tu próximo partido" para el jugador logueado, si participa.
  const myPlayerId = ctx.player?.id ?? null;
  const myPairIds = myPlayerId
    ? pairs.filter((p) => p.player1Id === myPlayerId || p.player2Id === myPlayerId).map((p) => p.id)
    : [];

  const allEntityIds = ev.format === 'americano' ? ev.participantPlayerIds : pairs.map((p) => p.id);
  const view = buildEscaleraView(matches, courtsByOrder, displayCtx, allEntityIds);
  const myEntityIds = ev.format === 'americano' ? (myPlayerId ? [myPlayerId] : []) : myPairIds;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`${basePath}/eventos`} className="sec-link" style={{ marginBottom: 10, display: 'inline-flex' }}>
          <ArrowLeft size={14} /> Eventos
        </Link>
        <h1 className="sec-title">{ev.name}</h1>
        <p className="muted text-sm mt-1">{ev.date}{ev.location ? ` · ${ev.location}` : ''} · Pozo · {formatLabel(ev.format)}</p>
        {ev.format === 'americano' && (
          <p className="text-ink-3 text-xs mt-1">Las parejas rotan cada ronda; clasificación individual.</p>
        )}
      </div>

      {ev.status === 'draft' && <p className="text-ink-3 text-sm">El pozo aún no se ha generado.</p>}

      {matches.length > 0 && myPlayerId && (
        <NextMatchCard matches={matches} playerId={myPlayerId} myPairIds={myPairIds} courtLabelById={courtLabelById} ctx={displayCtx} />
      )}

      {matches.length > 0 && (
        <PozoEscalera tournamentId={id} view={view} standings={standings} editable={false} myEntityIds={myEntityIds} />
      )}
    </div>
  );
}
