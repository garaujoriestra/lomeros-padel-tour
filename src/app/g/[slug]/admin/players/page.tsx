import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminPlayersBody } from '@/components/pages/admin-players-body';

export const dynamic = 'force-dynamic';

export default async function GroupAdminPlayersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  return <AdminPlayersBody ctx={ctx} />;
}
