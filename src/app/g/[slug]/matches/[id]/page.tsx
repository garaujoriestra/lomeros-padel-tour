import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { matchSets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { getMatchInGroup } from '@/lib/matches/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { resolvePageContext } from '@/lib/auth/page-context';
import { MatchDetailBody } from '@/components/pages/match-detail-body';

export const dynamic = 'force-dynamic';

// Réplica del generateMetadata de la raíz, resolviendo el grupo directamente por
// slug (sin pasar por resolvePageContext, que además dispararía notFound() aquí
// en metadata — Next no lo permite de forma fiable en esta fase).
export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }): Promise<Metadata> {
  const { slug, id } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) return { title: 'Partido no encontrado · LPT' };

  const match = await getMatchInGroup(group.id, id);
  if (!match) {
    return { title: 'Partido no encontrado · LPT' };
  }
  const allPlayers = await listAllPlayersInGroup(group.id);
  const pMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

  const t1 = `${pMap[match.team1Player1Id]?.name ?? '?'}/${pMap[match.team1Player2Id]?.name ?? '?'}`;
  const t2 = `${pMap[match.team2Player1Id]?.name ?? '?'}/${pMap[match.team2Player2Id]?.name ?? '?'}`;

  if (match.status === 'completed') {
    const sets = await db
      .select()
      .from(matchSets)
      .where(eq(matchSets.matchId, id))
      .then((s) => s.sort((a, b) => a.setNumber - b.setNumber));
    const setsStr = sets.map((s) => `${s.team1Games}-${s.team2Games}`).join(' / ');
    const description = `Resultado del partido del ${match.date}${match.location ? ` en ${match.location}` : ''}.`;
    return {
      title: `${t1} vs ${t2} · ${setsStr} — ${group.name}`,
      description,
      openGraph: {
        title: `${t1} vs ${t2} · ${setsStr}`,
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
      title: `${t1} vs ${t2} · 🤕 No terminado — ${group.name}`,
      description,
      openGraph: {
        title: `${t1} vs ${t2} · No terminado por lesión`,
        description,
      },
    };
  }

  const description = `Partido programado${match.location ? ` en ${match.location}` : ''}.`;
  return {
    title: `${t1} vs ${t2} · ${match.date} — ${group.name}`,
    description,
    openGraph: {
      title: `${t1} vs ${t2} · ${match.date}`,
      description,
    },
  };
}

export default async function GroupMatchDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await resolvePageContext(slug);
  return <MatchDetailBody ctx={ctx} matchId={id} />;
}
