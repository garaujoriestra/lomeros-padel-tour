import { resolvePageContext } from '@/lib/auth/page-context';
import { TorneoPublicBody } from '@/components/pages/torneo-public-body';

export const dynamic = 'force-dynamic';

export default async function PublicTorneoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolvePageContext();
  return <TorneoPublicBody ctx={ctx} tournamentId={id} />;
}
