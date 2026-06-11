import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DeletePlayerButton } from './delete-player-button';

export const dynamic = 'force-dynamic';

export default async function PlayersAdminPage() {
  const allPlayers = await db.select().from(players).orderBy(desc(players.eloRating));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jugadores</h1>
          <p className="text-ink-3 text-sm">{allPlayers.length} jugador{allPlayers.length !== 1 ? 'es' : ''} registrado{allPlayers.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/admin/players/new">
          <Button>+ Nuevo jugador</Button>
        </Link>
      </div>

      {allPlayers.length === 0 ? (
        <div className="text-center py-12 text-ink-3">
          <p className="text-4xl mb-2">👤</p>
          <p>No hay jugadores todavía.</p>
          <Link href="/admin/players/new">
            <Button className="mt-4">Añadir el primero</Button>
          </Link>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jugador</TableHead>
                <TableHead className="text-center">ELO</TableHead>
                <TableHead className="text-center hidden sm:table-cell">P</TableHead>
                <TableHead className="text-center hidden sm:table-cell">W</TableHead>
                <TableHead className="text-center hidden sm:table-cell">L</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Win%</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allPlayers.map((player) => {
                const winRate = player.matchesPlayed > 0
                  ? Math.round((player.wins / player.matchesPlayed) * 100)
                  : 0;
                return (
                  <TableRow key={player.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{player.name}</p>
                        {player.nickname && (
                          <p className="text-xs text-ink-3">{player.nickname}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{Math.round(player.eloRating)}</Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm hidden sm:table-cell">{player.matchesPlayed}</TableCell>
                    <TableCell className="text-center text-sm text-win font-medium hidden sm:table-cell">{player.wins}</TableCell>
                    <TableCell className="text-center text-sm text-loss font-medium hidden sm:table-cell">{player.losses}</TableCell>
                    <TableCell className="text-center text-sm hidden sm:table-cell">{winRate}%</TableCell>
                    <TableCell>
                      <div className="flex gap-2 justify-end">
                        <Link href={`/admin/players/${player.id}/edit`}>
                          <Button variant="ghost" size="sm">Editar</Button>
                        </Link>
                        <DeletePlayerButton id={player.id} name={player.name} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
