import { resolvePageContext } from '@/lib/auth/page-context';
import { RankingsPairsBody } from '@/components/pages/rankings-pairs-body';

export const dynamic = 'force-dynamic';

export default async function GroupPairsRankingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  return <RankingsPairsBody ctx={ctx} />;
}
