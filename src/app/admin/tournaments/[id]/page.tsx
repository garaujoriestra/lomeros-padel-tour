import { db } from '@/lib/db';
import {
  tournaments, tournamentCourts, tournamentParticipants, tournamentBlocks, players,
} from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GenerateButton } from '@/components/admin/generate-button';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', scheduled: 'Programado', running: 'En juego', completed: 'Finalizado',
};

const FORMAT_LABEL: Record<string, string> = {
  timed: 'A tiempo', first_to_set: 'Primer set', games: 'A juegos', best_of_3: 'Al mejor de 3',
};

export default async function TournamentPanelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!tournament) notFound();

  const courts = await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, id)).orderBy(asc(tournamentCourts.order));

  const participants = await db
    .select({ name: players.name })
    .from(tournamentParticipants)
    .innerJoin(players, eq(players.id, tournamentParticipants.playerId))
    .where(eq(tournamentParticipants.tournamentId, id))
    .orderBy(asc(players.name));

  const blocks = await db.select().from(tournamentBlocks)
    .where(eq(tournamentBlocks.tournamentId, id)).orderBy(asc(tournamentBlocks.order));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="sec-title">{tournament.name}</h1>
            <Badge variant="outline">{STATUS_LABEL[tournament.status] ?? tournament.status}</Badge>
          </div>
          <p className="muted text-sm mt-1.5">{tournament.date}{tournament.location ? ` · ${tournament.location}` : ''}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href={`/admin/tournaments/${id}/blocks`} className="lpt-btn" style={{ minHeight: 38, padding: '7px 13px', fontSize: 12.5 }}>
            <Pencil size={15} /> Editar bloques
          </Link>
          {blocks.length > 0 && <GenerateButton tournamentId={id} />}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Pistas ({courts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {courts.map((c) => (
              <div key={c.id} className="flex justify-between">
                <span>{c.label}</span>
                <span className="text-ink-3">{c.availableFrom}–{c.availableTo}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Participantes ({participants.length})</CardTitle></CardHeader>
          <CardContent className="text-sm text-ink-3">
            {participants.map((p) => p.name).join(', ') || '—'}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Bloques ({blocks.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {blocks.length === 0 ? (
            <p className="text-sm text-ink-3">Sin bloques. Pulsa &quot;Editar bloques&quot; para configurarlos.</p>
          ) : (
            blocks.map((b) => {
              const config = JSON.parse(b.config) as { matchFormat?: { kind?: string } };
              return (
                <div key={b.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{b.order}. {b.name}</span>
                    <span className="text-ink-3"> · {b.type === 'pozo' ? 'Pozo' : 'Parejas fijas'}</span>
                  </div>
                  <span className="text-ink-3">{b.durationMinutes} min · {FORMAT_LABEL[config.matchFormat?.kind ?? ''] ?? '—'}</span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
