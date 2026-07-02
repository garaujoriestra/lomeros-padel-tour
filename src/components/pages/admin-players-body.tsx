import { listPlayersByElo } from '@/lib/players/queries';
import Link from 'next/link';
import { Pencil, UserPlus } from 'lucide-react';
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
import { DeletePlayerButton } from '@/app/admin/players/delete-player-button';
import type { PageContext } from '@/lib/auth/page-context';

// Cuerpo compartido de /admin/players (raíz) y /g/[slug]/admin/players.
// Bajo grupo: alta/edición ocultas (sub-rutas diferidas del MVP); el borrado
// funciona vía API group-aware con ?g= explícito.
export async function AdminPlayersBody({ ctx }: { ctx: PageContext }) {
  const { groupId, basePath } = ctx;
  const isRoot = basePath === '';
  const gSlug = isRoot ? undefined : ctx.group.slug;
  const allPlayers = await listPlayersByElo(groupId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="sec-title">Jugadores</h1>
          <p className="muted text-sm mt-1.5">{allPlayers.length} jugador{allPlayers.length !== 1 ? 'es' : ''} registrado{allPlayers.length !== 1 ? 's' : ''}</p>
        </div>
        {isRoot && (
          <Link href="/admin/players/new" className="lpt-btn primary shrink-0" style={{ minHeight: 38, padding: '7px 13px', fontSize: 12.5 }}>
            <UserPlus size={15} /> Nuevo
          </Link>
        )}
      </div>

      {allPlayers.length === 0 ? (
        <div className="text-center py-12 text-ink-3">
          <p className="text-4xl mb-2">👤</p>
          <p>No hay jugadores todavía.</p>
          {isRoot && (
            <Link href="/admin/players/new">
              <Button className="mt-4">Añadir el primero</Button>
            </Link>
          )}
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
                      <div className="flex gap-1 justify-end">
                        {isRoot && (
                          <Link href={`/admin/players/${player.id}/edit`} aria-label={`Editar a ${player.name}`}>
                            <Button variant="ghost" size="sm"><Pencil size={16} /></Button>
                          </Link>
                        )}
                        <DeletePlayerButton id={player.id} name={player.name} g={gSlug} />
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
