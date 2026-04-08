import Link from 'next/link';
import { db } from '@/lib/db';
import { players, matches } from '@/lib/db/schema';
import { sql, desc } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const [playerCount, matchCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(players),
    db.select({ count: sql<number>`count(*)` }).from(matches),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Panel de Administración</h1>
        <p className="text-gray-500 text-sm mt-1">Gestiona jugadores y partidos</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Jugadores</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{playerCount[0].count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Partidos jugados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{matchCount[0].count}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Link href="/admin/players/new">
          <Button>👤 Añadir jugador</Button>
        </Link>
        <Link href="/admin/matches/new">
          <Button variant="outline">🎾 Registrar partido</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acciones rápidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p>👉 Ve a <Link href="/admin/players" className="text-green-700 font-medium hover:underline">Jugadores</Link> para gestionar el equipo.</p>
          <p>👉 Ve a <Link href="/admin/matches" className="text-green-700 font-medium hover:underline">Partidos</Link> para ver o registrar resultados.</p>
          <p>👉 Visita el <Link href="/" className="text-green-700 font-medium hover:underline">Dashboard público</Link> para ver rankings y estadísticas.</p>
        </CardContent>
      </Card>
    </div>
  );
}
