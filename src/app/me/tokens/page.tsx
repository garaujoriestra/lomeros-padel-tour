import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { resolvePageContext } from '@/lib/auth/page-context';
import { TokensBody } from '@/components/pages/tokens-body';

export const dynamic = 'force-dynamic';

export default async function TokensPage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/me/tokens');
  const ctx = await resolvePageContext();
  if (!ctx.player) redirect('/me');

  return <TokensBody ctx={ctx} />;
}
