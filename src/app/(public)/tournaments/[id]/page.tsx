import { db } from '@/lib/db';
import {
  tournaments, tournamentCourts, tournamentBlocks, tournamentParticipants,
  tournamentPairs, tournamentMatches, players,
} from '@/lib/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PozoStandings, GroupStandingsTables } from '@/components/tournament/standings';
import {
  matchTeamLabels, nextMatchForPlayer, type DisplayContext, type PlayerScheduleMatch,
} from '@/lib/tournament/display';
import type { SlotRef } from '@/lib/tournament/types';

export const dynamic = 'force-dynamic';

const parse = (s: string | null): SlotRef | null => (s ? (JSON.parse(s) as SlotRef) : null);

export default async function PublicTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!tournament) notFound();

  const courts = await db.select().from(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
  const courtLabel = new Map(courts.map((c) => [c.id, c.label]));

  const blocks = await db.select().from(tournamentBlocks)
    .where(eq(tournamentBlocks.tournamentId, id)).orderBy(asc(tournamentBlocks.order));
  const blockIds = blocks.map((b) => b.id);

  const parts = await db
    .select({ id: players.id, name: players.name })
    .from(tournamentParticipants)
    .innerJoin(players, eq(players.id, tournamentParticipants.playerId))
    .where(eq(tournamentParticipants.tournamentId, id));
  const playerName = new Map(parts.map((p) => [p.id, p.name]));

  const pairRows = blockIds.length > 0
    ? await db.select().from(tournamentPairs).where(inArray(tournamentPairs.blockId, blockIds))
    : [];
  const pairLabel = new Map(pairRows.map((p) => [
    p.id, `${playerName.get(p.player1Id) ?? '—'} / ${playerName.get(p.player2Id) ?? '—'}`,
  ]));

  const ctx: DisplayContext = { playerName, pairLabel };

  const allMatches = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));

  // "Tu próximo partido" si el visitante está logueado y es participante.
  const session = await getSession();
  const viewerId = session?.player?.id;
  let nextMine: (PlayerScheduleMatch & { id: string; courtId: string | null }) | null = null;
  if (viewerId && playerName.has(viewerId)) {
    const myPairIds = new Set(
      pairRows.filter((p) => p.player1Id === viewerId || p.player2Id === viewerId).map((p) => p.id),
    );
    const enriched = allMatches.map((m) => ({
      id: m.id,
      courtId: m.courtId,
      slotA1: parse(m.slotA1), slotA2: parse(m.slotA2),
      slotB1: parse(m.slotB1), slotB2: parse(m.slotB2),
      scheduledStart: m.scheduledStart,
      status: m.status,
    }));
    nextMine = nextMatchForPlayer(enriched, viewerId, myPairIds);
  }

  return (
    <div className="space-y-6 py-2">
      <div>
        <h1 className="sec-title">{tournament.name}</h1>
        <p className="muted text-sm mt-1.5">{tournament.date}{tournament.location ? ` · ${tournament.location}` : ''}</p>
      </div>

      {nextMine && (() => {
        const { teamA, teamB } = matchTeamLabels(nextMine, ctx);
        const court = nextMine.courtId ? courtLabel.get(nextMine.courtId) : null;
        return (
          <Card className="border-acc">
            <CardHeader><CardTitle>Tu próximo partido</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{teamA} vs {teamB}</p>
              <p className="text-ink-3 mt-1">{nextMine.scheduledStart ?? '—'}{court ? ` · ${court}` : ''}</p>
            </CardContent>
          </Card>
        );
      })()}

      {allMatches.length === 0 ? (
        <p className="text-sm text-ink-3">La parrilla aún no está disponible.</p>
      ) : (
        blocks.map((block) => {
          const blockMatches = allMatches
            .filter((m) => m.blockId === block.id)
            .sort((x, y) =>
              x.round - y.round ||
              (x.scheduledStart ?? '99:99').localeCompare(y.scheduledStart ?? '99:99'));

          return (
            <Card key={block.id}>
              <CardHeader><CardTitle>{block.order}. {block.name}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {blockMatches.map((m) => {
                    const slots = {
                      slotA1: parse(m.slotA1), slotA2: parse(m.slotA2),
                      slotB1: parse(m.slotB1), slotB2: parse(m.slotB2),
                    };
                    const { teamA, teamB } = matchTeamLabels(slots, ctx);
                    const court = m.courtId ? courtLabel.get(m.courtId) : null;
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-2 border border-line rounded-md px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="text-ink-3 mr-2">{m.scheduledStart ?? '—'}{court ? ` · ${court}` : ''}</span>
                          <span className="font-medium">{teamA}</span>
                          <span className="text-ink-3"> vs </span>
                          <span className="font-medium">{teamB}</span>
                        </div>
                        <div className="shrink-0">
                          {m.status === 'completed'
                            ? <Badge variant="outline">{m.teamAScore}–{m.teamBScore}</Badge>
                            : <span className="text-ink-3 text-xs">Pendiente</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {block.type === 'pozo'
                  ? <PozoStandings blockId={block.id} playerName={playerName} />
                  : <GroupStandingsTables blockId={block.id} pairLabel={pairLabel} />}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
