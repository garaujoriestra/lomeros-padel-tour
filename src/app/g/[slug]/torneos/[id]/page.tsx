import { resolvePageContext } from '@/lib/auth/page-context';
import { TorneoPublicBody } from '@/components/pages/torneo-public-body';

export const dynamic = 'force-dynamic';

export default async function GroupTorneoPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await resolvePageContext(slug);
  return <TorneoPublicBody ctx={ctx} tournamentId={id} />;
}
