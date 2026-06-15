import { db } from '@/lib/db';
import {
  tournaments, tournamentCourts, tournamentBlocks, tournamentParticipants,
  tournamentPairs, tournamentMatches, players,
} from '@/lib/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScheduleMatch } from '@/components/admin/schedule-match';
import { matchTeamLabels, isMatchPlayable, type DisplayContext } from '@/lib/tournament/display';
import { PozoStandings, GroupStandingsTables } from '@/components/tournament/standings';
import type { SlotRef } from '@/lib/tournament/types';

export const dynamic = 'force-dynamic';

const parse = (s: string | null): SlotRef | null => (s ? (JSON.parse(s) as SlotRef) : null);

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="sec-title">Parrilla · {tournament.name}</h1>
          <p className="muted text-sm mt-1.5">{tournament.date}</p>
        </div>
        <Link href={`/admin/tournaments/${id}`} className="lpt-btn" style={{ minHeight: 38, padding: '7px 13px', fontSize: 12.5 }}>
          ← Panel
        </Link>
      </div>

      {allMatches.length === 0 ? (
        <p className="text-sm text-ink-3">Aún no hay parrilla. Genera los partidos desde el panel.</p>
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
                    return (
                      <ScheduleMatch
                        key={m.id}
                        tournamentId={id}
                        matchId={m.id}
                        time={m.scheduledStart}
                        court={m.courtId ? (courtLabel.get(m.courtId) ?? null) : null}
                        teamA={teamA}
                        teamB={teamB}
                        status={m.status}
                        teamAScore={m.teamAScore}
                        teamBScore={m.teamBScore}
                        playable={isMatchPlayable(slots)}
                      />
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
