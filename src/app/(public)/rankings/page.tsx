import { resolvePageContext } from '@/lib/auth/page-context';
import { RankingsBody } from '@/components/pages/rankings-body';

export const dynamic = 'force-dynamic';

export default async function RankingsPage() {
  const ctx = await resolvePageContext();
  return <RankingsBody ctx={ctx} />;
}
