import { db } from '@/lib/db';
import { tournaments, tournamentParticipants } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  scheduled: 'Programado',
  running: 'En juego',
  completed: 'Finalizado',
};

export default async function TournamentsAdminPage() {
  const rows = await db.select().from(tournaments).orderBy(desc(tournaments.date));
  const counts = await db
    .select({ tournamentId: tournamentParticipants.tournamentId, n: sql<number>`count(*)` })
    .from(tournamentParticipants)
    .groupBy(tournamentParticipants.tournamentId);
  const countById = new Map(counts.map((c) => [c.tournamentId, Number(c.n)]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="sec-title">Torneos</h1>
          <p className="muted text-sm mt-1.5">{rows.length} torneo{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/admin/tournaments/new" className="lpt-btn primary shrink-0" style={{ minHeight: 38, padding: '7px 13px', fontSize: 12.5 }}>
          <Plus size={15} /> Nuevo torneo
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12 text-ink-3">
          <p className="text-4xl mb-2">🏆</p>
          <p>No hay torneos todavía.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Torneo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-center">Jugadores</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <p className="font-medium">{t.name}</p>
                    {t.location && <p className="text-xs text-ink-3">{t.location}</p>}
                  </TableCell>
                  <TableCell className="text-sm">{t.date}</TableCell>
                  <TableCell className="text-center text-sm">{countById.get(t.id) ?? 0}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{STATUS_LABEL[t.status] ?? t.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
