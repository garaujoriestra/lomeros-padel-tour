import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { resolvePageContext } from '@/lib/auth/page-context';
import { TokensBody } from '@/components/pages/tokens-body';

export const dynamic = 'force-dynamic';

export default async function GroupTokensPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?from=/g/${slug}/me/tokens`);
  const ctx = await resolvePageContext(slug);
  if (!ctx.player) redirect(`${ctx.basePath}/me`);

  return <TokensBody ctx={ctx} />;
}
