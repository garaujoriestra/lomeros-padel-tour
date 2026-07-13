import { resolvePageContext } from '@/lib/auth/page-context';
import { RankingsPairsBody } from '@/components/pages/rankings-pairs-body';

export const dynamic = 'force-dynamic';

export default async function PairsRankingPage() {
  const ctx = await resolvePageContext();
  return <RankingsPairsBody ctx={ctx} />;
}
