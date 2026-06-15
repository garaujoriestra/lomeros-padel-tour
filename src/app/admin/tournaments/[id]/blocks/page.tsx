import { db } from '@/lib/db';
import {
  tournaments, tournamentParticipants, tournamentBlocks, tournamentGroups, tournamentPairs, players,
} from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { BlocksEditor, type EditorBlock } from '@/components/admin/blocks-editor';
import type { BlockConfig } from '@/lib/tournament/store';

export const dynamic = 'force-dynamic';

export default async function BlocksEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!tournament) notFound();

  const participants = await db
    .select({ id: players.id, name: players.name })
    .from(tournamentParticipants)
    .innerJoin(players, eq(players.id, tournamentParticipants.playerId))
    .where(eq(tournamentParticipants.tournamentId, id))
    .orderBy(asc(players.name));

  const blockRows = await db.select().from(tournamentBlocks)
    .where(eq(tournamentBlocks.tournamentId, id)).orderBy(asc(tournamentBlocks.order));

  const initial: EditorBlock[] = [];
  for (const b of blockRows) {
    const config = JSON.parse(b.config) as BlockConfig;
    if (b.type === 'pozo') {
      initial.push({
        type: 'pozo', name: b.name, durationMinutes: b.durationMinutes,
        matchFormat: config.matchFormat, bufferMinutes: config.bufferMinutes,
        roundMinutes: config.roundMinutes ?? 15,
        knockout: false, advancePerGroup: 1, groupNames: [], pairs: [],
      });
    } else {
      const groups = await db.select().from(tournamentGroups).where(eq(tournamentGroups.blockId, b.id));
      const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
      const prs = await db.select().from(tournamentPairs).where(eq(tournamentPairs.blockId, b.id));
      initial.push({
        type: 'fixed_pairs', name: b.name, durationMinutes: b.durationMinutes,
        matchFormat: config.matchFormat, bufferMinutes: config.bufferMinutes,
        roundMinutes: 15,
        knockout: config.knockout ?? false,
        advancePerGroup: config.advancePerGroup ?? 1,
        groupNames: groups.map((g) => g.name),
        pairs: prs.map((p) => ({
          player1Id: p.player1Id, player2Id: p.player2Id,
          seed: p.seed ?? null,
          groupName: p.groupId ? (groupNameById.get(p.groupId) ?? '') : '',
        })),
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Bloques · {tournament.name}</h1>
        <p className="muted text-sm mt-1.5">Configura la secuencia de bloques. Guardar reemplaza la parrilla generada.</p>
      </div>
      <BlocksEditor tournamentId={id} participants={participants} initial={initial} />
    </div>
  );
}
