import type { Metadata } from 'next';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { buildMatchMetadata } from '@/lib/matches/metadata';
import { resolvePageContext } from '@/lib/auth/page-context';
import { MatchDetailBody } from '@/components/pages/match-detail-body';

export const dynamic = 'force-dynamic';

// Raíz = grupo por defecto, con la marca de siempre ('LPT') en el título.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const groupId = await getDefaultGroupId();
  return buildMatchMetadata(groupId, 'LPT', id);
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolvePageContext();
  return <MatchDetailBody ctx={ctx} matchId={id} />;
}
