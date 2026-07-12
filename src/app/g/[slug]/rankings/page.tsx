import { resolvePageContext } from '@/lib/auth/page-context';
import { RankingsBody } from '@/components/pages/rankings-body';

export const dynamic = 'force-dynamic';

export default async function GroupRankingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  return <RankingsBody ctx={ctx} />;
}
