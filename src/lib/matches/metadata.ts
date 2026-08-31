import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { matchSets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getMatchInGroup } from '@/lib/matches/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { isPlayed } from '@/lib/matches/outcome';

// Metadata del detalle de partido, compartida entre la raíz (/matches/[id],
// brand 'LPT') y las páginas de grupo (/g/[slug]/matches/[id], brand =
// group.name). Solo cambian el grupo donde se busca el partido y el sufijo
// del título; el resto (resultado / lesión / programado) es idéntico.
export async function buildMatchMetadata(
  groupId: string,
  brand: string,
  matchId: string,
): Promise<Metadata> {
  const match = await getMatchInGroup(groupId, matchId);
  if (!match) {
    return { title: 'Partido no encontrado · LPT' };
  }
  const allPlayers = await listAllPlayersInGroup(groupId);
  const pMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const t1 = `${pMap[match.team1Player1Id]?.name ?? '?'}/${pMap[match.team1Player2Id]?.name ?? '?'}`;
  const t2 = `${pMap[match.team2Player1Id]?.name ?? '?'}/${pMap[match.team2Player2Id]?.name ?? '?'}`;

  if (isPlayed(match)) {
    const sets = await db
      .select()
      .from(matchSets)
      .where(eq(matchSets.matchId, matchId))
      .then((s) => s.sort((a, b) => a.setNumber - b.setNumber));
    const setsStr = sets.map((s) => `${s.team1Games}-${s.team2Games}`).join(' / ');
    const isDrawMatch = match.status === 'draw';
    const description = isDrawMatch
      ? `El partido del ${match.date}${match.location ? ` en ${match.location}` : ''} acabó en empate a un set.`
      : `Resultado del partido del ${match.date}${match.location ? ` en ${match.location}` : ''}.`;
    const scorePart = isDrawMatch ? `🤝 Empate · ${setsStr}` : setsStr;
    return {
      title: `${t1} vs ${t2} · ${scorePart} — ${brand}`,
      description,
      openGraph: {
        title: `${t1} vs ${t2} · ${scorePart}`,
        description,
      },
    };
  }

  if (match.status === 'injury_aborted') {
    const injured = match.injuredPlayerId ? pMap[match.injuredPlayerId]?.name : null;
    const description = injured
      ? `Partido del ${match.date} no completado por lesión de ${injured}.`
      : `Partido del ${match.date} no completado por lesión.`;
    return {
      title: `${t1} vs ${t2} · 🤕 No terminado — ${brand}`,
      description,
      openGraph: {
        title: `${t1} vs ${t2} · No terminado por lesión`,
        description,
      },
    };
  }

  const description = `Partido programado${match.location ? ` en ${match.location}` : ''}.`;
  return {
    title: `${t1} vs ${t2} · ${match.date} — ${brand}`,
    description,
    openGraph: {
      title: `${t1} vs ${t2} · ${match.date}`,
      description,
    },
  };
}
