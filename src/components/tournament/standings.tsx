import { db } from '@/lib/db';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { getPozoStandings, getGroupStandings } from '@/lib/tournament/results';

export async function PozoStandings({ blockId, playerName }: { blockId: string; playerName: Map<string, string> }) {
  const rows = await getPozoStandings(db, blockId);
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Clasificación</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Jugador</TableHead>
            <TableHead className="text-center">Juegos</TableHead>
            <TableHead className="text-center">Victorias</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.participantId}>
              <TableCell>{r.rank}</TableCell>
              <TableCell>{playerName.get(r.participantId) ?? '—'}</TableCell>
              <TableCell className="text-center">{r.games}</TableCell>
              <TableCell className="text-center">{r.wins}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export async function GroupStandingsTables({ blockId, pairLabel }: { blockId: string; pairLabel: Map<string, string> }) {
  const tables = await getGroupStandings(db, blockId);
  const names = Object.keys(tables);
  if (names.length === 0) return null;
  return (
    <div className="space-y-3">
      {names.map((g) => (
        <div key={g}>
          <h3 className="text-sm font-semibold mb-2">Grupo {g}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Pareja</TableHead>
                <TableHead className="text-center">PJ</TableHead>
                <TableHead className="text-center">Pts</TableHead>
                <TableHead className="text-center">Dif</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables[g].map((r) => (
                <TableRow key={r.pairId}>
                  <TableCell>{r.rank}</TableCell>
                  <TableCell>{pairLabel.get(r.pairId) ?? '—'}</TableCell>
                  <TableCell className="text-center">{r.played}</TableCell>
                  <TableCell className="text-center">{r.points}</TableCell>
                  <TableCell className="text-center">{r.gameDiff}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
