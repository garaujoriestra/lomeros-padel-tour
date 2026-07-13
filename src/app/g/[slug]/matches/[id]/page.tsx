import type { Metadata } from 'next';
import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { buildMatchMetadata } from '@/lib/matches/metadata';
import { resolvePageContext } from '@/lib/auth/page-context';
import { MatchDetailBody } from '@/components/pages/match-detail-body';

export const dynamic = 'force-dynamic';

// Réplica del generateMetadata de la raíz (vía buildMatchMetadata), resolviendo el
// grupo directamente por slug (sin pasar por resolvePageContext, que además
// dispararía notFound() aquí en metadata — Next no lo permite de forma fiable en
// esta fase). Marca del título = nombre del grupo.
export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }): Promise<Metadata> {
  const { slug, id } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) return { title: 'Partido no encontrado · LPT' };
  return buildMatchMetadata(group.id, group.name, id);
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
